# Backend fuer Live-Leads (Entwurf)

Stand 22.10.2026: Projekt `pkv-crm` (Ref `xodevwayzrfxyjhpfjxx`, Region West EU/Irland, Free Plan) ist angelegt,
die Migration eingespielt und die Funktion `leads` ohne JWT-Pruefung veroeffentlicht.
Live getestet: 401 ohne/mit falschem Schluessel, 400 bei fehlenden Pflichtfeldern oder fehlender Einwilligung,
201 bei gueltigem Lead (Telefonnummer wird zu +49... vereinheitlicht), 200 bei gleicher `lead_id`,
Duplikat-Markierung bei gleicher Nummer, Testleads erscheinen nicht in `anrufbare_leads`. Testdaten sind wieder geloescht.
Validierungstests lokal: `node --test functions/leads/validate.test.ts`.

Webhook-Adresse: `https://xodevwayzrfxyjhpfjxx.supabase.co/functions/v1/leads`
Es existiert noch kein API-Schluessel fuer den echten Lieferanten.

## Einrichten eines neuen Projekts (Beschreibung des bisherigen Vorgehens)

1. Datenbank anlegen: `supabase db push` (oder den Inhalt von `migrations/20261023000000_init.sql` im SQL-Editor ausfuehren).
2. Funktion veroeffentlichen: `supabase functions deploy leads --no-verify-jwt`
   (JWT-Pruefung ist aus, weil die Funktion den API-Schluessel des Lieferanten selbst prueft).
3. API-Schluessel erzeugen: `openssl rand -hex 32` und den Wert dem Lieferanten getrennt mitteilen (nicht per E-Mail-Klartext).
   Nur der Hash kommt in die Datenbank:

   ```sql
   insert into api_keys (lieferant, key_hash, ist_test)
   values ('Lieferant X', encode(extensions.digest('<SCHLUESSEL>', 'sha256'), 'hex'), true);
   ```

   `ist_test = true` markiert alle Leads dieses Schluessels als Testleads. Sie erscheinen nicht in der Ansicht `anrufbare_leads`.
4. Adresse fuer den Lieferanten: `https://<projekt-ref>.supabase.co/functions/v1/leads`

## Verhalten

- Ohne vollstaendigen Einwilligungsnachweis wird ein Lead abgelehnt (HTTP 400).
- Gleiche `lead_id` desselben Schluessels: keine neue Anlage (HTTP 200).
- Gleiche Telefonnummer wie ein offener Lead: wird angelegt und als moegliches Duplikat markiert.
- Der Power Dialer soll nur aus der Ansicht `anrufbare_leads` lesen.

## Noch nicht enthalten

Rate-Limit, Login-Oberflaeche im CRM, Anbindung des Frontends an diese Datenbank, Rollenrechte fuer die Team-Ansicht.

## Telefonie (sipgate)

