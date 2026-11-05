-- QA-Nachpruefung (Runde 3, 03.11.2026). Nur Datei, noch NICHT ausgefuehrt; wiederholbar.
-- Voraussetzung: 20261103000000_qa_haertung.sql (und 20261103000100_status_zeitpunkt.sql). Kommentare ohne Umlaute wie in den anderen Migrationen.

-- =====================================================================================================
-- 1) Geschuetzte Status: auch verloren und gewonnen (M4)
-- =====================================================================================================
-- Ein Nicht-Geschaeftsfuehrer darf Leads weiter auf verloren/gewonnen SETZEN (normaler Abschluss), aber nicht mehr zurueckdrehen.
create or replace function public.geschuetzte_status() returns text[]
language sql immutable set search_path = '' as $$
  select array['verstorben', 'nicht_mehr_pkv', 'kein_interesse', 'schon_umgestellt', 'verloren', 'gewonnen']::text[]
$$;

-- =====================================================================================================
-- 2) Uebernahme: Obergrenze zaehlt alle offenen eigenen Leads (M5); Fehlercode PT429 (N3)
-- =====================================================================================================
create or replace function public.lead_uebernehmen_fuer(p_lead_id uuid, p_user_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_rows integer;
  v_offen integer;
  v_besitzer uuid;
  v_vorhanden boolean;
begin
  if p_user_id is null then
    return 'nicht_angemeldet';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  select zugewiesen_an, true into v_besitzer, v_vorhanden from public.leads where id = p_lead_id;
  if not coalesce(v_vorhanden, false) then
    return 'nicht_gefunden';
  end if;
  if v_besitzer = p_user_id then
    return 'eigen';
  end if;
  if v_besitzer is not null then
    return 'vergeben';
  end if;

  -- Obergrenze: alle OFFENEN eigenen Leads (auch termin_vereinbart und beratung)
  select count(*) into v_offen from public.leads
   where zugewiesen_an = p_user_id and ist_test = false and status = any (public.offene_status());
  if v_offen >= public.max_offene_eigene_leads() then
    return 'limit';
  end if;

  update public.leads
     set zugewiesen_an = p_user_id, zugewiesen_von = p_user_id, uebernommen_am = now()
   where id = p_lead_id
     and zugewiesen_an is null
     and ist_test = false
     and gesperrt_am is null
     and status = any (public.uebernehmbare_status());
  get diagnostics v_rows = row_count;
  if v_rows > 0 then
    return 'ok';
  end if;
  select zugewiesen_an into v_besitzer from public.leads where id = p_lead_id;
  return case when v_besitzer is not null then 'vergeben' else 'nicht_uebernehmbar' end;
end $$;

-- Obergrenze erreicht: SQLSTATE PT429 (PostgREST liefert daraus HTTP 429; die Meldung beginnt mit "limit_offene_leads")
create or replace function public.lead_uebernehmen(p_lead_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_ergebnis text;
begin
  if (select auth.uid()) is null then
    return false;
  end if;
  v_ergebnis := public.lead_uebernehmen_fuer(p_lead_id, (select auth.uid()));
  if v_ergebnis = 'limit' then
    raise exception 'limit_offene_leads: Obergrenze fuer offene eigene Leads erreicht' using errcode = 'PT429';
  end if;
  return v_ergebnis = 'ok';
end $$;

-- =====================================================================================================
-- 3) Sichtbarkeit: freie Leads nur, wenn sie uebernehmbar sind (M6)
-- =====================================================================================================
-- Mitarbeiter sehen freie Leads nur in uebernehmbarem Status (neu/kontaktiert/nicht_erreicht), nicht gesperrt, kein Testlead;
-- eigene Leads und die Sicht des Geschaeftsfuehrers bleiben unveraendert. Notizen/Anrufe folgen ueber die Leads-Policy.
drop policy if exists leads_select on public.leads;
create policy leads_select on public.leads for select to authenticated
  using (
    (zugewiesen_an is null and status = any (public.uebernehmbare_status()) and gesperrt_am is null and ist_test = false)
    or zugewiesen_an = (select auth.uid())
    or (select public.ist_geschaeftsfuehrer())
  );

-- Einwilligungsnachweis (ohne IP) fuer Leads, die der Aufrufer sehen darf: gleiche Regel wie die Leads-Policy
create or replace function public.lead_einwilligung(p_lead_id uuid)
returns table (einwilligung_zeit timestamptz, einwilligung_text text, einwilligung_quelle text)
language sql stable security definer set search_path = '' as $$
  select c.einwilligung_zeit, c.einwilligung_text, c.einwilligung_quelle
    from public.consent_records c
    join public.leads l on l.id = c.lead_id
   where c.lead_id = p_lead_id
     and (
       (l.zugewiesen_an is null and l.status = any (public.uebernehmbare_status()) and l.gesperrt_am is null and l.ist_test = false)
       or l.zugewiesen_an = (select auth.uid())
       or (select public.ist_geschaeftsfuehrer())
     );
$$;

-- Notizen duerfen weiter zu freien Leads geschrieben werden, die man sehen darf (Policy-Unterabfrage unterliegt der Leads-Policy)
drop policy if exists notizen_insert on public.lead_notizen;
create policy notizen_insert on public.lead_notizen for insert to authenticated
  with check (
    lead_notizen.user_id = (select auth.uid())
    and exists (
      select 1 from public.leads l
      where l.id = lead_notizen.lead_id
        and (l.zugewiesen_an = (select auth.uid()) or (select public.ist_geschaeftsfuehrer()) or l.zugewiesen_an is null)
    )
  );

-- =====================================================================================================
-- 4) Sperre: auch fuer FREIE, nicht gesperrte Leads ohne Uebernahme (M2); gleiche Statuslogik fuer Mit-Sperren (N1)
-- =====================================================================================================
create or replace function public.lead_sperren(p_lead_id uuid, p_grund text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_lead record;
  v_grund text := left(coalesce(nullif(btrim(p_grund), ''), 'Ohne Angabe'), 500);
begin
  if v_uid is null then
    return false;
  end if;
  select id, telefon, status, zugewiesen_an, gesperrt_am into v_lead from public.leads where id = p_lead_id;
  if not found then
    return false;
  end if;
  -- Frei und noch nicht gesperrt: jeder angemeldete Nutzer. Zugewiesen (oder schon gesperrt): nur Besitzer oder Geschaeftsfuehrer.
  if not (v_lead.zugewiesen_an is null and v_lead.gesperrt_am is null)
     and v_lead.zugewiesen_an is distinct from v_uid
     and not (select public.ist_geschaeftsfuehrer()) then
    raise exception 'Nur der Besitzer oder der Geschaeftsfuehrer darf diesen Lead sperren.' using errcode = '42501';
  end if;

  update public.leads
     set gesperrt_am = coalesce(gesperrt_am, now()),
         sperrgrund = coalesce(sperrgrund, v_grund),
         -- offene Leads werden geschlossen (kein_interesse); geschuetzte Status bleiben, ebenso schon gesperrte Leads
         status = case when gesperrt_am is null and status <> all (public.geschuetzte_status()) then 'kein_interesse' else status end
   where id = p_lead_id;

  insert into public.sperrliste (telefon, grund, gesperrt_von)
  values (v_lead.telefon, v_grund, v_uid)
  on conflict (telefon) do nothing;

  -- Weitere Leads mit derselben Nummer: gleiche Logik
  update public.leads
     set gesperrt_am = now(),
         sperrgrund = coalesce(sperrgrund, 'Rufnummer gesperrt (anderer Lead)'),
         status = case when status <> all (public.geschuetzte_status()) then 'kein_interesse' else status end
   where telefon = v_lead.telefon and gesperrt_am is null and id <> p_lead_id;

  return true;
end $$;

-- =====================================================================================================
-- 5) Anruf-Trigger: zuerst die Identitaet pruefen (N2), Fehlercode PT429 (N3)
-- =====================================================================================================
create or replace function public.anrufe_limit_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_grund text;
begin
  if (select auth.uid()) is null then
    return new; -- service_role/SQL-Editor: die Edge Function prueft die Limits ueber anruf_reservieren selbst
  end if;
  -- Zuerst: nur fuer sich selbst protokollieren. Sonst keine Auskunft ueber fremde Anrufe (Limits) geben.
  if new.user_id is distinct from (select auth.uid()) then
    raise exception 'Anrufe duerfen nur fuer den eigenen Benutzer protokolliert werden.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('anruf:' || new.user_id::text, 0));
  v_grund := public.anruf_limit_grund(new.lead_id, new.user_id);
  if v_grund is not null then
    raise exception 'anruf_limit:%', v_grund using errcode = 'PT429';
  end if;
  return new;
