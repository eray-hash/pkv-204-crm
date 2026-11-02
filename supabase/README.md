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
