import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

// Spielt ALLE Migrationen in einer lokalen Postgres-Engine (PGlite) mit einem kleinen Supabase-Geruest ein (Rollen anon/authenticated/service_role,
// auth.users, auth.uid()) und prueft Rechte, Row Level Security, Funktionen und Trigger. Kein Netzwerk, keine echte Datenbank.
// Grenzen: pgcrypto ist durch sha256() ersetzt, Realtime, Edge Functions und das echte Auth-Schema werden nicht nachgebildet.
const migrationen = new URL('../migrations/', import.meta.url)
const dir = migrationen.pathname.replace(/%20/g, ' ')

test('Migrationen: Rechte, RLS, Funktionen und Trigger verhalten sich wie vorgesehen (PGlite)', { timeout: 180000 }, async () => {
const db = new PGlite()
await db.exec(readFileSync(new URL('./supabase_geruest.sql', import.meta.url), 'utf8'))
const dateien = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
for (const f of dateien) await db.exec(readFileSync(dir + f, 'utf8').replace('create extension if not exists pgcrypto with schema extensions;', ''))
// Wiederholbarkeit: die drei QA-Migrationen in Reihenfolge ein zweites Mal ausfuehren
for (const f of dateien.filter((x) => x.startsWith('20261103'))) await db.exec(readFileSync(dir + f, 'utf8'))

const GF = '10000000-0000-4000-8000-000000000001', A = '10000000-0000-4000-8000-000000000002', B = '10000000-0000-4000-8000-000000000003'
await db.exec(`insert into auth.users (id, email) values ('${GF}','gf@x.test'), ('${A}','a@x.test'), ('${B}','b@x.test');
  update public.profiles set rolle='geschaeftsfuehrer' where id='${GF}';
  insert into public.api_keys (id, lieferant, key_hash) values ('20000000-0000-4000-8000-000000000001','L','h');`)
const profiles = await db.query('select count(*)::int n from public.profiles'); assert.equal(profiles.rows[0].n, 3, 'Auth-Trigger legt Profile an')

async function als(rolle, uid, fn) {
  await db.exec('reset role')
  await db.exec(`set role ${rolle}`)
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid ?? ''])
  try { return await fn() } finally { await db.exec('reset role'); await db.query(`select set_config('request.jwt.claim.sub','',false)`) }
}
const fehler = async (p, code) => { try { await p; assert.fail('Fehler erwartet ' + code) } catch (e) { if (e.name === 'AssertionError') throw e; if (code) assert.equal(e.code ?? e.message, code, e.message) ; return e } }
const q = (sql, params) => db.query(sql, params)
async function ingest(tel, ext) {
  const r = await als('service_role', null, () => q(`select * from public.ingest_lead('20000000-0000-4000-8000-000000000001', $1, 'Test Person', $2, 't@x.test', 'Ges', 100, 'q', now(), now() - interval '1 day', 'Ich willige ein, kontaktiert zu werden.', 'https://x.test', '203.0.113.7', false, null, '{"a":1}'::jsonb, 'v1', 'web', 'Firma', 'UA', true)`, [ext, tel]))
  return r.rows[0]
}
const l1 = await ingest('+4915111111111', 'e1'), l2 = await ingest('+4915122222222', 'e2'), l3 = await ingest('+4915133333333', 'e3')
assert.equal(l1.o_neu_angelegt, true)
assert.equal((await ingest('+4915111111111', 'e1')).o_neu_angelegt, false)
// alte 14-Parameter-Signatur funktioniert weiter
const alt = await als('service_role', null, () => q(`select * from public.ingest_lead('20000000-0000-4000-8000-000000000001','e-alt','Alt Person','+4915144444444','a@x.test','G',50,null,now(),now(),'Ich willige ein, kontaktiert zu werden.','q',null,false)`))
assert.equal(alt.rows[0].o_neu_angelegt, true)
const sha = await q(`select text_sha256 from public.consent_records where lead_id=$1`, [l1.o_lead_id]); assert.equal(sha.rows[0].text_sha256.length, 64)
const shaAlt = await q(`select text_sha256 from public.consent_records where lead_id=$1`, [alt.rows[0].o_lead_id]); assert.equal(shaAlt.rows[0].text_sha256.length, 64)

