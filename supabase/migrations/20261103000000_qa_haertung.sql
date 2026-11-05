-- QA-Haertung (Runde 1, 03.11.2026). Nur Datei, noch NICHT ausgefuehrt. Im SQL-Editor ausfuehrbar und wiederholbar
-- (create or replace / if not exists / drop ... if exists); bestehende Daten bleiben unveraendert.
--
-- Voraussetzungen (muessen vorher eingespielt sein): init, auth_profile_trigger, telefonie, verteilung
-- (ist_geschaeftsfuehrer(), leads.zugewiesen_von/uebernommen_am). 20261030000100 und 20261102000000 sind NICHT noetig.
--
-- Inhalt:
--   0) Konstanten als kleine Funktionen   1) neue Spalten/Tabellen   2) zentrale Pruefungen und Funktionen
--   3) Trigger   4) Row Level Security   5) Rechte (Grants)   6) Aufraeum-Hinweise
-- Kommentare bewusst ohne Umlaute (wie in den anderen Migrationen).

-- =====================================================================================================
-- 0) Konstanten (eine Stelle fuer Werte, die View, Funktionen und Edge Functions gemeinsam nutzen)
-- =====================================================================================================

-- Maximales Alter einer Einwilligung. ACHTUNG: Der Wert (365 Tage) ist ein Platzhalter und muss anwaltlich geklaert werden.
create or replace function public.einwilligung_max_alter() returns interval
language sql immutable set search_path = '' as $$ select interval '365 days' $$;

-- Obergrenze offener eigener Leads (neu/kontaktiert/nicht_erreicht), die jemand per "Uebernehmen" halten darf.
create or replace function public.max_offene_eigene_leads() returns integer
language sql immutable set search_path = '' as $$ select 50 $$;

-- Status, in denen ein FREIER Lead per Mitarbeiter uebernommen und im Power Dialer angeboten wird.
-- (termin_vereinbart/beratung weist nur der Geschaeftsfuehrer zu.) Gleiche Liste: Edge Function anrufen, Frontend UEBERNAHME_STATUS.
create or replace function public.uebernehmbare_status() returns text[]
language sql immutable set search_path = '' as $$ select array['neu', 'kontaktiert', 'nicht_erreicht']::text[] $$;

-- Offene Status: der Lead darf (vom Besitzer) angerufen werden.
create or replace function public.offene_status() returns text[]
language sql immutable set search_path = '' as $$ select array['neu', 'kontaktiert', 'nicht_erreicht', 'termin_vereinbart', 'beratung']::text[] $$;

-- Abgeschlossene Status, aus denen ein Nicht-Geschaeftsfuehrer den Lead nicht wieder herausholen darf (Statuswaechter).
create or replace function public.geschuetzte_status() returns text[]
language sql immutable set search_path = '' as $$ select array['verstorben', 'nicht_mehr_pkv', 'kein_interesse', 'schon_umgestellt']::text[] $$;

-- =====================================================================================================
-- 1) Neue Spalten und Tabellen
-- =====================================================================================================

-- Sperre / Widerruf am Lead
alter table public.leads
  add column if not exists gesperrt_am timestamptz,
  add column if not exists sperrgrund text;

-- Sperrliste: Rufnummern, die nie (wieder) angerufen werden duerfen. Nur Geschaeftsfuehrer lesbar, Schreiben nur ueber Funktionen.
create table if not exists public.sperrliste (
  telefon text primary key,
  grund text,
  gesperrt_am timestamptz not null default now(),
  gesperrt_von uuid references public.profiles(id) on delete set null
);
alter table public.sperrliste enable row level security;

-- Einwilligungsnachweis: zusaetzliche Belege
alter table public.consent_records
  add column if not exists text_sha256 text,
  add column if not exists payload_roh jsonb,
  add column if not exists einwilligung_version text,
  add column if not exists kanal text,
  add column if not exists begunstigter text,
  add column if not exists user_agent text,
  add column if not exists rufnummer_verifiziert boolean;

-- Bestehende Nachweise nachtraeglich mit Pruefsumme versehen (vor dem Unveraenderlichkeits-Trigger; bei Wiederholung ohne Wirkung)
update public.consent_records
   set text_sha256 = encode(extensions.digest(einwilligung_text, 'sha256'), 'hex')
 where text_sha256 is null;

