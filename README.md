# §204 PKV-Tarifoptimierung – Lead-Management CRM

Klickbares CRM-Mockup für ein Lead-Management-System im Bereich §204-PKV-Tarifoptimierung (private Krankenversicherung, Deutschland).

Dies ist ein reines Frontend-Mockup mit realistischen deutschen Mock-Daten und lokalem State (Persistenz via `localStorage`). Es gibt keine echten Backend-Integrationen (E-Mail, Kalendersync, Telefonie) – alle entsprechenden Aktionen sind simulierte UI-Interaktionen (Modal/Toast/Statuswechsel).

## Tech-Stack

- React 18 + Vite + TypeScript + Tailwind CSS
- React Router (`HashRouter`, geeignet für GitHub Pages)
- State-Management via React Context + `useReducer`, Persistenz in `localStorage`
- Icons: lucide-react

## Entwicklung

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Funktionsumfang

- Dashboard mit Zeitraum-Filtern, Benachrichtigungen, Postfach-Badge, Power-Dialer-Schnellzugriff und News-Ticker
- Leads: Kundenbereich, Verlorene Leads, Alte Leads, Lead-Detailansicht mit Status-Pipeline, Notizen und Aktivitäten-Timeline
- Power Dialer: automatische Anwahl der aktiven Leadliste
- Wiedervorlagen mit Hervorhebung überfälliger Termine
- Kalender mit Tages-/Wochen-/Monatsansicht, Terminbuchung, Kalenderfreigabe und externer Kalenderanbindung (Mockup)
- Nachrichten (Postfach-Mockup) inkl. E-Mail-Verknüpfung
- Buchhaltung mit KPI-Kacheln, Umsatzverlauf-Diagramm und Auszahlungsprozess
- Hilfe/Onboarding mit Schulungsvideos (Mockup) und Upload-Funktion
- Mein Profil mit Unter-Tabs: Profildaten, Kalender-Einstellungen, Sales-Provision, Team-Provision

Über den Button „Daten zurücksetzen“ in der Seitenleiste lässt sich der Mock-Datenbestand jederzeit auf den Ausgangszustand zurücksetzen.

## Anbindung an Supabase (Stand Oktober 2026)

- Echte Leads, Login, Power Dialer, Notizen und Anrufprotokoll laufen gegen die Supabase-Datenbank (siehe `supabase/README.md`).
  Kalender, Buchhaltung, Nachrichten, Reklamationen, Team-Zahlen, Provisionen und Onboarding zeigen weiterhin Beispieldaten
  (auf den Seiten mit dem Hinweis „Beispieldaten“ gekennzeichnet).
- Konfiguration über `.env.development` / `.env.production` (nur öffentliche Werte: URL und publishable Key; der Schutz läuft über
  Row Level Security). Lokale Überschreibungen gehören in `.env.development.local` (git-ignoriert; Vite gibt modusspezifischen
  Dateien Vorrang vor `.env.local`). Niemals einen secret/service_role-Key im Frontend verwenden.
- Es gibt keine Registrierung im Frontend; Nutzer werden im Supabase-Dashboard eingeladen.
- Tests der Mapping-Logik: `npm test`.
