-- Protokoll: wer hat fuer wen ein vorlaeufiges Passwort festgelegt (Funktion "mitarbeiter-passwort").
-- Enthaelt bewusst keinerlei Passwortdaten. Geschrieben wird nur von der Funktion (service_role umgeht RLS);
-- lesen darf nur der Geschaeftsfuehrer. Voraussetzung: ist_geschaeftsfuehrer() aus 20261030000000_verteilung.sql.
create table if not exists public.passwort_log (
  id uuid primary key default gen_random_uuid(),
  gesetzt_von uuid not null references public.profiles(id) on delete cascade,
  fuer_nutzer uuid not null references public.profiles(id) on delete cascade,
  zeitpunkt timestamptz not null default now()
);

alter table public.passwort_log enable row level security;

revoke all on public.passwort_log from anon, authenticated;
grant select on public.passwort_log to authenticated;

drop policy if exists passwort_log_select_gf on public.passwort_log;
create policy passwort_log_select_gf on public.passwort_log
  for select to authenticated
  using (public.ist_geschaeftsfuehrer());

create index if not exists passwort_log_zeitpunkt_idx on public.passwort_log (zeitpunkt desc);