// Dublette gegen geschlossenen Lead
await db.exec(`update public.leads set status='kein_interesse' where id='${l3.o_lead_id}'`)
const dup = await ingest('+4915133333333', 'e3b')
assert.equal((await q('select moegliches_duplikat_von d from public.leads where id=$1', [dup.o_lead_id])).rows[0].d, l3.o_lead_id, 'Duplikat auch gegen geschlossene')

// --- RLS Leads ---
let sichtA = (await als('authenticated', A, () => q('select id from public.leads'))).rows.length
assert.equal(sichtA, 4, 'A sieht freie Leads in uebernehmbarem Status (der geschlossene l3 ist fuer Mitarbeiter unsichtbar)')
assert.equal(await als('authenticated', A, async () => (await q('select public.lead_uebernehmen($1) r', [l1.o_lead_id])).rows[0].r), true)
assert.equal(await als('authenticated', B, async () => (await q('select public.lead_uebernehmen($1) r', [l1.o_lead_id])).rows[0].r), false, 'B bekommt vergebenen Lead nicht')
assert.equal((await als('authenticated', B, () => q('select id from public.leads where id=$1', [l1.o_lead_id]))).rows.length, 0, 'B sieht fremden Lead nicht')
assert.equal((await als('authenticated', GF, () => q('select id from public.leads where id=$1', [l1.o_lead_id]))).rows.length, 1, 'GF sieht alles')
assert.equal((await als('authenticated', A, () => q('select id from public.leads where id=$1', [l1.o_lead_id]))).rows.length, 1)

// --- Consent ---
assert.equal((await als('authenticated', A, () => q('select id from public.consent_records'))).rows.length, 0, 'A sieht keine Consent-Zeilen')
await als('authenticated', A, () => fehler(q('select einwilligung_ip from public.consent_records'), '42501'))
await als('authenticated', A, () => fehler(q('select payload_roh from public.consent_records'), '42501'))
assert.equal((await als('authenticated', GF, () => q('select id, einwilligung_text from public.consent_records'))).rows.length >= 4, true, 'GF liest Consent (ohne IP-Spalte)')
await als('authenticated', GF, () => fehler(q('select einwilligung_ip from public.consent_records'), '42501'))
assert.equal((await als('authenticated', A, () => q('select * from public.lead_einwilligung($1)', [l1.o_lead_id]))).rows.length, 1)
assert.equal((await als('authenticated', B, () => q('select * from public.lead_einwilligung($1)', [l1.o_lead_id]))).rows.length, 0, 'B bekommt fremden Nachweis nicht')
assert.equal((await als('authenticated', B, () => q('select * from public.lead_einwilligung($1)', [l2.o_lead_id]))).rows.length, 1, 'freier Lead: Nachweis sichtbar')
const cols = (await als('authenticated', A, () => q('select * from public.lead_einwilligung($1)', [l1.o_lead_id]))).fields.map((f) => f.name)
assert.deepEqual(cols, ['einwilligung_zeit', 'einwilligung_text', 'einwilligung_quelle'])

// --- anrufbare_leads ---
const queueA = (await als('authenticated', A, () => q('select id from public.anrufbare_leads'))).rows.map((r) => r.id)
assert.ok(queueA.includes(l1.o_lead_id) && queueA.includes(l2.o_lead_id) && !queueA.includes(l3.o_lead_id), 'Queue: frei + eigen, nicht geschlossen')

