-- Lead-Verteilung: Wer einen freien Lead zuerst uebernimmt, bekommt ihn. Der Geschaeftsfuehrer kann zuweisen und freigeben.
-- Dazu Erreichbarkeit/Zeitzone der Nutzer. Nur Datei, noch NICHT ausgefuehrt.
-- Reihenfolge: nach 20261023000000_init.sql, 20261023000100_auth_profile_trigger.sql und 20261028000000_telefonie.sql.
-- Setzt die Rechte-Haertung aus 20261024000000_vorschlag_haertung.sql fort (dort steht dieselbe Spaltenfreigabe status/naechster_anruf_ab;
-- beide Dateien lassen sich in beliebiger Reihenfolge ausfuehren, zugewiesen_an bleibt in jedem Fall gesperrt).

-- =====================================================================================================
-- 1) Profile: Zeitzone und Erreichbarkeit (Ortszeit der jeweiligen Person)
-- =====================================================================================================
alter table public.profiles
  add column if not exists zeitzone text not null default 'Europe/Berlin',
  add column if not exists online boolean not null default false,
  add column if not exists auto_online boolean not null default false,
  add column if not exists erreichbar_von time,
  add column if not exists erreichbar_bis time;

-- Nur echte IANA-Zeitzonen zulassen (z. B. Europe/Berlin, Asia/Bangkok). Ein CHECK kann das nicht pruefen
-- (Unterabfrage auf pg_timezone_names nicht erlaubt), daher ein Trigger: "at time zone" wirft bei unbekannten Namen.
create or replace function public.profiles_pruefe_zeitzone() returns trigger
language plpgsql as $$
begin
  perform now() at time zone new.zeitzone;
  return new;
exception when others then
  raise exception 'Ungueltige Zeitzone: %', new.zeitzone using errcode = '22023';
end $$;

drop trigger if exists profiles_pruefe_zeitzone on public.profiles;
create trigger profiles_pruefe_zeitzone before insert or update of zeitzone on public.profiles
for each row execute function public.profiles_pruefe_zeitzone();

-- Pruefung der bestehenden Policy profiles_update_own: Ihr "with check" verlangt nur id = auth.uid() und dass sich
-- "rolle" nicht aendert. Die neuen Spalten bleiben damit fuer die eigene Zeile aenderbar.
-- Zusaetzlich (Defense in Depth) nur die gewollten Spalten per Spaltenrecht freigeben: "rolle" ist dann gar nicht
-- mehr aenderbar, nicht nur per Policy. Neue Profil-Spalten muessen kuenftig hier freigegeben werden.
revoke update on public.profiles from authenticated;
grant update (name, telefon_festnetz, telefon_mobil, zeitzone, online, auto_online, erreichbar_von, erreichbar_bis)
  on public.profiles to authenticated;

-- =====================================================================================================
-- 2) Leads: Zuweisungsdaten
-- =====================================================================================================
alter table public.leads
  add column if not exists uebernommen_am timestamptz,
  add column if not exists zugewiesen_von uuid references public.profiles(id) on delete set null;

create index if not exists leads_zugewiesen_idx on public.leads (zugewiesen_an) where zugewiesen_an is not null;

-- "select l.*" wird beim Erstellen der Ansicht festgeschrieben; neu erstellen, damit die neuen Spalten enthalten sind
-- (neue Spalten stehen am Ende, daher ist CREATE OR REPLACE erlaubt).
create or replace view public.anrufbare_leads with (security_invoker = true) as
select l.*
from public.leads l
join public.consent_records c on c.lead_id = l.id
where l.ist_test = false
  and l.status in ('neu', 'kontaktiert', 'nicht_erreicht')
  and (l.naechster_anruf_ab is null or l.naechster_anruf_ab <= now());

-- =====================================================================================================
-- 3) Hilfsfunktion und Funktionen fuer die Verteilung
-- =====================================================================================================
create or replace function public.ist_geschaeftsfuehrer() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and rolle = 'geschaeftsfuehrer');
$$;

-- Atomar: nur ein Aufrufer gewinnt. Gibt zurueck, ob DIESER Aufruf den Lead uebernommen hat.
create or replace function public.lead_uebernehmen(p_lead_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_rows integer;
begin
  if auth.uid() is null then
    return false;
  end if;
  update public.leads
     set zugewiesen_an = auth.uid(), zugewiesen_von = auth.uid(), uebernommen_am = now()
   where id = p_lead_id
     and zugewiesen_an is null
     and ist_test = false
     and status in ('neu', 'kontaktiert', 'nicht_erreicht');
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end $$;

-- Eigener Lead oder Geschaeftsfuehrer. Setzt Zuweisung, Zuweiser und Uebernahmezeit zurueck.
create or replace function public.lead_freigeben(p_lead_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_rows integer;
begin
  if auth.uid() is null then
    return false;
  end if;
  update public.leads
     set zugewiesen_an = null, zugewiesen_von = null, uebernommen_am = null
   where id = p_lead_id
     and zugewiesen_an is not null
     and (zugewiesen_an = auth.uid() or public.ist_geschaeftsfuehrer());
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end $$;

-- Nur Geschaeftsfuehrer; auch Umverteilung bereits zugewiesener Leads. Der Zielnutzer muss existieren.
create or replace function public.lead_zuweisen(p_lead_id uuid, p_user_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_rows integer;
begin
  if auth.uid() is null or not public.ist_geschaeftsfuehrer() then
    raise exception 'Nur der Geschaeftsfuehrer darf Leads zuweisen.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    return false;
  end if;
  update public.leads
     set zugewiesen_an = p_user_id, zugewiesen_von = auth.uid(), uebernommen_am = now()
   where id = p_lead_id
     and ist_test = false;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end $$;

-- Nur fuer eingeloggte Nutzer ausfuehrbar (nicht anon/public).
revoke all on function public.ist_geschaeftsfuehrer() from public, anon;
revoke all on function public.lead_uebernehmen(uuid) from public, anon;
revoke all on function public.lead_freigeben(uuid) from public, anon;
revoke all on function public.lead_zuweisen(uuid, uuid) from public, anon;
grant execute on function public.ist_geschaeftsfuehrer() to authenticated;
grant execute on function public.lead_uebernehmen(uuid) to authenticated;
grant execute on function public.lead_freigeben(uuid) to authenticated;
grant execute on function public.lead_zuweisen(uuid, uuid) to authenticated;

-- =====================================================================================================
-- 4) Rechte haerten: Zuweisung nur noch ueber die Funktionen
-- =====================================================================================================
-- Direkte Updates im Browser duerfen nur Status und Wiedervorlagezeit aendern (nicht Name, Telefon, Beitrag, Zuweisung ...).
revoke update on public.leads from authenticated;
grant update (status, naechster_anruf_ab) on public.leads to authenticated;

-- Aendern darf nur der zugewiesene Nutzer oder der Geschaeftsfuehrer (freie Leads erst uebernehmen).
drop policy if exists leads_update on public.leads;
create policy leads_update on public.leads for update to authenticated
  using (zugewiesen_an = auth.uid() or public.ist_geschaeftsfuehrer())
  with check (zugewiesen_an = auth.uid() or public.ist_geschaeftsfuehrer());

-- Notizen: nur zu eigenen oder freien Leads (Geschaeftsfuehrer: zu allen), und immer unter dem eigenen Namen.
drop policy if exists notizen_insert on public.lead_notizen;
create policy notizen_insert on public.lead_notizen for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.leads l
      where l.id = lead_id
        and (l.zugewiesen_an is null or l.zugewiesen_an = auth.uid() or public.ist_geschaeftsfuehrer())
    )
  );
