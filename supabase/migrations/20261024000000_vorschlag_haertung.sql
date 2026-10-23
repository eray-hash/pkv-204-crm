-- VORSCHLAG (noch NICHT ausgefuehrt): Haertung der Rechte fuer das angebundene Frontend.
-- Bitte pruefen und erst dann einspielen (`supabase db push` oder SQL-Editor).

-- 1) Eingeloggte Nutzer duerfen bei Leads bisher JEDE Spalte aendern (Name, Telefon, Tarifbeitrag, ...),
--    weil die Policy leads_update nur zeilenweise prueft. Das Frontend aendert ausschliesslich
--    status und naechster_anruf_ab. Spaltenrechte beschraenken das auf das Noetige.
--    (zugewiesen_an bleibt fuer eine spaetere Zuweisung durch Mitarbeiter/Geschaeftsfuehrer aenderbar.)
revoke update on public.leads from authenticated;
grant update (status, naechster_anruf_ab, zugewiesen_an) on public.leads to authenticated;

-- 2) Fremdschluessel-Spalten haben in Postgres keinen automatischen Index. Notizen und Anrufe werden
--    im CRM immer pro Lead geladen.
create index if not exists lead_notizen_lead_idx on public.lead_notizen (lead_id, created_at desc);
create index if not exists anrufe_lead_idx on public.anrufe (lead_id, gestartet_am desc);
create index if not exists anrufe_user_idx on public.anrufe (user_id, gestartet_am desc);
