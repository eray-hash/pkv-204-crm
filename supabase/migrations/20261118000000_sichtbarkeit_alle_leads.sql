-- Sichtbarkeit "Option A" (18.11.2026). Nur Datei, noch NICHT ausgefuehrt; wiederholbar.
-- Voraussetzung: 20261103000200_qa_nachpruefung.sql (und 20261103000100_status_zeitpunkt.sql). Kommentare ohne Umlaute wie in den anderen Migrationen.
--
-- Vorgabe: Alle Mitarbeiter sehen alle Leads. Freie Leads kann jeder uebernehmen. Ein Lead, der einem Kollegen gehoert, ist fuer andere
-- nur zum Ansehen da; uebernehmen/umhaengen darf ihn nur der Geschaeftsfuehrer. Aendern, anrufen und schreiben bleibt beim Besitzer (und beim GF).
--
-- Was sich aendert:   leads_select und lead_einwilligung (alle Leads ausser Testleads; Testleads nur der Geschaeftsfuehrer),
--                     anrufbare_leads (bleibt auf freie und eigene Leads beschraenkt, weil die Policy jetzt mehr zeigt).
-- Was bewusst bleibt: leads_update, notizen_insert, anrufe_insert, lead_uebernehmen(_fuer), lead_freigeben, lead_zuweisen, lead_sperren,
--                     darf_angerufen_werden, anruf_reservieren, consent_records-Rechte (siehe README).

-- =====================================================================================================
-- 1) Leads: alle Leads ausser Testleads sichtbar, der Geschaeftsfuehrer sieht alles
-- =====================================================================================================
-- Gesperrte und abgeschlossene Leads sind sichtbar (mit Sperrvermerk), bleiben aber nicht uebernehmbar und nicht anrufbar
-- (lead_uebernehmen_fuer verlangt gesperrt_am is null und einen uebernehmbaren Status, darf_angerufen_werden prueft die Sperre).
-- Realtime folgt dieser Policy: Aenderungen an Leads von Kollegen kommen damit bei allen an.
drop policy if exists leads_select on public.leads;
create policy leads_select on public.leads for select to authenticated
  using (ist_test = false or (select public.ist_geschaeftsfuehrer()));

-- =====================================================================================================
-- 2) Einwilligungsnachweis (ohne IP): gleiche Regel wie die Leads-Policy
-- =====================================================================================================
create or replace function public.lead_einwilligung(p_lead_id uuid)
returns table (einwilligung_zeit timestamptz, einwilligung_text text, einwilligung_quelle text)
language sql stable security definer set search_path = '' as $$
  select c.einwilligung_zeit, c.einwilligung_text, c.einwilligung_quelle
    from public.consent_records c
    join public.leads l on l.id = c.lead_id
   where c.lead_id = p_lead_id
     and (l.ist_test = false or (select public.ist_geschaeftsfuehrer()));
$$;

-- =====================================================================================================
-- 3) Power Dialer: weiter nur freie und eigene Leads
-- =====================================================================================================
-- Die Ansicht laeuft mit den Rechten des Aufrufers (security_invoker). Weil leads_select jetzt alle Leads zeigt, muss die Ansicht die
-- Leads von Kollegen selbst ausschliessen: der Dialer arbeitet nur mit freien und eigenen Leads (auch fuer den Geschaeftsfuehrer).
-- Spalten und Rechte bleiben unveraendert (create or replace).
create or replace view public.anrufbare_leads with (security_invoker = true) as
select l.*
  from public.leads l
 where public.darf_angerufen_werden(l.id)
   and l.status = any (public.uebernehmbare_status())
   and (l.zugewiesen_an is null or l.zugewiesen_an = (select auth.uid()))
   and (l.naechster_anruf_ab is null or l.naechster_anruf_ab <= now());

-- =====================================================================================================
-- 4) Rechte der geaenderten Objekte (create or replace behaelt sie; zur Sicherheit erneut)
-- =====================================================================================================
revoke execute on function public.lead_einwilligung(uuid) from public, anon;
grant execute on function public.lead_einwilligung(uuid) to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.anrufbare_leads from anon, authenticated;
revoke all on public.anrufbare_leads from anon;
grant select on public.anrufbare_leads to authenticated;