// M6: freie Leads nur sichtbar, wenn uebernehmbar, nicht gesperrt und kein Testlead (GF sieht alles)
const frei = async (uid, id) => (await als('authenticated', uid, () => q('select id from public.leads where id=$1', [id]))).rows.length
assert.equal(await frei(A, l3.o_lead_id), 0, 'freier, geschlossener Lead ist fuer Mitarbeiter unsichtbar')
assert.equal(await frei(GF, l3.o_lead_id), 1)
for (const [spalte, wert] of [["status", "'beratung'"], ["status", "'termin_vereinbart'"], ["gesperrt_am", 'now()'], ["ist_test", 'true']]) {
  await db.exec(`update public.leads set ${spalte}=${wert} where id='${alt.rows[0].o_lead_id}'`)
  assert.equal(await frei(A, alt.rows[0].o_lead_id), 0, `frei + ${spalte}=${wert}: unsichtbar`)
  assert.equal(await frei(GF, alt.rows[0].o_lead_id), 1)
  assert.equal((await als('authenticated', A, () => q('select * from public.lead_einwilligung($1)', [alt.rows[0].o_lead_id]))).rows.length, 0, 'auch der Nachweis ist dann nicht abrufbar')
  assert.equal((await als('authenticated', GF, () => q('select * from public.lead_einwilligung($1)', [alt.rows[0].o_lead_id]))).rows.length, 1)
  await db.exec(`update public.leads set status='neu', gesperrt_am=null, ist_test=false where id='${alt.rows[0].o_lead_id}'`)
}
assert.equal(await frei(A, alt.rows[0].o_lead_id), 1)

// Beratung/termin_vereinbart frei: nicht uebernehmbar, nicht in Queue
await db.exec(`update public.leads set status='beratung' where id='${l2.o_lead_id}'`)
assert.equal(await als('authenticated', B, async () => (await q('select public.lead_uebernehmen($1) r', [l2.o_lead_id])).rows[0].r), false)
assert.equal((await q(`select public.lead_uebernehmen_fuer($1,$2) r`, [l2.o_lead_id, B])).rows[0].r, 'nicht_uebernehmbar')
assert.ok(!(await als('authenticated', B, () => q('select id from public.anrufbare_leads'))).rows.some((r) => r.id === l2.o_lead_id))
await db.exec(`update public.leads set status='neu' where id='${l2.o_lead_id}'`)

// --- Obergrenze ---
await db.exec(`insert into public.leads (api_key_id, externe_id, name, telefon, email, gesellschaft, tarifbeitrag, eingang_zeit, zugewiesen_an)
  select '20000000-0000-4000-8000-000000000001', 'bulk'||g, 'Bulk', '+4915100'||lpad(g::text,6,'0'), 'b@x.test', 'G', 10, now(), '${B}' from generate_series(1,50) g`)
const lim = await fehler(als('authenticated', B, () => q('select public.lead_uebernehmen($1)', [l2.o_lead_id])), 'PT429')
assert.match(lim.message, /limit_offene_leads/)
assert.equal((await q(`select public.lead_uebernehmen_fuer($1,$2) r`, [l2.o_lead_id, B])).rows[0].r, 'limit')
// M5: die Obergrenze zaehlt auch termin_vereinbart und beratung
for (const st of ['termin_vereinbart', 'beratung']) {
  await db.exec(`update public.leads set status='${st}' where externe_id like 'bulk%'`)
  assert.equal((await q(`select public.lead_uebernehmen_fuer($1,$2) r`, [l2.o_lead_id, B])).rows[0].r, 'limit', st)
}
await db.exec(`update public.leads set status='kontaktiert' where externe_id like 'bulk%'`)

