# §204 PKV-Tarifoptimierung – Lead-Management CRM

Web-CRM für die Bearbeitung von Leads aus der §204-PKV-Tarifoptimierung (private Krankenversicherung, Deutschland): Leads aus dem Webhook
des Lieferanten, Power Dialer mit sipgate-Anbindung, Lead-Verteilung im Team, Wiedervorlagen, Team-Übersicht und Konto-Verwaltung.

## Tech-Stack

- React 19, Vite, TypeScript, Tailwind CSS
- React Router (`HashRouter`, geeignet für GitHub Pages)
- Supabase (Postgres mit Row Level Security, Auth, Realtime, Edge Functions) als Backend, siehe [`supabase/README.md`](supabase/README.md)
- Icons: lucide-react

## Was angebunden ist und was nicht

Angebunden: Anmeldung, Leads (Liste, Detail, Notizen, Status, Sperre/Widerruf), Lead-Verteilung und Team-Präsenz, Power Dialer, Wiedervorlagen
(aus dem Feld „nächster Anruf ab“), Dashboard-Kennzahlen, Team-Seite (nur Geschäftsführer), Telefonie (sipgate Classic; Neo nach Dokumentation, noch
nicht in der Praxis erprobt), Passwort ändern und vorläufige Passwörter.

Noch nicht angebunden (zeigen „Dieser Bereich ist noch nicht angebunden.“): Kalender, Nachrichten, Buchhaltung, Reklamationen, Hilfe/Onboarding,
Provisionen. Es gibt keine Beispieldaten mehr; alle Zahlen stammen aus der Datenbank.

## Entwicklung

Node 24 wird empfohlen (die Tests laufen direkt auf TypeScript-Dateien).

```bash
npm install
npm run dev
```

Die Verbindung zu Supabase steht in `.env.development` und `.env.production` (nur öffentliche Werte, niemals einen secret/service_role-Schlüssel eintragen).
Lokale Abweichungen gehören in `.env.development.local` (wird nicht committet).

## Prüfen und bauen

```bash
npm run typecheck   # TypeScript
npm run lint        # oxlint
npm test            # Frontend-Logik, Edge-Function-Logik und eine Postgres-Prüfung der Migrationen (PGlite)
npm run build
```

Veröffentlicht wird bei jedem Push auf `main` über GitHub Pages (`.github/workflows/deploy.yml`, bisher nur Build).

**Offen:** `ci/deploy.yml.vorschlag` ist die erweiterte Variante (Node 24, Typprüfung, Lint, Tests vor dem Build; bei einem Fehler wird nicht veröffentlicht).
Sie konnte nicht gepusht werden, weil das verwendete Zugriffstoken keine Workflow-Dateien ändern darf (fehlender `workflow`-Scope). Zum Aktivieren die Datei
nach `.github/workflows/deploy.yml` kopieren und mit einem berechtigten Konto committen.

## Backend

Migrationen, Edge Functions, Einspielreihenfolge und bekannte Grenzen stehen in [`supabase/README.md`](supabase/README.md). Datenbank und Funktionen
werden bewusst nicht automatisch ausgerollt, sondern von Hand eingespielt.