-- Nachweis darf nicht mit dem Lead verschwinden: "on delete restrict" statt "cascade"
alter table public.consent_records drop constraint if exists consent_records_lead_id_fkey;
alter table public.consent_records
  add constraint consent_records_lead_id_fkey foreign key (lead_id) references public.leads(id) on delete restrict;

-- Passwort-Protokoll (Funktion mitarbeiter-passwort): keine Fremdschluessel, damit das Protokoll nicht mit Nutzern verschwindet;
-- Name und E-Mail werden als Text mitgeschrieben. Enthaelt keine Passwortdaten. Legt die Tabelle an, falls 20261102000000 fehlt.
create table if not exists public.passwort_log (
  id uuid primary key default gen_random_uuid(),
  gesetzt_von uuid not null,
  fuer_nutzer uuid not null,
  zeitpunkt timestamptz not null default now()
);
alter table public.passwort_log drop constraint if exists passwort_log_gesetzt_von_fkey;
alter table public.passwort_log drop constraint if exists passwort_log_fuer_nutzer_fkey;
alter table public.passwort_log
  add column if not exists gesetzt_von_name text,
  add column if not exists gesetzt_von_email text,
  add column if not exists fuer_nutzer_name text,
  add column if not exists fuer_nutzer_email text;
alter table public.passwort_log enable row level security;
create index if not exists passwort_log_zeitpunkt_idx on public.passwort_log (zeitpunkt desc);

-- =====================================================================================================
-- 2) Zentrale Pruefungen und Funktionen
-- =====================================================================================================

-- Darf der Lead JETZT angerufen werden? Einwilligung vorhanden und nicht zu alt, nicht gesperrt (Lead und Rufnummer),
-- kein Testlead, Status offen. security definer, damit auch Nutzer ohne Leserecht auf consent_records die Antwort bekommen.
create or replace function public.darf_angerufen_werden(p_lead_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
      from public.leads l
      join public.consent_records c on c.lead_id = l.id
     where l.id = p_lead_id
       and l.ist_test = false
       and l.gesperrt_am is null
       and l.status = any (public.offene_status())
       and c.einwilligung_zeit >= now() - public.einwilligung_max_alter()
       and not exists (select 1 from public.sperrliste s where s.telefon = l.telefon)
  );
$$;

-- Einwilligungsnachweis OHNE IP-Adresse fuer Leads, die der Aufrufer sehen darf (frei, eigen oder Geschaeftsfuehrer).
create or replace function public.lead_einwilligung(p_lead_id uuid)
returns table (einwilligung_zeit timestamptz, einwilligung_text text, einwilligung_quelle text)
language sql stable security definer set search_path = '' as $$
  select c.einwilligung_zeit, c.einwilligung_text, c.einwilligung_quelle
    from public.consent_records c
    join public.leads l on l.id = c.lead_id
   where c.lead_id = p_lead_id
     and (l.zugewiesen_an is null or l.zugewiesen_an = (select auth.uid()) or (select public.ist_geschaeftsfuehrer()));
$$;

-- Anrufbare Leads (Power Dialer): zentrale Pruefung + Uebernahme-Status + Wiedervorlage faellig.
-- Neue Spalten (gesperrt_am, sperrgrund) stehen am Ende, daher ist CREATE OR REPLACE erlaubt.
create or replace view public.anrufbare_leads with (security_invoker = true) as
select l.*
  from public.leads l
 where public.darf_angerufen_werden(l.id)
   and l.status = any (public.uebernehmbare_status())
   and (l.naechster_anruf_ab is null or l.naechster_anruf_ab <= now());

-- Atomare Uebernahme eines freien Leads fuer einen Nutzer. Einzige Stelle mit dieser Logik: lead_uebernehmen (Browser, mit
-- auth.uid()) und die Edge Function anrufen (service_role) rufen sie auf. Ergebnis:
--   ok | eigen (gehoert schon dem Nutzer) | vergeben | limit | nicht_uebernehmbar | nicht_gefunden | nicht_angemeldet
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
  -- Gleichzeitige Uebernahmen desselben Nutzers nacheinander abarbeiten, damit die Obergrenze nicht umgangen wird
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

  select count(*) into v_offen from public.leads
   where zugewiesen_an = p_user_id and ist_test = false and status = any (public.uebernehmbare_status());
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
  -- nicht geklappt: inzwischen vergeben oder Status/Sperre erlauben die Uebernahme nicht
  select zugewiesen_an into v_besitzer from public.leads where id = p_lead_id;
  return case when v_besitzer is not null then 'vergeben' else 'nicht_uebernehmbar' end;