// --- Anrufe ---
await als('authenticated', A, () => q(`insert into public.anrufe (lead_id, user_id, kanal) values ($1,$2,'mobil')`, [l1.o_lead_id, A]))
await als('authenticated', A, () => fehler(q(`insert into public.anrufe (lead_id, user_id, kanal) values ($1,$2,'mobil')`, [l1.o_lead_id, A]), 'PT429'))
// N2: fuer einen anderen Benutzer protokollieren ergibt 42501 und verraet keine Limits (kein PT429, obwohl der Lead gerade angerufen wurde)
await als('authenticated', A, () => fehler(q(`insert into public.anrufe (lead_id, user_id, kanal) values ($1,$2,'mobil')`, [l1.o_lead_id, B]), '42501'))
await db.exec(`update public.anrufe set gestartet_am = now() - interval '20 minutes'`) // Abstand/Lead-Limit zurueckdatieren, damit die Policies einzeln geprueft werden
await als('authenticated', A, () => fehler(q(`insert into public.anrufe (lead_id, user_id, kanal) values ($1,$2,'mobil')`, [l2.o_lead_id, A]), '42501')) // fremder/freier Lead (RLS)
await als('authenticated', A, () => fehler(q(`insert into public.anrufe (lead_id, user_id, kanal) values ($1,$2,'mobil')`, [l1.o_lead_id, B]), '42501')) // fremde user_id
await als('authenticated', A, () => fehler(q(`insert into public.anrufe (lead_id, user_id, kanal, anbieter) values ($1,$2,'mobil','x')`, [l1.o_lead_id, A]), '42501')) // Spalte ohne Grant
assert.equal((await als('authenticated', A, () => q('select id from public.anrufe'))).rows.length, 1)
assert.equal((await als('authenticated', B, () => q('select id from public.anrufe'))).rows.length, 0, 'B sieht fremde Anrufe nicht')
const res1 = await als('service_role', null, () => q(`select * from public.anruf_reservieren($1,$2,'mobil','sipgate_classic')`, [l3.o_lead_id, GF])); assert.ok(res1.rows[0].o_id)
const res2 = await als('service_role', null, () => q(`select * from public.anruf_reservieren($1,$2,'mobil','sipgate_classic')`, [l3.o_lead_id, GF])); assert.equal(res2.rows[0].o_grund, 'lead_limit')
// Nutzer-Limit: 30 pro Stunde
await db.exec(`insert into public.anrufe (lead_id, user_id, kanal, gestartet_am) select '${l2.o_lead_id}', '${B}', 'mobil', now() - interval '30 minutes' - (g||' seconds')::interval from generate_series(1,30) g`)
const res3 = await als('service_role', null, () => q(`select * from public.anruf_reservieren($1,$2,'mobil','sipgate_classic')`, [alt.rows[0].o_lead_id, B])); assert.equal(res3.rows[0].o_grund, 'nutzer_limit')

// --- Statuswaechter ---
await als('authenticated', A, () => q(`update public.leads set status='kein_interesse' where id=$1`, [l1.o_lead_id]))
await als('authenticated', A, () => fehler(q(`update public.leads set status='neu' where id=$1`, [l1.o_lead_id]), '42501'))
await als('authenticated', GF, () => q(`update public.leads set status='neu' where id=$1`, [l1.o_lead_id]))
// M4: Abschluss auf gewonnen/verloren ist erlaubt, Zurueckdrehen nur fuer den Geschaeftsfuehrer
for (const abschluss of ['gewonnen', 'verloren']) {
  await als('authenticated', A, () => q(`update public.leads set status='${abschluss}' where id=$1`, [l1.o_lead_id]))
  await als('authenticated', A, () => fehler(q(`update public.leads set status='neu' where id=$1`, [l1.o_lead_id]), '42501'))
  await als('authenticated', GF, () => q(`update public.leads set status='neu' where id=$1`, [l1.o_lead_id]))
}
assert.deepEqual((await q('select public.geschuetzte_status() s')).rows[0].s.sort(), ['gewonnen', 'kein_interesse', 'nicht_mehr_pkv', 'schon_umgestellt', 'verloren', 'verstorben'])
// Direkte Updates anderer Spalten bleiben verboten
await als('authenticated', A, () => fehler(q(`update public.leads set telefon='+4915199999999' where id=$1`, [l1.o_lead_id]), '42501'))
await als('authenticated', A, () => fehler(q(`update public.leads set gesperrt_am=null where id=$1`, [l1.o_lead_id]), '42501'))

