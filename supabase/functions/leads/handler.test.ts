// Webhook-Ablauf gegen gefakte Abhaengigkeiten (kein Netzwerk, keine Datenbank).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bereinigeRohbody, behandleLeadAnfrage, istEingabefehler, MAX_BODY_BYTES, type LeadDeps } from './handler.ts'

const jetzt = new Date('2026-10-23T10:20:00+02:00')
const SCHLUESSEL = 'geheimer-lieferantenschluessel'

const gueltig = {
  lead_id: 'L-100234',
  name: 'Max Mustermann',
  telefon: '+4915112345678',
  email: 'max@example.de',
  gesellschaft: 'Continentale',
  tarifbeitrag: 512.4,
  eingang_zeit: '2026-10-23T10:15:30+02:00',
  einwilligung_zeit: '2026-10-23T10:15:28+02:00',
  einwilligung_text: 'Ich willige ein, dass mich ein Vermittler telefonisch kontaktiert.',
  einwilligung_quelle: 'https://portal.example/vergleich',
  einwilligung_ip: '203.0.113.7',
}

interface Welt {
  deps: LeadDeps
  keyAbfragen: string[]
  ingests: Record<string, unknown>[]
  keyGueltig: boolean
  keyFehler: boolean
  ingestAntwort: { data: { o_lead_id: string; o_neu_angelegt: boolean }[] | null; fehlercode: string | null } | 'wirft'
}

function aufbau(): Welt {
  const w: Welt = {
    keyAbfragen: [],
    ingests: [],
    keyGueltig: true,
    keyFehler: false,
    ingestAntwort: { data: [{ o_lead_id: 'lead-1', o_neu_angelegt: true }], fehlercode: null },
    deps: undefined as unknown as LeadDeps,
  }
  w.deps = {
    jetzt: () => jetzt,
    sha256Hex: async (s) => `sha:${s}`,
    findeKey: async (hash) => {
      w.keyAbfragen.push(hash)
      if (w.keyFehler) throw new Error('db')
      return w.keyGueltig ? { id: 'key-1', ist_test: false } : null
    },
    ingest: async (params) => {
      w.ingests.push(params)
      if (w.ingestAntwort === 'wirft') throw new Error('netz')
      return w.ingestAntwort
    },
  }
  return w
}

const anfrage = (body: unknown, headers: Record<string, string> = { authorization: `Bearer ${SCHLUESSEL}` }, method = 'POST') =>
  new Request('http://x.test/leads', { method, headers, body: method === 'POST' ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined })

test('Webhook: nur POST (405), fehlender oder falscher Schluessel (401)', async () => {
  const w = aufbau()
  assert.equal((await behandleLeadAnfrage(anfrage(gueltig, {}, 'GET'), w.deps)).status, 405)
  assert.equal((await behandleLeadAnfrage(anfrage(gueltig, {}), w.deps)).status, 401)
  assert.equal((await behandleLeadAnfrage(anfrage(gueltig, { authorization: 'Basic abc' }), w.deps)).status, 401)
  assert.equal(w.keyAbfragen.length, 0, 'ohne Token keine Datenbankabfrage')
  w.keyGueltig = false
  const r = await behandleLeadAnfrage(anfrage(gueltig), w.deps)
  assert.equal(r.status, 401)
  assert.equal(w.ingests.length, 0)
})

test('Webhook: Bearer-Schema ist nicht von Gross-/Kleinschreibung abhaengig, nur der Hash wird abgefragt', async () => {
  const w = aufbau()
  const r = await behandleLeadAnfrage(anfrage(gueltig, { authorization: `bearer ${SCHLUESSEL}` }), w.deps)
  assert.equal(r.status, 201)
  assert.deepEqual(w.keyAbfragen, [`sha:${SCHLUESSEL}`])
})

test('Webhook: zu grosser Body ergibt 413 (Content-Length vorab und beim Lesen), ohne zu validieren oder zu speichern', async () => {
  const w = aufbau()
  // Content-Length vorab (Stub, da Request den Header nicht beliebig setzen laesst)
  const stub = {
    method: 'POST',
    headers: new Headers({ authorization: `Bearer ${SCHLUESSEL}`, 'content-length': String(MAX_BODY_BYTES + 1) }),
    body: null,
  } as unknown as Request
  assert.equal((await behandleLeadAnfrage(stub, w.deps)).status, 413)
  const gross = await behandleLeadAnfrage(anfrage('x'.repeat(MAX_BODY_BYTES + 10)), w.deps)
  assert.equal(gross.status, 413)
  assert.equal(w.ingests.length, 0)
})