end $$;

-- Atomar: nur ein Aufrufer gewinnt. true = DIESER Aufruf hat den Lead uebernommen. Bei erreichter Obergrenze: Fehler 53400.
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
    raise exception 'Obergrenze fuer offene eigene Leads erreicht' using errcode = '53400';
  end if;
  return v_ergebnis = 'ok';
end $$;

-- Pruefung der Anruf-Limits: pro Lead hoechstens 1 Anruf je 10 Minuten, pro Nutzer hoechstens 30 Anrufe je Stunde,
-- pro Nutzer mindestens 3 Sekunden Abstand. Gibt null (ok) oder lead_limit | nutzer_limit | abstand zurueck.
create or replace function public.anruf_limit_grund(p_lead_id uuid, p_user_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when exists (select 1 from public.anrufe where lead_id = p_lead_id and gestartet_am > now() - interval '10 minutes') then 'lead_limit'
    when (select count(*) from public.anrufe where user_id = p_user_id and gestartet_am > now() - interval '1 hour') >= 30 then 'nutzer_limit'
    when exists (select 1 from public.anrufe where user_id = p_user_id and gestartet_am > now() - interval '3 seconds') then 'abstand'
    else null
  end;
$$;

-- Reservierung eines Anrufs (Edge Function anrufen, service_role): prueft die Limits und legt den Protokolleintrag atomar an,
-- BEVOR sipgate angerufen wird. Ergebnis: o_id (Eintrag) oder o_grund (Limit erreicht).
create or replace function public.anruf_reservieren(p_lead_id uuid, p_user_id uuid, p_kanal text, p_anbieter text)
returns table (o_id uuid, o_grund text)
language plpgsql security definer set search_path = '' as $$
declare
  v_grund text;
  v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('anruf:' || p_user_id::text, 0));
  v_grund := public.anruf_limit_grund(p_lead_id, p_user_id);
  if v_grund is not null then
    return query select null::uuid, v_grund;
    return;
  end if;
  insert into public.anrufe (lead_id, user_id, kanal, anbieter)
  values (p_lead_id, p_user_id, p_kanal, p_anbieter)
  returning id into v_id;
  return query select v_id, null::text;
end $$;

-- Sperre / Widerruf: Besitzer oder Geschaeftsfuehrer. Setzt gesperrt_am, schliesst den Lead (kein_interesse, falls noch offen)
-- und traegt die Rufnummer in die Sperrliste ein; weitere Leads mit derselben Nummer werden ebenfalls gesperrt.
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
  select id, telefon, status, zugewiesen_an into v_lead from public.leads where id = p_lead_id;
  if not found then
    return false;
  end if;
  if v_lead.zugewiesen_an is distinct from v_uid and not (select public.ist_geschaeftsfuehrer()) then
    raise exception 'Nur der Besitzer oder der Geschaeftsfuehrer darf einen Lead sperren.' using errcode = '42501';
  end if;

  update public.leads
     set gesperrt_am = coalesce(gesperrt_am, now()),
         sperrgrund = coalesce(sperrgrund, v_grund),
         -- Status nur aendern, wenn der Lead noch nicht gesperrt war und noch offen ist
         status = case
                    when gesperrt_am is null and status <> all (public.geschuetzte_status() || array['verloren', 'gewonnen'])
                    then 'kein_interesse'
                    else status
                  end
   where id = p_lead_id;

  insert into public.sperrliste (telefon, grund, gesperrt_von)
  values (v_lead.telefon, v_grund, v_uid)
  on conflict (telefon) do nothing;

  update public.leads
     set gesperrt_am = coalesce(gesperrt_am, now()), sperrgrund = coalesce(sperrgrund, 'Rufnummer gesperrt (anderer Lead)')
   where telefon = v_lead.telefon and gesperrt_am is null and id <> p_lead_id;

  return true;
end $$;