// --- Sperre ---
assert.equal(await als('authenticated', A, async () => (await q('select public.lead_sperren($1,$2) r', [l1.o_lead_id, 'Widerruf'])).rows[0].r), true)
let s = (await q('select status, gesperrt_am, sperrgrund from public.leads where id=$1', [l1.o_lead_id])).rows[0]
assert.equal(s.status, 'kein_interesse'); assert.ok(s.gesperrt_am); assert.equal(s.sperrgrund, 'Widerruf')
assert.equal((await q(`select count(*)::int n from public.sperrliste where telefon='+4915111111111'`)).rows[0].n, 1)
assert.equal((await q('select public.darf_angerufen_werden($1) r', [l1.o_lead_id])).rows[0].r, false)
await als('authenticated', B, () => fehler(q('select public.lead_sperren($1,$2)', [l1.o_lead_id, 'x']), '42501')) // zugewiesen an A und B ist weder Besitzer noch GF
await als('authenticated', A, () => fehler(q('select public.lead_entsperren($1)', [l1.o_lead_id]), '42501'))
await als('authenticated', A, () => fehler(q(`update public.leads set status='neu' where id=$1`, [l1.o_lead_id]), '42501')) // gesperrt: kein Statuswechsel
await als('authenticated', A, () => fehler(q('select * from public.sperrliste'), null).catch(() => null))
assert.equal((await als('authenticated', A, () => q('select * from public.sperrliste'))).rows.length, 0, 'Sperrliste nur GF')
assert.equal((await als('authenticated', GF, () => q('select * from public.sperrliste'))).rows.length, 1)
const neuGesperrt = await ingest('+4915111111111', 'e1-neu')
const ng = (await q('select status, gesperrt_am from public.leads where id=$1', [neuGesperrt.o_lead_id])).rows[0]
assert.equal(ng.status, 'kein_interesse'); assert.ok(ng.gesperrt_am, 'Ingest einer gesperrten Nummer: angelegt aber gesperrt')
assert.equal((await q('select public.darf_angerufen_werden($1) r', [neuGesperrt.o_lead_id])).rows[0].r, false)
assert.equal(await als('authenticated', GF, async () => (await q('select public.lead_entsperren($1) r', [l1.o_lead_id])).rows[0].r), true)
assert.equal((await q(`select count(*)::int n from public.sperrliste`)).rows[0].n, 0)
assert.equal((await q('select gesperrt_am from public.leads where id=$1', [neuGesperrt.o_lead_id])).rows[0].gesperrt_am, null)

// M2 + N1: FREIE Leads kann jeder sperren, ohne sie vorher zu uebernehmen; weitere Leads mit derselben Nummer folgen mit gleicher Statuslogik
const fr = await ingest('+4915177777777', 'e-frei')
const fr2 = await ingest('+4915177777777', 'e-frei2')
await db.exec(`update public.leads set status='gewonnen' where id='${fr2.o_lead_id}'`)
const fr3 = await ingest('+4915177777777', 'e-frei3')
assert.equal(await als('authenticated', B, async () => (await q('select public.lead_sperren($1,$2) r', [fr.o_lead_id, 'Widerruf per Telefon'])).rows[0].r), true)
const zeile = async (id) => (await q('select status, gesperrt_am, sperrgrund, zugewiesen_an from public.leads where id=$1', [id])).rows[0]
let z = await zeile(fr.o_lead_id)
assert.equal(z.status, 'kein_interesse'); assert.ok(z.gesperrt_am); assert.equal(z.zugewiesen_an, null, 'nicht uebernommen')
z = await zeile(fr3.o_lead_id)
assert.equal(z.status, 'kein_interesse', 'N1: offener Lead mit gleicher Nummer wird geschlossen'); assert.ok(z.gesperrt_am)
z = await zeile(fr2.o_lead_id)
assert.equal(z.status, 'gewonnen', 'N1: geschuetzter Status bleibt'); assert.ok(z.gesperrt_am)
await als('authenticated', B, () => fehler(q('select public.lead_sperren($1,$2)', [fr.o_lead_id, 'nochmal']), '42501')) // schon gesperrt: nur Besitzer/GF
assert.equal(await als('authenticated', GF, async () => (await q('select public.lead_entsperren($1) r', [fr.o_lead_id])).rows[0].r), true)

