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