-- Sperre aufheben: nur Geschaeftsfuehrer. Der Status bleibt unveraendert (der Geschaeftsfuehrer kann ihn anschliessend aendern).
create or replace function public.lead_entsperren(p_lead_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_telefon text;
begin
  if (select auth.uid()) is null or not (select public.ist_geschaeftsfuehrer()) then
    raise exception 'Nur der Geschaeftsfuehrer darf eine Sperre aufheben.' using errcode = '42501';
  end if;
  select telefon into v_telefon from public.leads where id = p_lead_id;
  if v_telefon is null then
    return false;
  end if;
  delete from public.sperrliste where telefon = v_telefon;
  update public.leads set gesperrt_am = null, sperrgrund = null where telefon = v_telefon and gesperrt_am is not null;
  return true;
end $$;

-- Beendet alle Sitzungen eines Nutzers (Edge Function mitarbeiter-passwort, nach dem Setzen eines vorlaeufigen Passworts).
-- Bereits ausgestellte Zugriffstoken (JWT) bleiben bis zu ihrem Ablauf (Standard 1 Stunde) gueltig.
create or replace function public.nutzer_sitzungen_beenden(p_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from auth.sessions where user_id = p_user_id;
  -- Refresh-Tokens haengen per Fremdschluessel an den Sitzungen; Reste (aeltere Auth-Versionen) zusaetzlich loeschen
  delete from auth.refresh_tokens where user_id::text = p_user_id::text;
end $$;

-- Eingang eines Leads (Webhook), jetzt mit Sperrliste, Dublettenpruefung auch gegen geschlossene Leads und zusaetzlichen
-- Belegen zur Einwilligung. Alle neuen Parameter OHNE Vorgabewert (sonst waere der Aufruf mit den alten 14 Parametern mehrdeutig).
create or replace function public.ingest_lead(
  p_api_key_id uuid,
  p_externe_id text,
  p_name text,
  p_telefon text,
  p_email text,
  p_gesellschaft text,
  p_tarifbeitrag numeric,
  p_quelle text,
  p_eingang_zeit timestamptz,
  p_einwilligung_zeit timestamptz,
  p_einwilligung_text text,
  p_einwilligung_quelle text,
  p_einwilligung_ip text,
  p_ist_test boolean,
  p_text_sha256 text,
  p_payload_roh jsonb,
  p_einwilligung_version text,
  p_kanal text,
  p_begunstigter text,
  p_user_agent text,
  p_rufnummer_verifiziert boolean
) returns table (o_lead_id uuid, o_neu_angelegt boolean)
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_dupe uuid;
  v_gesperrt boolean;
begin
  select id into v_id from public.leads where api_key_id = p_api_key_id and externe_id = p_externe_id;
  if v_id is not null then
    return query select v_id, false;
    return;
  end if;

  v_gesperrt := exists (select 1 from public.sperrliste where telefon = p_telefon);

  -- moegliches Duplikat: gleiche Nummer, auch gegen bereits geschlossene Leads
  select id into v_dupe from public.leads
   where telefon = p_telefon and ist_test = p_ist_test
   order by created_at desc
   limit 1;

  begin
    insert into public.leads (api_key_id, externe_id, name, telefon, email, gesellschaft, tarifbeitrag, quelle,
                              eingang_zeit, ist_test, moegliches_duplikat_von, status, gesperrt_am, sperrgrund)
    values (p_api_key_id, p_externe_id, p_name, p_telefon, p_email, p_gesellschaft, p_tarifbeitrag, p_quelle,
            p_eingang_zeit, p_ist_test, v_dupe,
            case when v_gesperrt then 'kein_interesse' else 'neu' end,
            case when v_gesperrt then now() end,
            case when v_gesperrt then 'Rufnummer steht auf der Sperrliste' end)
    returning id into v_id;
  exception when unique_violation then
    select id into v_id from public.leads where api_key_id = p_api_key_id and externe_id = p_externe_id;
    return query select v_id, false;
    return;
  end;

  insert into public.consent_records (lead_id, einwilligung_zeit, einwilligung_text, einwilligung_quelle, einwilligung_ip,
                                      text_sha256, payload_roh, einwilligung_version, kanal, begunstigter, user_agent, rufnummer_verifiziert)
  values (v_id, p_einwilligung_zeit, p_einwilligung_text, p_einwilligung_quelle, p_einwilligung_ip,
          coalesce(p_text_sha256, encode(extensions.digest(p_einwilligung_text, 'sha256'), 'hex')),
          p_payload_roh, p_einwilligung_version, p_kanal, p_begunstigter, p_user_agent, p_rufnummer_verifiziert);

  return query select v_id, true;
end $$;

-- Alte Signatur (14 Parameter) bleibt als Huelle bestehen, damit eine noch nicht neu deployte Funktion "leads" weiterarbeitet.
create or replace function public.ingest_lead(
  p_api_key_id uuid,
  p_externe_id text,
  p_name text,
  p_telefon text,
  p_email text,
  p_gesellschaft text,
  p_tarifbeitrag numeric,
  p_quelle text,
  p_eingang_zeit timestamptz,
  p_einwilligung_zeit timestamptz,
  p_einwilligung_text text,
  p_einwilligung_quelle text,
  p_einwilligung_ip text,
  p_ist_test boolean
) returns table (o_lead_id uuid, o_neu_angelegt boolean)
language sql security definer set search_path = '' as $$
  select * from public.ingest_lead(
    p_api_key_id, p_externe_id, p_name, p_telefon, p_email, p_gesellschaft, p_tarifbeitrag, p_quelle,
    p_eingang_zeit, p_einwilligung_zeit, p_einwilligung_text, p_einwilligung_quelle, p_einwilligung_ip, p_ist_test,
    null::text, null::jsonb, null::text, null::text, null::text, null::text, null::boolean);
$$;

-- =====================================================================================================
-- 3) Trigger
-- =====================================================================================================

-- Statuswaechter: Ein Nicht-Geschaeftsfuehrer darf einen Lead nicht aus verstorben / nicht_mehr_pkv / kein_interesse /
-- schon_umgestellt oder aus einer Sperre (gesperrt_am gesetzt) wieder herausholen. Ohne auth.uid() (SQL-Editor, service_role) kein Eingriff.
create or replace function public.leads_status_guard() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.status is distinct from old.status
     and (old.status = any (public.geschuetzte_status()) or old.gesperrt_am is not null)
     and (select auth.uid()) is not null
     and not coalesce((select public.ist_geschaeftsfuehrer()), false) then
    raise exception 'Dieser Lead ist abgeschlossen oder gesperrt. Nur der Geschaeftsfuehrer darf den Status aendern.' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists leads_status_guard on public.leads;
create trigger leads_status_guard before update of status on public.leads
for each row execute function public.leads_status_guard();

-- Anrufe, die der Browser direkt protokolliert (tel:-Pfad): gleiche Limits wie in der Edge Function.
create or replace function public.anrufe_limit_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_grund text;
begin
  if (select auth.uid()) is null then
    return new; -- service_role/SQL-Editor: die Edge Function prueft die Limits ueber anruf_reservieren selbst
  end if;
  perform pg_advisory_xact_lock(hashtextextended('anruf:' || new.user_id::text, 0));
  v_grund := public.anruf_limit_grund(new.lead_id, new.user_id);
  if v_grund is not null then
    raise exception 'anruf_limit:%', v_grund using errcode = '53400';
  end if;
  return new;
end $$;

drop trigger if exists anrufe_limit_guard on public.anrufe;
create trigger anrufe_limit_guard before insert on public.anrufe
for each row execute function public.anrufe_limit_guard();

-- Einwilligungsnachweise sind unveraenderlich (kein UPDATE, DELETE, TRUNCATE). Eine spaetere Anonymisierung muss den Trigger
-- bewusst und protokolliert deaktivieren: alter table public.consent_records disable trigger consent_records_unveraenderlich;
create or replace function public.consent_unveraenderlich() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Einwilligungsnachweise sind unveraenderlich.' using errcode = '42501';
end $$;

drop trigger if exists consent_records_unveraenderlich on public.consent_records;
create trigger consent_records_unveraenderlich before update or delete on public.consent_records
for each row execute function public.consent_unveraenderlich();

drop trigger if exists consent_records_kein_truncate on public.consent_records;
create trigger consent_records_kein_truncate before truncate on public.consent_records
for each statement execute function public.consent_unveraenderlich();

-- =====================================================================================================
-- 4) Row Level Security (auth.uid() und ist_geschaeftsfuehrer() als (select ...) einmal je Anfrage ausgewertet)
-- =====================================================================================================
alter table public.passwort_log enable row level security;

