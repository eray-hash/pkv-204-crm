-- Telefonie (sipgate): persoenliche Zugaenge der Nutzer und Anbieter-Daten am Anruf-Protokoll.
-- Nur Datei, noch NICHT ausgefuehrt.

-- ---------- Zugaenge (verschluesseltes Personal Access Token) ----------
-- Das Token wird in der Edge Function mit AES-GCM verschluesselt (Schluessel: Secret TELEFONIE_KEY).
-- RLS ist AN und es gibt bewusst KEINE Policy: Zugriff nur ueber den service_role-Schluessel der Edge Functions.
-- Weder Browser noch eingeloggte Nutzer koennen die Tabelle lesen oder aendern.
create table public.telefonie_zugaenge (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  anbieter text not null default 'sipgate_classic' check (anbieter in ('sipgate_classic')),
  token_id text not null,
  token_verschluesselt text not null,
  geraet_id text,
  rufnummer_caller text,
  rufnummer_anzeige text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.telefonie_zugaenge enable row level security;
revoke all on public.telefonie_zugaenge from anon, authenticated;

create trigger telefonie_zugaenge_set_updated_at before update on public.telefonie_zugaenge
for each row execute function public.set_updated_at();

-- ---------- Anruf-Protokoll: welcher Anbieter und welche Anruf-ID beim Anbieter ----------
alter table public.anrufe add column if not exists anbieter text;
alter table public.anrufe add column if not exists provider_call_id text;

-- Das Rate-Limit der Funktion "anrufen" liest den letzten Anruf pro Nutzer.
create index if not exists anrufe_user_idx on public.anrufe (user_id, gestartet_am desc);