// N11: die Ansicht anrufbare_leads ist nur lesbar
await als('authenticated', A, () => fehler(q(`update public.anrufbare_leads set name='x'`), '42501'))
await als('authenticated', A, () => fehler(q(`delete from public.anrufbare_leads`), '42501'))
await als('anon', null, () => fehler(q('select * from public.anrufbare_leads'), '42501'))

// --- darf_angerufen_werden: Einwilligung zu alt / Testlead ---
await db.exec('alter table public.consent_records disable trigger consent_records_unveraenderlich')
await db.exec(`update public.consent_records set einwilligung_zeit = now() - interval '400 days' where lead_id='${l2.o_lead_id}'`)
await db.exec('alter table public.consent_records enable trigger consent_records_unveraenderlich')
assert.equal((await q('select public.darf_angerufen_werden($1) r', [l2.o_lead_id])).rows[0].r, false, 'Einwilligung aelter als 365 Tage')
assert.equal((await q('select public.darf_angerufen_werden($1) r', [alt.rows[0].o_lead_id])).rows[0].r, true)

// --- Unveraenderlichkeit, FK, Grants ---
await fehler(db.exec(`update public.consent_records set einwilligung_text='x'`), '42501')
await fehler(db.exec(`delete from public.consent_records`), '42501')
await fehler(db.exec(`truncate public.consent_records`), '42501')
await fehler(db.exec(`delete from public.leads where id='${l2.o_lead_id}'`), '23001')
await als('authenticated', A, () => fehler(q('truncate public.lead_notizen'), '42501'))
await als('authenticated', A, () => fehler(q('truncate public.anrufe'), '42501'))
await als('authenticated', A, () => fehler(q('select * from public.api_keys'), '42501'))
await als('authenticated', A, () => fehler(q(`insert into public.leads (api_key_id, externe_id, name, telefon, email, gesellschaft, tarifbeitrag, eingang_zeit) values ('20000000-0000-4000-8000-000000000001','x','x','+4915100','e','g',1,now())`), '42501'))
await als('anon', null, () => fehler(q('select * from public.leads'), '42501'))
await als('anon', null, () => fehler(q('select * from public.profiles'), '42501'))
await als('authenticated', A, () => fehler(q('select public.handle_new_user()'), '42501'))
await als('authenticated', A, () => fehler(q('select public.nutzer_sitzungen_beenden($1)', [B]), '42501'))
await als('authenticated', A, () => fehler(q(`select public.anruf_reservieren($1,$2,'mobil','x')`, [l1.o_lead_id, A]), '42501'))
await als('authenticated', A, () => fehler(q(`select public.lead_uebernehmen_fuer($1,$2)`, [l1.o_lead_id, A]), '42501'))
await als('authenticated', A, () => fehler(q('select * from public.ingest_lead()'), null).catch(() => null))
// Notizen
await als('authenticated', A, () => q(`insert into public.lead_notizen (lead_id, user_id, text) values ($1,$2,'hallo')`, [l1.o_lead_id, A]))
assert.equal((await als('authenticated', A, () => q('select id from public.lead_notizen'))).rows.length, 1)
assert.equal((await als('authenticated', B, () => q('select id from public.lead_notizen'))).rows.length, 0)
await als('authenticated', B, () => fehler(q(`insert into public.lead_notizen (lead_id, user_id, text) values ($1,$2,'x')`, [l1.o_lead_id, B]), '42501'))
// M3: Normalisierung "+490..." -> "+49..." (Wiederholung der Migration 20261103000200), Sperrliste: bei Konflikt bleibt der aeltere Eintrag
await db.exec(`insert into public.leads (api_key_id, externe_id, name, telefon, email, gesellschaft, tarifbeitrag, eingang_zeit)
  values ('20000000-0000-4000-8000-000000000001','schlecht1','S','+4901511234500','e@x.test','G',10,now())`)