-- Leads: nur freie, eigene (Geschaeftsfuehrer: alle). Realtime folgt dieser Policy.
drop policy if exists leads_select on public.leads;
create policy leads_select on public.leads for select to authenticated
  using (zugewiesen_an is null or zugewiesen_an = (select auth.uid()) or (select public.ist_geschaeftsfuehrer()));

drop policy if exists leads_update on public.leads;
create policy leads_update on public.leads for update to authenticated
  using (zugewiesen_an = (select auth.uid()) or (select public.ist_geschaeftsfuehrer()))
  with check (zugewiesen_an = (select auth.uid()) or (select public.ist_geschaeftsfuehrer()));

-- Notizen und Anrufe: nur zu Leads, die der Nutzer sehen darf (die Unterabfrage unterliegt der Leads-Policy: frei, eigen, GF)
drop policy if exists notizen_select on public.lead_notizen;
create policy notizen_select on public.lead_notizen for select to authenticated
  using (exists (select 1 from public.leads l where l.id = lead_notizen.lead_id));

drop policy if exists notizen_insert on public.lead_notizen;
create policy notizen_insert on public.lead_notizen for insert to authenticated
  with check (
    lead_notizen.user_id = (select auth.uid())
    and exists (
      select 1 from public.leads l
      where l.id = lead_notizen.lead_id
        and (l.zugewiesen_an is null or l.zugewiesen_an = (select auth.uid()) or (select public.ist_geschaeftsfuehrer()))
    )
  );