end $$;

-- =====================================================================================================
-- 6) Rechte an der Ansicht anrufbare_leads (N11)
-- =====================================================================================================
revoke insert, update, delete, truncate, references, trigger on public.anrufbare_leads from anon, authenticated;
revoke all on public.anrufbare_leads from anon;
grant select on public.anrufbare_leads to authenticated;

-- =====================================================================================================
-- 7) Daten-Normalisierung: "+490..." -> "+49..." (M3), vorsichtig und wiederholbar
-- =====================================================================================================
-- Sperrliste: bei Schluesselkonflikt bleibt der AELTERE Eintrag
delete from public.sperrliste t
 using public.sperrliste s
 where s.telefon ~ '^\+490[1-9]'
   and t.telefon = regexp_replace(s.telefon, '^\+490', '+49')
   and s.gesperrt_am < t.gesperrt_am;           -- der bereinigte Eintrag t ist juenger: s bleibt (wird gleich umbenannt)
delete from public.sperrliste s
 using public.sperrliste t
 where s.telefon ~ '^\+490[1-9]'
   and t.telefon = regexp_replace(s.telefon, '^\+490', '+49'); -- t ist aelter oder gleich alt: s entfaellt
update public.sperrliste set telefon = regexp_replace(telefon, '^\+490', '+49') where telefon ~ '^\+490[1-9]';

-- Leads: updated_at bleibt unveraendert (Trigger kurz aus), der Statuswaechter greift nur bei Statuswechseln
alter table public.leads disable trigger leads_set_updated_at;
update public.leads set telefon = regexp_replace(telefon, '^\+490', '+49') where telefon ~ '^\+490[1-9]';
alter table public.leads enable trigger leads_set_updated_at;

-- =====================================================================================================
-- 8) Grants der geaenderten/neu erstellten Funktionen (create or replace behaelt die Rechte, hier zur Sicherheit erneut)
-- =====================================================================================================
revoke execute on function public.geschuetzte_status() from public, anon;
grant execute on function public.geschuetzte_status() to authenticated, service_role;
revoke execute on function public.lead_uebernehmen_fuer(uuid, uuid) from public, anon, authenticated;
grant execute on function public.lead_uebernehmen_fuer(uuid, uuid) to service_role;
revoke execute on function public.lead_uebernehmen(uuid) from public, anon;
grant execute on function public.lead_uebernehmen(uuid) to authenticated;
revoke execute on function public.lead_einwilligung(uuid) from public, anon;
grant execute on function public.lead_einwilligung(uuid) to authenticated;
revoke execute on function public.lead_sperren(uuid, text) from public, anon;
grant execute on function public.lead_sperren(uuid, text) to authenticated;
revoke execute on function public.anrufe_limit_guard() from public, anon, authenticated;