test('Webhook: kaputtes JSON und ungueltige Felder ergeben 400', async () => {
  const w = aufbau()
  assert.equal((await behandleLeadAnfrage(anfrage('{kaputt'), w.deps)).status, 400)
  const r = await behandleLeadAnfrage(anfrage({ ...gueltig, telefon: '0900 1234567' }), w.deps)
  assert.equal(r.status, 400)
  assert.deepEqual((r.body as { fehler: { feld: string }[] }).fehler.map((f) => f.feld), ['telefon'])
  assert.equal(w.ingests.length, 0)
})

test('Webhook: gueltiger Lead wird angelegt (201) und mit allen Nachweisfeldern an die Datenbank gegeben', async () => {
  const w = aufbau()
  const body = { ...gueltig, einwilligung_version: 'v3', kanal: 'web', Authorization: 'Bearer geheim', begunstigter: 'Firma', user_agent: 'UA', rufnummer_verifiziert: false }
  const r = await behandleLeadAnfrage(anfrage(body), w.deps)
  assert.deepEqual(r, { status: 201, body: { id: 'lead-1', status: 'angenommen' } })
  const p = w.ingests[0]
  assert.equal(p.p_api_key_id, 'key-1')
  assert.equal(p.p_telefon, '+4915112345678')
  assert.equal(p.p_text_sha256, `sha:${gueltig.einwilligung_text}`)
  assert.equal(p.p_einwilligung_version, 'v3')
  assert.equal(p.p_kanal, 'web')
  assert.equal(p.p_begunstigter, 'Firma')
  assert.equal(p.p_user_agent, 'UA')
  assert.equal(p.p_rufnummer_verifiziert, false)
  const roh = p.p_payload_roh as Record<string, unknown>
  assert.equal(roh.lead_id, 'L-100234')
  assert.ok(!('Authorization' in roh) && !JSON.stringify(roh).includes('geheim'), 'Authorization nie im Rohbody')
  assert.equal(JSON.stringify(r).includes(SCHLUESSEL), false)
})

test('Webhook: bereits vorhandener Lead ergibt 200', async () => {
  const w = aufbau()
  w.ingestAntwort = { data: [{ o_lead_id: 'lead-1', o_neu_angelegt: false }], fehlercode: null }
  assert.deepEqual(await behandleLeadAnfrage(anfrage(gueltig), w.deps), { status: 200, body: { id: 'lead-1', status: 'bereits_vorhanden' } })
})

test('Webhook: Constraint-/Formatfehler der Datenbank ergeben 400 mit allgemeinem Text, echte Serverfehler 500', async () => {
  for (const code of ['23514', '23502', '22P02', '22001', '23505']) {
    const w = aufbau()
    w.ingestAntwort = { data: null, fehlercode: code }
    const r = await behandleLeadAnfrage(anfrage(gueltig), w.deps)
    assert.equal(r.status, 400, code)
    assert.ok(!JSON.stringify(r.body).includes(code))
  }
  for (const code of ['XX000', '53300', '08006', '40001', 'PGRST301', 'unbekannt']) {
    const w = aufbau()
    w.ingestAntwort = { data: null, fehlercode: code }
    assert.equal((await behandleLeadAnfrage(anfrage(gueltig), w.deps)).status, 500, code)
  }
  const w = aufbau()
  w.ingestAntwort = { data: [], fehlercode: null }
  assert.equal((await behandleLeadAnfrage(anfrage(gueltig), w.deps)).status, 500)
  w.ingestAntwort = 'wirft'
  assert.equal((await behandleLeadAnfrage(anfrage(gueltig), w.deps)).status, 500)
  w.keyFehler = true
  assert.equal((await behandleLeadAnfrage(anfrage(gueltig), w.deps)).status, 500)
})

test('Webhook: geloggt wird nur der Fehlercode, nie Eingabewerte', async () => {
  const w = aufbau()
  w.ingestAntwort = { data: null, fehlercode: '23514' }
  const zeilen: string[] = []
  const orig = console.error
  console.error = (...a: unknown[]) => void zeilen.push(a.map(String).join(' '))
  try {
    await behandleLeadAnfrage(anfrage(gueltig), w.deps)
  } finally {
    console.error = orig
  }
  assert.deepEqual(zeilen, ['ingest_lead fehlgeschlagen: 23514'])
  assert.ok(!zeilen.join('').includes('Mustermann'))
})

test('istEingabefehler: nur Klassen 22 und 23', () => {
  assert.equal(istEingabefehler('23514'), true)
  assert.equal(istEingabefehler('22P02'), true)
  assert.equal(istEingabefehler('XX000'), false)
  assert.equal(istEingabefehler(null), false)
  assert.equal(istEingabefehler('P0001'), false)
})

test('bereinigeRohbody entfernt authorization in jeder Schreibweise', () => {
  assert.deepEqual(bereinigeRohbody({ a: 1, AUTHORIZATION: 'x', authorization: 'y' }), { a: 1 })
  assert.deepEqual(bereinigeRohbody([1, 2]), [1, 2])
  assert.equal(bereinigeRohbody('text'), 'text')
})
