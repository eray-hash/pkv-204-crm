-- Zeitpunkt der letzten Statusaenderung (Runde 2, 03.11.2026). Nur Datei, noch NICHT ausgefuehrt; wiederholbar.
-- Voraussetzung: 20261103000000_qa_haertung.sql. Das Dashboard zaehlt "Gewonnen" und "Termine" nach diesem Zeitpunkt statt nach
-- updated_at (das sich auch bei Notizen, Zuweisungen oder Wiedervorlagen aendert).

alter table public.leads add column if not exists status_geaendert_am timestamptz;

-- Backfill: bisheriger Stand = updated_at. Der updated_at-Trigger wird dafuer kurz ausgeschaltet, damit updated_at unveraendert bleibt.
alter table public.leads disable trigger leads_set_updated_at;
update public.leads set status_geaendert_am = updated_at where status_geaendert_am is null;
alter table public.leads enable trigger leads_set_updated_at;

alter table public.leads alter column status_geaendert_am set default now();

create or replace function public.leads_status_zeitpunkt() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.status is distinct from old.status then
    new.status_geaendert_am := now();
  end if;
  return new;
end $$;

drop trigger if exists leads_status_zeitpunkt on public.leads;
create trigger leads_status_zeitpunkt before update of status on public.leads
for each row execute function public.leads_status_zeitpunkt();

revoke execute on function public.leads_status_zeitpunkt() from public, anon, authenticated;

-- "select l.*" wird beim Erstellen festgeschrieben: Ansicht neu erstellen, damit die neue Spalte (am Ende) enthalten ist.
create or replace view public.anrufbare_leads with (security_invoker = true) as
select l.*
  from public.leads l
 where public.darf_angerufen_werden(l.id)
   and l.status = any (public.uebernehmbare_status())
   and (l.naechster_anruf_ab is null or l.naechster_anruf_ab <= now());
