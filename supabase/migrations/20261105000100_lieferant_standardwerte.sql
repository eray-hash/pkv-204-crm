-- Standardwerte pro API-Schluessel (Annahme-Adapter) und optionaler Tarifbeitrag. Wiederholbar.
-- Zweck: Lieferanten, deren System nur Adresse und Schluessel konfigurieren kann (z. B. Facebook-Lead-Formulare), muessen
-- Wortlaut/Quelle/Bestaetigung nicht bei jedem Lead mitschicken: sie sind bei ihnen immer gleich und stehen hier einmal.
alter table public.api_keys
  add column if not exists standard_einwilligung_text text,
  add column if not exists standard_einwilligung_quelle text,
  add column if not exists standard_kanal text,
  add column if not exists standard_begunstigter text,
  add column if not exists standard_rufnummer_verifiziert boolean,
  add column if not exists standard_gesellschaft text,
  add column if not exists standard_zeit_ist_eingang boolean;

-- Nicht jedes Formular fragt den aktuellen Beitrag ab
alter table public.leads alter column tarifbeitrag drop not null;
alter table public.leads drop constraint if exists leads_tarifbeitrag_check;
alter table public.leads add constraint leads_tarifbeitrag_check check (tarifbeitrag is null or tarifbeitrag > 0);

-- Test-Schluessel von "First Class Live Leads" (Tim Kromath): Angaben laut Lieferant vom 05.11.2026
update public.api_keys set
  standard_einwilligung_text = 'Indem du auf "Senden" klickst, stimmst du zu, dass deine Informationen an die Seite Deutsche PKV uebermittelt und gemaess ihrer Datenschutzrichtlinie verwendet werden duerfen. Facebook verwendet sie ebenfalls gemaess seiner Datenrichtlinie, unter anderem auch, um Formulare fuer Werbeanzeigen automatisch auszufuellen. (Datenschutzerklaerung des Lieferanten: https://www.deutsche-pkv-experten.de/datenschutz)',
  standard_einwilligung_quelle = 'Meta (Facebook Lead Ad)',
  standard_kanal = 'Facebook Lead Ad, Rufnummer per SMS-PIN bestaetigt',
  standard_rufnummer_verifiziert = true,
  standard_gesellschaft = 'unbekannt',
  standard_zeit_ist_eingang = true
where lieferant = 'First Class Live Leads (Testschluessel)';