Der Button „Mobil (Satellite)“ im Power Dialer löst Anrufe über sipgate aus (Rückruf-Prinzip: erst klingelt das eigene Gerät,
dann wird der Lead verbunden). Jeder Nutzer trägt sein eigenes Personal Access Token unter Mein Profil → Telefonie ein
(Classic: Rechte nur `sessions:calls:write` und `devices:read`; Anlage unter https://app.sipgate.com/personal-access-token).
Unterstützt sind zwei Adapter, gewählt über „Kontotyp“ im Profil: `sipgate_classic` (`POST /v2/sessions/calls`) und `sipgate_neo`
(`POST /v2/calls`, Rechte `rtcm:write` und `devices:read`, siehe Abschnitt „sipgate Neo“).

Sicherheit: Das Token liegt nur serverseitig, mit AES-GCM verschlüsselt (Schlüssel = Secret `TELEFONIE_KEY`) in `telefonie_zugaenge`
(RLS an, keine Policy, nur `service_role`). Es wird nie an den Browser zurückgegeben und nie geloggt. Die Funktion `anrufen`
bekommt nur eine `lead_id`, lädt die Rufnummer selbst aus der Datenbank, verweigert Testleads, abgeschlossene Leads
(verstorben, nicht_mehr_pkv, kein_interesse, schon_umgestellt, verloren, gewonnen) und Leads ohne Einwilligungsnachweis
und lässt pro Nutzer höchstens einen Anruf alle 3 Sekunden zu.

Einrichten:

1. Secret setzen (32 zufällige Byte, Hex oder Base64), nie ins Repo: `supabase secrets set TELEFONIE_KEY=$(openssl rand -hex 32)`
   (bei Verlust oder Wechsel des Schlüssels müssen alle Nutzer ihr Token neu eintragen).
2. Migration `migrations/20261028000000_telefonie.sql` einspielen (`telefonie_zugaenge`, `anrufe.anbieter`, `anrufe.provider_call_id`).
3. Funktionen deployen (die Funktionen prüfen das Nutzer-JWT selbst, daher ohne Gateway-JWT-Prüfung wie `leads`; der Ordner
   `functions/_shared` wird von beiden Funktionen importiert und muss beim Deploy dabei sein, am einfachsten per CLI):
   `supabase functions deploy telefonie-verbinden --no-verify-jwt` und `supabase functions deploy anrufen --no-verify-jwt`
4. Test-Ablauf: Mein Profil → Telefonie → Token-ID und Token eintragen → Gerät wählen → im Power Dialer „Mobil (Satellite)“ drücken.
   Das Gerät klingelt, danach steht ein Eintrag in `anrufe` (kanal `mobil`, anbieter `sipgate_classic`, `provider_call_id`).
   Ohne Verbindung (oder wenn die Funktionen noch nicht deployt sind) fällt „Mobil“ wie bisher auf den `tel:`-Link zurück.

Tests (ohne Netzwerk, gegen gefakte sipgate-Antworten): `node --test "supabase/functions/**/*.test.ts"` bzw. `npm test` im Projektordner.

## Stand der Veroeffentlichung (27.10.2026)

Die Migration `20261028000000_telefonie.sql` ist im Projekt eingespielt, das Secret `TELEFONIE_KEY` ist gesetzt, und die Funktionen
`anrufen` und `telefonie-verbinden` sind ohne Gateway-JWT-Pruefung veroeffentlicht. Weil das Dashboard keinen `_shared`-Ordner kennt,
wurden sie als gebuendelte Einzeldateien hochgeladen: `node_modules/.bin/rolldown supabase/functions/<name>/index.ts -f esm -p neutral -e "jsr:@supabase/supabase-js@2" -o <ziel>.js`.
Nach Code-Aenderungen muessen die Funktionen so neu gebuendelt und im Dashboard ersetzt werden.
Noch nicht gegen ein echtes sipgate-Konto getestet.

## Lead-Verteilung (30.10.2026)

Alle sehen alle neuen Live-Leads; wer zuerst übernimmt, bekommt den Lead. Der Geschäftsführer kann zusätzlich zuweisen und freigeben.
Zuweisungen laufen ausschließlich über die Funktionen `lead_uebernehmen`, `lead_freigeben`, `lead_zuweisen` (atomar, `security definer`);
Nutzer dürfen auf `leads` nur noch `status` und `naechster_anruf_ab` direkt ändern, auf `profiles` nur Name, Telefonnummern, Zeitzone und
Erreichbarkeit. Die Edge Function `anrufen` übernimmt einen freien Lead atomar VOR dem sipgate-Anruf; gehört er jemand anderem, antwortet sie
mit 409 „Dieser Lead wird bereits von jemand anderem bearbeitet.“ (ohne Namen).
Zeiten werden in der Zeitzone des Nutzers angezeigt (Profil → Erreichbarkeit, z. B. `Europe/Berlin` oder `Asia/Bangkok`). „Ich nehme Live-Leads
an“ im Kopf schaltet Ton/Toast für neue Leads; optional automatisch nach einem Erreichbarkeitsfenster (auch über Mitternacht).
Bekannte Grenze: freie Leads im Status beratung/termin_vereinbart lassen sich nicht selbst übernehmen, hier weist der Geschäftsführer zu.

## sipgate Neo (nach Doku, nie gegen ein echtes Konto getestet)

Der Neo-Adapter ist nur so weit gebaut, wie die sipgate-Dokumentation ihn belegt: `POST /v2/calls` mit `deviceId`, `targetNumber`, optional
`callerId` (Rufnummern ohne „+“, wie in den Doku-Beispielen), Antwort `callSid`; benötigtes Recht `rtcm:write`.
**Zugangsweg für Neo-Konten ungeklärt; Token-Anlage im Web für neue Verträge evtl. nicht möglich, bitte sipgate-Support fragen**
(Personal Access Tokens gibt es laut sipgate nur für Verträge vor dem 25.08.2025). Unsicher: Rufnummernformat, ob `rtcm:write` allein reicht,
Standard-`channelId`, Herkunft der Geräte-IDs für Neo, ob `GET /authorization/userinfo` mit Neo-Tokens funktioniert. Ob ein Konto Classic oder Neo ist,
lässt sich aus dem Token nicht ableiten, deshalb wählt der Nutzer den Kontotyp selbst (im Zweifel sipgate-Support fragen).

## Schritte nach diesem Stand

1. `migrations/20261030000000_verteilung.sql` einspielen.
2. `migrations/20261030000100_telefonie_neo.sql` einspielen.
3. `anrufen` und `telefonie-verbinden` neu bündeln (rolldown-Befehl oben) und ersetzen. Keine neuen Secrets.

## Vorläufiges Passwort für Teammitglieder (02.11.2026)

Weil Einladungs- und Reset-Mails (Default-SMTP) bei manchen Anbietern nicht ankommen, kann der Geschäftsführer unter Team → „Passwort festlegen“
für ein Teammitglied ein vorläufiges Passwort setzen. Die Person muss es beim ersten Login ändern (Seite „Neues Passwort festlegen“, mit
„Abmelden“-Knopf; erzwungen über `user_metadata.passwort_wechseln`, das beim Ändern auf `false` gesetzt wird).

Edge Function `mitarbeiter-passwort` (`functions/mitarbeiter-passwort/index.ts`, Logik in `functions/_shared/passwort_handler.ts`):

- Eingabe `{ user_id, passwort }`, Antwort nur `{ ok: true }`. Das Passwort wird nie zurückgegeben, geloggt oder in Fehlermeldungen genannt.
- Aufrufer per Nutzer-JWT ermittelt (deshalb ohne Gateway-JWT-Prüfung, wie `anrufen`); Rolle aus `profiles` über den Service-Client: nur
  `geschaeftsfuehrer`, sonst 403. Eigene `user_id`: 400 (dafür gibt es Mein Profil → Passwort ändern). Unbekannter Nutzer: 404.
- Passwortregeln serverseitig: mindestens 12 Zeichen, höchstens 72 Byte (bcrypt; Umlaute zählen doppelt).
- Setzt per `auth.admin.updateUserById(user_id, { password, email_confirm: true, user_metadata: { passwort_wechseln: true } })`.
- Rate-Limit: höchstens ein Aufruf je 3 Sekunden und Aufrufer (im Speicher der Funktionsinstanz, jeder Versuch zählt).
- Protokoll (wer, für wen, wann, ohne Passwortdaten) in `passwort_log`, nur vom Geschäftsführer lesbar; fehlt die Tabelle, funktioniert die
  Funktion trotzdem (nur ohne Protokollzeile).
- **Kein neues Secret nötig**: `SUPABASE_URL` und `SUPABASE_SERVICE_ROLE_KEY` stellt Supabase der Funktion automatisch bereit.

Einspielen:

1. Optional `migrations/20261102000000_passwort_log.sql` einspielen (setzt `ist_geschaeftsfuehrer()` aus `20261030000000_verteilung.sql` voraus).
2. Funktion bündeln und deployen (ohne Gateway-JWT-Prüfung):
   `node_modules/.bin/rolldown supabase/functions/mitarbeiter-passwort/index.ts -f esm -p neutral -e "jsr:@supabase/supabase-js@2" -o <ziel>.js`
   bzw. per CLI `supabase functions deploy mitarbeiter-passwort --no-verify-jwt`.
3. Frontend ist über GitHub Pages bereits ausgeliefert. Ohne deployte Funktion zeigt der Dialog „noch nicht eingerichtet“.

Tests (ohne Netzwerk, gefakte Auth/Datenbank): `functions/_shared/passwort_handler.test.ts`. Nur gegen Fakes geprüft, nie gegen das echte Supabase.

## QA-Haertung 03.11.2026

Migration `migrations/20261103000000_qa_haertung.sql` (wiederholbar; verlangt init, auth_profile_trigger, telefonie und verteilung; `20261030000100_telefonie_neo` und `20261102000000_passwort_log` sind nicht noetig). Sie wurde mit allen anderen Migrationen in einer lokalen Postgres-Engine (PGlite, `supabase/tests/migrationen.test.mjs`) zweimal hintereinander eingespielt und auf Rechte, RLS und Funktionen geprueft. Das Supabase-Geruest dort ist nachgebaut (Rollen, `auth.uid()`, `auth.users`); echtes Auth-Schema, Realtime und Edge Functions sind nicht dabei.

**Einspielreihenfolge**

1. Migration `20261103000000_qa_haertung.sql` im SQL-Editor ausfuehren.
2. Danach die Funktionen `leads`, `anrufen`, `telefonie-verbinden` und `mitarbeiter-passwort` neu buendeln und ersetzen (rolldown-Befehl siehe oben; `_shared` wird mitgebuendelt). Zwischen Schritt 1 und 2 funktioniert die alte Funktion `leads` weiter (die alte `ingest_lead`-Signatur bleibt als Huelle bestehen); die alte `anrufen` schreibt weiter ihre Zeile erst nach dem Anruf. Die Funktion `mitarbeiter-passwort` braucht die neue Tabellenform (Schritt 1).
3. Frontend ist ueber GitHub Pages bereits ausgeliefert; es faellt auf fruehere Stande zurueck, solange die Migration fehlt.

**Was sich aendert**

- **Lesezugriff:** Mitarbeiter sehen nur freie und eigene Leads (Geschaeftsfuehrer alle); Notizen und Anrufe nur zu sichtbaren Leads; Realtime folgt dieser Regel. `consent_records` liest nur der Geschaeftsfuehrer, ohne `einwilligung_ip` und `payload_roh` (Spaltenrechte); alle anderen bekommen den Nachweis ohne IP ueber die Funktion `lead_einwilligung` fuer sichtbare Leads. `auth.uid()` und `ist_geschaeftsfuehrer()` stehen als `(select ...)` in den Policies.
- **Rechte:** `api_keys` und `consent_records` fuer anon/authenticated gesperrt (consent: nur die genannten Spalten), `anon` hat auf `leads`, `lead_notizen`, `anrufe`, `profiles` nichts; `authenticated` hat auf `leads`/`profiles` kein insert/delete/truncate/references/trigger; `lead_notizen` und `anrufe` nur select und gezieltes insert (TRUNCATE umgeht RLS, deshalb Tabellenrechte). Trigger-Funktionen (`handle_new_user`, `set_updated_at`, `profiles_pruefe_zeitzone` und die neuen) sind nicht mehr direkt aufrufbar; die Trigger laufen weiter, weil Postgres EXECUTE nur beim Anlegen eines Triggers prueft (im Test: Profile entstehen beim Anlegen eines Auth-Nutzers weiter).
- **Statuswaechter** (`leads_status_guard`): Ein Nicht-Geschaeftsfuehrer darf einen Lead nicht aus verstorben / nicht_mehr_pkv / kein_interesse / schon_umgestellt oder aus einer Sperre (`gesperrt_am` gesetzt) herausholen (Fehler 42501). Ohne `auth.uid()` (SQL-Editor, service_role) greift er nicht ein. Da es den Status "gesperrt" nicht gibt, gilt `gesperrt_am is not null` als gesperrt.
- **Sperre/Widerruf:** `leads.gesperrt_am`, `leads.sperrgrund`, Tabelle `sperrliste` (nur Geschaeftsfuehrer lesbar, kein Client-Schreibzugriff), `lead_sperren(lead, grund)` (Besitzer oder Geschaeftsfuehrer; setzt Status kein_interesse, falls noch offen, traegt die Nummer ein und sperrt weitere Leads mit derselben Nummer), `lead_entsperren` (nur Geschaeftsfuehrer; der Status bleibt). `ingest_lead`: Nummer auf der Sperrliste ergibt einen angelegten, aber sofort gesperrten Lead (Status kein_interesse); Dubletten werden auch gegen geschlossene Leads markiert.
- **Zentrale Pruefung** `darf_angerufen_werden(lead)`: Einwilligung vorhanden und nicht aelter als `einwilligung_max_alter()` (**365 Tage ist ein Platzhalter und muss anwaltlich geklaert werden**, gemessen ab `einwilligung_zeit`), nicht gesperrt (Lead und Sperrliste), kein Testlead, Status offen. Genutzt von der Ansicht `anrufbare_leads` (zusaetzlich nur Status neu/kontaktiert/nicht_erreicht und faellige Wiedervorlage), der Policy fuer Anrufe und als letzte Instanz in der Funktion `anrufen`.
- **Statuslisten:** `uebernehmbare_status()` (neu, kontaktiert, nicht_erreicht), `offene_status()`, `geschuetzte_status()` sind SQL-Funktionen; TypeScript (`UEBERNEHMBARE_STATUS`, `OFFENE_STATUS`) wird per Test gegen die Migration geprueft. Freie Leads in termin_vereinbart/beratung kann ein Mitarbeiter weiterhin nicht uebernehmen (Geschaeftsfuehrer weist zu), auch nicht ueber `anrufen`.
- **Obergrenze:** `lead_uebernehmen` verweigert mit Fehler 53400, wenn jemand schon `max_offene_eigene_leads()` (50) offene eigene Leads (neu/kontaktiert/nicht_erreicht) hat; gilt auch fuer den Geschaeftsfuehrer. `anrufen` nutzt dieselbe Datenbankfunktion (`lead_uebernehmen_fuer`).
- **Anrufe-Protokoll:** Der Browser darf nur noch `lead_id, user_id, kanal` einfuegen, und nur fuer eigene, anrufbare Leads; ein Trigger erzwingt die Limits auch dort. Die Funktion `anrufen` **reserviert** den Anruf vor dem sipgate-Aufruf atomar (`anruf_reservieren`: Limits und Protokollzeile), uebernimmt dann den Lead, ruft an und traegt die Anbieter-ID nach. Limits (DB-gestuetzt): pro Lead hoechstens 1 Anruf je 10 Minuten, pro Nutzer 30 je Stunde, 3 Sekunden Abstand. Scheitert die Uebernahme oder sipgate, wird die reservierte Zeile **geloescht**: das Protokoll zeigt nur wirklich ausgeloeste Anrufe, gescheiterte Versuche verbrauchen kein Limit und es braucht keine neue Spalte (die Fehlerursache steht im Funktionslog, nur mit Status/Code). Bleibt eine Zeile ohne Anbieter-ID zurueck (Absturz zwischen den Schritten), ist das sichtbar und harmlos.
- **Einwilligungsnachweis:** neue Spalten `text_sha256` (vom Webhook berechnet; bestehende Zeilen werden nachgetragen), `payload_roh` (Originalbody ohne `authorization`), `einwilligung_version`, `kanal`, `begunstigter`, `user_agent`, `rufnummer_verifiziert` (alle optional, mit Laengengrenzen). UPDATE, DELETE und TRUNCATE auf `consent_records` sind per Trigger verboten, der Fremdschluessel zum Lead ist `on delete restrict` (ein Lead mit Nachweis laesst sich nicht loeschen). Eine spaetere Anonymisierung muss bewusst und protokolliert laufen: `alter table public.consent_records disable trigger consent_records_unveraenderlich;` ... `enable trigger`. `passwort_log` hat keine Fremdschluessel mehr (Name und E-Mail werden als Text mitgeschrieben).
- **Webhook `leads`:** Allowlist nur deutsche Rufnummern (+49; Mobil 015x/016x/017x, Ortsnetz 02x-09x; gesperrt 0900, 0137, 0180, 0700, 0118, 032, 0190, 0800 und jede andere Landesvorwahl), Trunk-Null nach +49 wird entfernt, Laengengrenzen je Typ (`_shared/rufnummer.ts`); dieselbe Pruefung in der Funktion `anrufen` (Altdaten) und fuer eigene/angezeigte Rufnummern in den Telefonie-Einstellungen. Steuerzeichen in allen Textfeldern (auch Zeilenumbrueche im Einwilligungstext) werden abgelehnt. `eingang_zeit` nicht aelter als 30 Tage und nicht in der Zukunft (5 Minuten Toleranz), `einwilligung_zeit` nicht nach `eingang_zeit` plus 5 Minuten, Jahr ab 2000, unmoegliche Daten (31. Februar) werden abgelehnt, IPv4/IPv6 werden echt geprueft, der Einwilligungstext darf nicht aus einem wiederholten Zeichen bestehen. Datenbankfehler der Klassen 22/23 (Daten/Constraints) ergeben 400 mit allgemeinem Text, alles andere 500; geloggt wird nur der Fehlercode. Body-Limit 16 KB (Content-Length vorab, sonst beim Lesen) mit 413.
- **Telefonie-Funktionen:** Body-Limit 8 KB mit 413 (auch `anrufen`, `telefonie-verbinden`, `mitarbeiter-passwort`), Bearer-Schema ohne Beachtung der Gross-/Kleinschreibung, ein nicht erreichbarer Auth-Dienst ergibt 502 statt eines Absturzes (jeweils JSON mit CORS-Headern); Datenbankfehler werden nur mit Code geloggt.
- **`mitarbeiter-passwort`:** Die Protokollzeile wird VOR dem Setzen geschrieben (scheitert sie, bleibt das Passwort unveraendert, 500). Danach werden die Sitzungen des Zielnutzers per SQL-Funktion `nutzer_sitzungen_beenden` geloescht (`auth.sessions`, `auth.refresh_tokens`); die Admin-API von supabase-js bietet ohne das JWT des Nutzers nichts Vergleichbares. Bereits ausgestellte Zugriffstoken gelten bis zu ihrem Ablauf (Standard 1 Stunde). Schlaegt das Beenden fehl, ist das Passwort trotzdem gesetzt (Antwort `sitzungenBeendet: false`). Das Metadaten-Kennzeichen `passwort_wechseln` ist **nur eine Hilfe der Oberflaeche**, keine Sicherheitsmassnahme: Wer das temporaere Passwort kennt, kann sich mit der API ohne Passwortwechsel anmelden; die Funktion setzt zudem ein 12+ Zeichen langes Passwort, das der Geschaeftsfuehrer telefonisch weitergibt.

**Bekannte Grenzen**

- Mitarbeiter sehen Leads anderer nicht mehr (Dashboard-Zahlen und Listen zeigen fuer sie nur freie, uebernehmbare und eigene Leads). Realtime meldet Zuweisungen an andere NICHT (die Zeile wird fuer den Mitarbeiter unsichtbar, ein Ereignis kommt nicht an). Das Frontend faengt das auf: es laedt alle 60 Sekunden, beim Zurueckkehren in den Tab und bei wiederkehrender Verbindung komplett nach und prueft im Power Dialer beim Wechsel zum Lead und vor dem Anruf den aktuellen Lead frisch.
- Der Wert fuer das Maximalalter der Einwilligung (365 Tage), die Obergrenze (50) und die Anruflimits sind Vorschlaege; sie stehen an je einer Stelle (SQL-Funktionen bzw. `anruf_limit_grund`).
- Das Rate-Limit der Funktion `mitarbeiter-passwort` liegt weiter im Instanzspeicher.
- Die Funktion `nutzer_sitzungen_beenden` greift auf das Auth-Schema zu; ob die Rolle `postgres` dort in jedem Projekt loeschen darf, ist ungeprueft (im Fehlerfall bleibt das Passwort gesetzt, nur die alten Sitzungen laufen weiter).

## Frontend-Runde 2 (03.11.2026)

- Migration `migrations/20261103000100_status_zeitpunkt.sql` (nach `20261103000000_qa_haertung.sql`, wiederholbar): Spalte `leads.status_geaendert_am` (Trigger bei Statuswechsel, Backfill = `updated_at`, `updated_at` bleibt dabei unveraendert) und neu erstellte Ansicht `anrufbare_leads`. Dashboard ("Gewonnen", "Termine") und Team-Seite zaehlen danach nach diesem Zeitpunkt; ohne die Migration faellt das Frontend automatisch auf `updated_at` zurueck.
- Das Frontend liest die Lead-Spalten stufenweise (mit/ohne `status_geaendert_am`, `gesperrt_am`/`sperrgrund`, `zugewiesen_von`/`uebernommen_am`) und funktioniert deshalb auch dann, wenn eine Migration noch fehlt.
- Neu im Frontend (nutzt die RPCs `lead_sperren`/`lead_entsperren` und `lead_einwilligung` aus der QA-Haertung): Sperr-Dialog "Widerruf / nicht mehr anrufen" im Lead-Detail und im Power Dialer, Entsperren fuer den Geschaeftsfuehrer, tel:-Anrufe nur nach Uebernahme und erfolgreichem Protokoll.

## QA-Nachpruefung (Runde 3, 03.11.2026)

Migration `migrations/20261103000200_qa_nachpruefung.sql` (nach `...000000` und `...000100`, wiederholbar; im Test `supabase/tests/migrationen.test.mjs` zweimal ausgefuehrt):

- `geschuetzte_status()` enthaelt jetzt auch `verloren` und `gewonnen`: Mitarbeiter duerfen darauf abschliessen, aber nicht mehr zurueckdrehen. `lead_sperren` nutzt dieselbe Liste.
- Die Obergrenze offener eigener Leads (50) zaehlt alle offenen Status (auch `termin_vereinbart`, `beratung`).
- `leads_select`: FREIE Leads sind fuer Mitarbeiter nur sichtbar, wenn sie uebernehmbar sind (neu/kontaktiert/nicht_erreicht), nicht gesperrt und kein Testlead; eigene Leads und die Sicht des Geschaeftsfuehrers unveraendert. `lead_einwilligung` folgt derselben Regel.
- `lead_sperren`: FREIE, noch nicht gesperrte Leads kann jeder angemeldete Nutzer ohne vorherige Uebernahme sperren; zugewiesene (oder schon gesperrte) nur Besitzer oder Geschaeftsfuehrer. Beim Mitsperren weiterer Leads mit derselben Nummer gilt dieselbe Statuslogik (offen -> kein_interesse).
- `anrufe_limit_guard` prueft zuerst `user_id = auth.uid()` (sonst 42501), damit keine Limits fremder Nutzer verraten werden. Limit-Fehler (Anrufe und Obergrenze) haben SQLSTATE `PT429` (PostgREST liefert daraus HTTP 429, die Meldung beginnt mit `anruf_limit:` bzw. `limit_offene_leads:`); das Frontend erkennt sie am Code und am Text.
- `anrufbare_leads` ist fuer anon/authenticated nur noch lesbar.
- Datenbereinigung: Rufnummern der Form `+490...` werden zu `+49...` (Leads: `updated_at` bleibt unveraendert; Sperrliste: bei Schluesselkonflikt bleibt der aeltere Eintrag).

Funktionen (neu buendeln und ersetzen): `leads` (Originalbody `payload_roh` enthaelt nur noch die dokumentierten Felder), `anrufen` und `telefonie-verbinden` (siehe unten; beide teilen `_shared`). `mitarbeiter-passwort` ist unveraendert.

- **Unklarer Ausgang bei sipgate:** Kommt auf die Anruf-Anfrage keine definitive Antwort (Zeitueberschreitung, Verbindungsabbruch), bleibt die reservierte Zeile stehen (`provider_call_id` leer), die Funktion antwortet 502 mit Code `anbieter_unklar` und neutraler Meldung, und das Frontend wechselt nicht automatisch auf die Telefon-App, sondern bietet die manuelle Wahl an. Definitive Fehlerantworten (4xx/5xx von sipgate) loeschen die Reservierung weiter.
- **Eigene Rueckruf-/Anzeigenummer:** E.164 auch aus anderen Laendern erlaubt; deutsche Nummern durchlaufen die deutsche Allowlist; bekannte Premium-/Sonderpraefixe (nicht abschliessend: AT 0900/0901/0930/0931/0939, CH 0900/0901/0906, UK 09x/070, NANP 900, +979/+882/+883/+881/+870) sind gesperrt. Lead-Zielnummern bleiben deutsch-only.