drop policy if exists anrufe_select on public.anrufe;
create policy anrufe_select on public.anrufe for select to authenticated
  using (exists (select 1 from public.leads l where l.id = anrufe.lead_id));

-- Anrufe protokollieren (tel:-Pfad): eigener Eintrag, eigener Lead, Lead darf angerufen werden
drop policy if exists anrufe_insert on public.anrufe;
create policy anrufe_insert on public.anrufe for insert to authenticated
  with check (
    anrufe.user_id = (select auth.uid())
    and exists (select 1 from public.leads l where l.id = anrufe.lead_id and l.zugewiesen_an = (select auth.uid()))
    and (select public.darf_angerufen_werden(anrufe.lead_id))
  );

-- Einwilligungsnachweise: nur Geschaeftsfuehrer (alle anderen ueber die Funktion lead_einwilligung, ohne IP)
drop policy if exists consent_select on public.consent_records;
create policy consent_select on public.consent_records for select to authenticated
  using ((select public.ist_geschaeftsfuehrer()));

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()) and rolle = (select p.rolle from public.profiles p where p.id = (select auth.uid())));

drop policy if exists sperrliste_select on public.sperrliste;
create policy sperrliste_select on public.sperrliste for select to authenticated
  using ((select public.ist_geschaeftsfuehrer()));

drop policy if exists passwort_log_select_gf on public.passwort_log;
create policy passwort_log_select_gf on public.passwort_log for select to authenticated
  using ((select public.ist_geschaeftsfuehrer()));

-- =====================================================================================================
-- 5) Rechte (Grants)
-- =====================================================================================================

-- Tabellen: anon darf nichts; authenticated nur das Noetige (RLS ersetzt das nicht, TRUNCATE z. B. umgeht RLS).
revoke all on public.api_keys from anon, authenticated;

revoke all on public.consent_records from anon, authenticated;
grant select (id, lead_id, einwilligung_zeit, einwilligung_text, einwilligung_quelle, created_at, text_sha256,
              einwilligung_version, kanal, begunstigter, user_agent, rufnummer_verifiziert)
  on public.consent_records to authenticated; -- ohne einwilligung_ip und payload_roh; Zeilen sieht nur der Geschaeftsfuehrer

revoke all on public.leads from anon;
revoke all on public.lead_notizen from anon;
revoke all on public.anrufe from anon;
revoke all on public.profiles from anon;

revoke insert, delete, truncate, references, trigger on public.leads from authenticated;
revoke insert, delete, truncate, references, trigger on public.profiles from authenticated;

revoke all on public.lead_notizen from authenticated;
grant select on public.lead_notizen to authenticated;
grant insert (lead_id, user_id, text) on public.lead_notizen to authenticated;

