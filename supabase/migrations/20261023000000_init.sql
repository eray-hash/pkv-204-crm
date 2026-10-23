-- Datenbank-Struktur fuer das PKV-Lead-CRM (Entwurf, noch gegen kein echtes Projekt getestet)

create extension if not exists pgcrypto with schema extensions;

-- ---------- Nutzer-Profile (Login laeuft ueber Supabase Auth) ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  rolle text not null default 'mitarbeiter' check (rolle in ('mitarbeiter', 'geschaeftsfuehrer')),
  telefon_festnetz text,
  telefon_mobil text,
  created_at timestamptz not null default now()
);

-- ---------- API-Schluessel der Lead-Lieferanten (nur der Hash wird gespeichert) ----------
create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  lieferant text not null,
  key_hash text not null unique,
  ist_test boolean not null default false,
  aktiv boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- Leads ----------
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  api_key_id uuid not null references public.api_keys(id),
  externe_id text not null,
  name text not null,
  telefon text not null,
  email text not null,
  gesellschaft text not null,
  tarifbeitrag numeric(10, 2) not null check (tarifbeitrag > 0),
  quelle text,
  eingang_zeit timestamptz not null,
  status text not null default 'neu' check (status in (
    'neu', 'kontaktiert', 'nicht_erreicht', 'termin_vereinbart', 'beratung', 'gewonnen',
    'verloren', 'verstorben', 'nicht_mehr_pkv', 'kein_interesse', 'schon_umgestellt'
  )),
  ist_live boolean not null default true,
  ist_test boolean not null default false,
  moegliches_duplikat_von uuid references public.leads(id),
  zugewiesen_an uuid references public.profiles(id),
  naechster_anruf_ab timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (api_key_id, externe_id)
);

create index leads_queue_idx on public.leads (status, eingang_zeit desc) where ist_test = false;
create index leads_telefon_idx on public.leads (telefon);

-- ---------- Einwilligungsnachweis (nur lesbar, wird nur beim Eingang geschrieben) ----------
create table public.consent_records (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null unique references public.leads(id) on delete cascade,
  einwilligung_zeit timestamptz not null,
  einwilligung_text text not null,
  einwilligung_quelle text not null,
  einwilligung_ip text,
  created_at timestamptz not null default now()
);

-- ---------- Gespraechsnotizen und Anrufe ----------
create table public.lead_notizen (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  text text not null check (length(text) between 1 and 10000),
  created_at timestamptz not null default now()
);

create table public.anrufe (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  kanal text not null check (kanal in ('festnetz', 'mobil')),
  gestartet_am timestamptz not null default now()
);

-- ---------- updated_at automatisch pflegen ----------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger leads_set_updated_at before update on public.leads
for each row execute function public.set_updated_at();

-- ---------- Anrufbare Leads: nur mit Einwilligungsnachweis, nie Testleads, nie abgeschlossene ----------
create view public.anrufbare_leads with (security_invoker = true) as
select l.*
from public.leads l
join public.consent_records c on c.lead_id = l.id
where l.ist_test = false
  and l.status in ('neu', 'kontaktiert', 'nicht_erreicht')
  and (l.naechster_anruf_ab is null or l.naechster_anruf_ab <= now());

-- ---------- Row Level Security ----------
alter table public.profiles enable row level security;
alter table public.api_keys enable row level security;
alter table public.leads enable row level security;
alter table public.consent_records enable row level security;
alter table public.lead_notizen enable row level security;
alter table public.anrufe enable row level security;

-- api_keys: keine Policy = kein Zugriff fuer eingeloggte Nutzer (nur der Server-Schluessel darf)
create policy profiles_select on public.profiles for select to authenticated using (true);
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid() and rolle = (select rolle from public.profiles where id = auth.uid()));

create policy leads_select on public.leads for select to authenticated using (true);
create policy leads_update on public.leads for update to authenticated using (true) with check (true);

create policy consent_select on public.consent_records for select to authenticated using (true);

create policy notizen_select on public.lead_notizen for select to authenticated using (true);
create policy notizen_insert on public.lead_notizen for insert to authenticated with check (user_id = auth.uid());

create policy anrufe_select on public.anrufe for select to authenticated using (true);
create policy anrufe_insert on public.anrufe for insert to authenticated with check (user_id = auth.uid());

-- ---------- Eingang eines Leads (atomar, mit Dublettenschutz) ----------
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
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_dupe uuid;
begin
  select id into v_id from leads where api_key_id = p_api_key_id and externe_id = p_externe_id;
  if v_id is not null then
    return query select v_id, false;
    return;
  end if;

  select id into v_dupe from leads
  where telefon = p_telefon
    and ist_test = p_ist_test
    and status in ('neu', 'kontaktiert', 'nicht_erreicht', 'termin_vereinbart', 'beratung')
  order by created_at desc
  limit 1;

  begin
    insert into leads (api_key_id, externe_id, name, telefon, email, gesellschaft, tarifbeitrag, quelle,
                       eingang_zeit, ist_test, moegliches_duplikat_von)
    values (p_api_key_id, p_externe_id, p_name, p_telefon, p_email, p_gesellschaft, p_tarifbeitrag, p_quelle,
            p_eingang_zeit, p_ist_test, v_dupe)
    returning id into v_id;
  exception when unique_violation then
    select id into v_id from leads where api_key_id = p_api_key_id and externe_id = p_externe_id;
    return query select v_id, false;
    return;
  end;

  insert into consent_records (lead_id, einwilligung_zeit, einwilligung_text, einwilligung_quelle, einwilligung_ip)
  values (v_id, p_einwilligung_zeit, p_einwilligung_text, p_einwilligung_quelle, p_einwilligung_ip);

  return query select v_id, true;
end $$;

revoke all on function public.ingest_lead(uuid, text, text, text, text, text, numeric, text, timestamptz, timestamptz, text, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.ingest_lead(uuid, text, text, text, text, text, numeric, text, timestamptz, timestamptz, text, text, text, boolean)
  to service_role;
