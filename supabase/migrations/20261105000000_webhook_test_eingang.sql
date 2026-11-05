-- Aufbewahrung abgelehnter Anfragen, die mit einem TEST-Schluessel eingehen (nur zur Fehlersuche bei der Anbindung eines Lieferanten).
-- Der Rohtext kann Personendaten enthalten (Testleads sollten erfundene Daten sein): nur der Geschaeftsfuehrer darf lesen,
-- geschrieben wird nur von der Funktion "leads" (service_role). Nach der Anbindung leeren: delete from public.webhook_test_eingang;
create table if not exists public.webhook_test_eingang (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  api_key_id uuid not null references public.api_keys(id) on delete cascade,
  grund text not null,
  rohtext text not null check (length(rohtext) <= 16384)
);
alter table public.webhook_test_eingang enable row level security;
revoke all on public.webhook_test_eingang from anon, authenticated;
grant select on public.webhook_test_eingang to authenticated;
drop policy if exists webhook_test_eingang_select on public.webhook_test_eingang;
create policy webhook_test_eingang_select on public.webhook_test_eingang for select to authenticated
  using ((select public.ist_geschaeftsfuehrer()));
create index if not exists webhook_test_eingang_created_idx on public.webhook_test_eingang (created_at desc);