revoke all on public.anrufe from authenticated;
grant select on public.anrufe to authenticated;
grant insert (lead_id, user_id, kanal) on public.anrufe to authenticated;

revoke all on public.sperrliste from anon, authenticated;
grant select on public.sperrliste to authenticated;

revoke all on public.passwort_log from anon, authenticated;
grant select on public.passwort_log to authenticated;

revoke all on public.anrufbare_leads from anon;

-- Funktionen: Trigger-Funktionen duerfen von niemandem direkt aufgerufen werden (Trigger brauchen zur Laufzeit kein EXECUTE).
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.profiles_pruefe_zeitzone() from public, anon, authenticated;
revoke execute on function public.leads_status_guard() from public, anon, authenticated;
revoke execute on function public.anrufe_limit_guard() from public, anon, authenticated;
revoke execute on function public.consent_unveraenderlich() from public, anon, authenticated;

-- Konstanten: von Ansicht und Policies als eingeloggter Nutzer aufgerufen
revoke execute on function public.einwilligung_max_alter() from public, anon;
revoke execute on function public.max_offene_eigene_leads() from public, anon;
revoke execute on function public.uebernehmbare_status() from public, anon;
revoke execute on function public.offene_status() from public, anon;
revoke execute on function public.geschuetzte_status() from public, anon;
grant execute on function public.einwilligung_max_alter() to authenticated, service_role;
grant execute on function public.max_offene_eigene_leads() to authenticated, service_role;
grant execute on function public.uebernehmbare_status() to authenticated, service_role;
grant execute on function public.offene_status() to authenticated, service_role;
grant execute on function public.geschuetzte_status() to authenticated, service_role;

-- Funktionen fuer eingeloggte Nutzer
revoke execute on function public.darf_angerufen_werden(uuid) from public, anon;
revoke execute on function public.lead_einwilligung(uuid) from public, anon;
revoke execute on function public.lead_uebernehmen(uuid) from public, anon;
revoke execute on function public.lead_sperren(uuid, text) from public, anon;
revoke execute on function public.lead_entsperren(uuid) from public, anon;
grant execute on function public.darf_angerufen_werden(uuid) to authenticated, service_role;
grant execute on function public.lead_einwilligung(uuid) to authenticated;
grant execute on function public.lead_uebernehmen(uuid) to authenticated;
grant execute on function public.lead_sperren(uuid, text) to authenticated;
grant execute on function public.lead_entsperren(uuid) to authenticated;

-- Funktionen nur fuer die Edge Functions (service_role)
revoke execute on function public.lead_uebernehmen_fuer(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.anruf_limit_grund(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.anruf_reservieren(uuid, uuid, text, text) from public, anon, authenticated;
revoke execute on function public.nutzer_sitzungen_beenden(uuid) from public, anon, authenticated;
grant execute on function public.lead_uebernehmen_fuer(uuid, uuid) to service_role;
grant execute on function public.anruf_limit_grund(uuid, uuid) to service_role;
grant execute on function public.anruf_reservieren(uuid, uuid, text, text) to service_role;
grant execute on function public.nutzer_sitzungen_beenden(uuid) to service_role;

revoke all on function public.ingest_lead(uuid, text, text, text, text, text, numeric, text, timestamptz, timestamptz, text, text, text, boolean)
  from public, anon, authenticated;
revoke all on function public.ingest_lead(uuid, text, text, text, text, text, numeric, text, timestamptz, timestamptz, text, text, text, boolean,
                                          text, jsonb, text, text, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.ingest_lead(uuid, text, text, text, text, text, numeric, text, timestamptz, timestamptz, text, text, text, boolean)
  to service_role;
grant execute on function public.ingest_lead(uuid, text, text, text, text, text, numeric, text, timestamptz, timestamptz, text, text, text, boolean,
                                             text, jsonb, text, text, text, text, boolean)
  to service_role;

-- =====================================================================================================
-- 6) Hinweise
-- =====================================================================================================
-- * Nach diesem Skript duerfen Mitarbeiter nur noch freie und eigene Leads sehen (Geschaeftsfuehrer: alle).
-- * Einspielreihenfolge im Betrieb: erst diese Migration, danach die Funktionen leads, anrufen, telefonie-verbinden und
--   mitarbeiter-passwort neu buendeln und ersetzen (siehe README, Abschnitt "QA-Haertung 03.11.2026").