const updAlt = (await q(`select updated_at u from public.leads where externe_id='schlecht1'`)).rows[0].u
await db.exec(`insert into public.sperrliste (telefon, grund, gesperrt_am) values
  ('+4901511111111','alt-schlecht', now() - interval '3 days'), ('+491511111111','neuer-korrekt', now() - interval '1 day'),
  ('+4901522222222','nur-schlecht', now()), ('+491533333333','alt-korrekt', now() - interval '5 days'), ('+4901533333333','neuer-schlecht', now() - interval '2 days')
  on conflict (telefon) do nothing`)
await db.exec(readFileSync(dir + '20261103000200_qa_nachpruefung.sql', 'utf8'))
await db.exec(readFileSync(dir + '20261103000200_qa_nachpruefung.sql', 'utf8')) // wiederholbar
assert.equal((await q(`select telefon t from public.leads where externe_id='schlecht1'`)).rows[0].t, '+491511234500')
assert.equal((await q(`select updated_at u from public.leads where externe_id='schlecht1'`)).rows[0].u.getTime(), updAlt.getTime(), 'updated_at bleibt unveraendert')
const sl = Object.fromEntries((await q(`select telefon, grund from public.sperrliste where telefon ~ '^\\+49(1511111111|1522222222|1533333333)'`)).rows.map((r) => [r.telefon, r.grund]))
assert.deepEqual(sl, { '+491511111111': 'alt-schlecht', '+491522222222': 'nur-schlecht', '+491533333333': 'alt-korrekt' })
assert.equal((await q(`select count(*)::int n from public.sperrliste where telefon ~ '^\\+490'`)).rows[0].n, 0)

// Zeitpunkt der letzten Statusaenderung (20261103000100)
const z0 = (await q('select status_geaendert_am z, updated_at u from public.leads where id=$1', [l2.o_lead_id])).rows[0]
assert.ok(z0.z, 'status_geaendert_am ist gesetzt')
await db.exec(`update public.leads set naechster_anruf_ab = now() + interval '1 day' where id='${l2.o_lead_id}'`)
const z1 = (await q('select status_geaendert_am z from public.leads where id=$1', [l2.o_lead_id])).rows[0]
assert.equal(z1.z.getTime(), z0.z.getTime(), 'andere Aenderungen lassen den Statuszeitpunkt unberuehrt')
await new Promise((r) => setTimeout(r, 20))
await db.exec(`update public.leads set status='kontaktiert' where id='${l2.o_lead_id}'`)
const z2 = (await q('select status_geaendert_am z from public.leads where id=$1', [l2.o_lead_id])).rows[0]
assert.ok(z2.z.getTime() > z0.z.getTime(), 'Statuswechsel setzt den Zeitpunkt neu')
// Sitzungen
await db.exec(`insert into auth.sessions (user_id) values ('${B}'); insert into auth.refresh_tokens (user_id) values ('${B}')`)
await als('service_role', null, () => q('select public.nutzer_sitzungen_beenden($1)', [B]))
assert.equal((await q('select count(*)::int n from auth.sessions')).rows[0].n, 0)
assert.equal((await q('select count(*)::int n from auth.refresh_tokens')).rows[0].n, 0)
// Profile: Rolle nicht aenderbar
await als('authenticated', A, () => fehler(q(`update public.profiles set rolle='geschaeftsfuehrer' where id=$1`, [A]), '42501'))
await als('authenticated', A, () => q(`update public.profiles set online=true where id=$1`, [A]))
await db.close()
})
