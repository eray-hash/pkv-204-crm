// Tests ohne Netzwerk: gefakte Auth-/Datenbank-Zugriffe.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { behandlePasswortSetzen, MIN_ABSTAND_MS, type AuthAktualisierung, type PasswortDeps } from './passwort_handler.ts'

const GF = '11111111-1111-4111-8111-111111111111'
const MA = '22222222-2222-4222-8222-222222222222'
const UNBEKANNT = '33333333-3333-4333-8333-333333333333'
const PW = 'Sehr-Geheim-Passwort-42'

function aufbau(opts: { rollen?: Record<string, string>; vorhanden?: string[]; updateFehler?: boolean; logFehler?: boolean; start?: number; festeZeit?: boolean } = {}) {
  const rollen = opts.rollen ?? { [GF]: 'geschaeftsfuehrer', [MA]: 'mitarbeiter' }
  const vorhanden = new Set(opts.vorhanden ?? [GF, MA])
  const state = {
    zeit: opts.start ?? Date.parse('2026-11-02T10:00:00Z'),
    updates: [] as { id: string; attribute: AuthAktualisierung }[],
    logs: [] as { gesetzt_von: string; fuer_nutzer: string }[],
    letzte: new Map<string, number>(),
  }
  const deps: PasswortDeps = {
    // Standard: jeder Aufruf geschieht 10 s nach dem vorigen (Rate-Limit stoert nicht); festeZeit steuert die Zeit selbst
    jetzt: () => new Date(opts.festeZeit ? state.zeit : (state.zeit += 10_000)),
    ladeRolle: async (id) => rollen[id] ?? null,
    nutzerExistiert: async (id) => vorhanden.has(id),
    aktualisiereNutzer: async (id, attribute) => {
      if (opts.updateFehler) throw new Error(`GoTrue sagt: Passwort ${attribute.password} abgelehnt`)
      state.updates.push({ id, attribute })
    },
    protokolliere: async (e) => {
      if (opts.logFehler) throw new Error('tabelle fehlt')
      state.logs.push(e)
    },
    letzterAufruf: (id) => state.letzte.get(id) ?? null,
    merkeAufruf: (id, z) => void state.letzte.set(id, z),
  }
  return { deps, state }
}

/** Faengt alle console-Ausgaben waehrend eines Aufrufs ab. */
async function mitKonsole<T>(fn: () => Promise<T>): Promise<{ ergebnis: T; ausgabe: string }> {
  const zeilen: string[] = []
  const orig = { log: console.log, error: console.error, warn: console.warn, info: console.info }
  console.log = console.error = console.warn = console.info = (...a: unknown[]) => void zeilen.push(a.map(String).join(' '))
  try {
    return { ergebnis: await fn(), ausgabe: zeilen.join('\n') }
  } finally {
    Object.assign(console, orig)
  }
}

test('Nicht-Geschaeftsfuehrer: 403, nichts wird geaendert (auch bei sonst gueltiger Anfrage)', async () => {
  const { deps, state } = aufbau()
  const r = await behandlePasswortSetzen(MA, { user_id: GF, passwort: PW }, deps)
  assert.equal(r.status, 403)
  assert.equal(state.updates.length, 0)
  assert.equal(state.logs.length, 0)
})

test('Aufrufer ohne Profil: 403', async () => {
  const { deps } = aufbau({ rollen: {} })
  assert.equal((await behandlePasswortSetzen(GF, { user_id: MA, passwort: PW }, deps)).status, 403)
})

test('Eigene user_id: 400 mit Hinweis auf Mein Profil', async () => {
  const { deps, state } = aufbau()
  const r = await behandlePasswortSetzen(GF, { user_id: GF, passwort: PW }, deps)
  assert.equal(r.status, 400)
  assert.match(String(r.body.fehler), /Mein Profil/)
  assert.equal(state.updates.length, 0)
})

test('Passwort zu kurz oder zu lang: 400', async () => {
  const { deps, state } = aufbau()
  assert.equal((await behandlePasswortSetzen(GF, { user_id: MA, passwort: 'kurz1234567' }, deps)).status, 400) // 11 Zeichen
  assert.equal((await behandlePasswortSetzen(GF, { user_id: MA, passwort: 'x'.repeat(73) }, deps)).status, 400)
  // 40 Zeichen, aber 80 Byte (Umlaute zaehlen in bcrypt als Byte)
  assert.equal((await behandlePasswortSetzen(GF, { user_id: MA, passwort: 'ä'.repeat(37) }, deps)).status, 400)
  assert.equal((await behandlePasswortSetzen(GF, { user_id: MA, passwort: 12345678901234 }, deps)).status, 400)
  assert.equal((await behandlePasswortSetzen(GF, { user_id: MA }, deps)).status, 400)
  assert.equal(state.updates.length, 0)
})

test('Grenzen 12 und 72 Zeichen sind erlaubt', async () => {
  const { deps } = aufbau()
  assert.equal((await behandlePasswortSetzen(GF, { user_id: MA, passwort: 'a'.repeat(12) }, deps)).status, 200)
  assert.equal((await behandlePasswortSetzen(GF, { user_id: MA, passwort: 'a'.repeat(72) }, deps)).status, 200)
})

test('Ungueltiger Body oder user_id: 400', async () => {
  const { deps } = aufbau()
  assert.equal((await behandlePasswortSetzen(GF, undefined, deps)).status, 400)
  assert.equal((await behandlePasswortSetzen(GF, 'text', deps)).status, 400)
  assert.equal((await behandlePasswortSetzen(GF, { user_id: 'keine-uuid', passwort: PW }, deps)).status, 400)
})

test('Unbekannter Nutzer: 404', async () => {
  const { deps, state } = aufbau()
  const r = await behandlePasswortSetzen(GF, { user_id: UNBEKANNT, passwort: PW }, deps)
  assert.equal(r.status, 404)
  assert.equal(state.updates.length, 0)
})

test('Erfolg: updateUserById-Parameter wie vereinbart, Antwort nur { ok: true }, Protokoll ohne Passwort', async () => {
  const { deps, state } = aufbau()
  const r = await behandlePasswortSetzen(GF, { user_id: MA, passwort: PW }, deps)
  assert.deepEqual(r, { status: 200, body: { ok: true } })
  assert.deepEqual(state.updates, [
    { id: MA, attribute: { password: PW, email_confirm: true, user_metadata: { passwort_wechseln: true } } },
  ])
  assert.deepEqual(state.logs, [{ gesetzt_von: GF, fuer_nutzer: MA }])
  assert.ok(!JSON.stringify(state.logs).includes(PW))
})

test('Rate-Limit: zweiter Aufruf innerhalb von 3 s wird abgelehnt, danach wieder erlaubt', async () => {
  const { deps, state } = aufbau({ festeZeit: true })
  assert.equal((await behandlePasswortSetzen(GF, { user_id: MA, passwort: PW }, deps)).status, 200)
  state.zeit += 1000
  assert.equal((await behandlePasswortSetzen(GF, { user_id: MA, passwort: PW }, deps)).status, 429)
  assert.equal(state.updates.length, 1)
  state.zeit += MIN_ABSTAND_MS
  assert.equal((await behandlePasswortSetzen(GF, { user_id: MA, passwort: PW }, deps)).status, 200)
})

test('Fehler beim Setzen: 500 mit festem Text, Passwort nirgends in der Antwort oder im Log', async () => {
  const { deps } = aufbau({ updateFehler: true })
  const { ergebnis, ausgabe } = await mitKonsole(() => behandlePasswortSetzen(GF, { user_id: MA, passwort: PW }, deps))
  assert.equal(ergebnis.status, 500)
  assert.ok(!JSON.stringify(ergebnis).includes(PW))
  assert.ok(!ausgabe.includes(PW))
})

test('Fehler beim Protokollieren verhindert den Erfolg nicht', async () => {
  const { deps } = aufbau({ logFehler: true })
  assert.equal((await behandlePasswortSetzen(GF, { user_id: MA, passwort: PW }, deps)).status, 200)
})

test('Passwort taucht in keiner Antwort und keiner Konsolenausgabe auf (alle Pfade)', async () => {
  const faelle: [string, unknown][] = [
    [MA, { user_id: GF, passwort: PW }],
    [GF, { user_id: GF, passwort: PW }],
    [GF, { user_id: UNBEKANNT, passwort: PW }],
    [GF, { user_id: MA, passwort: PW }],
    [GF, { user_id: 'x', passwort: PW }],
  ]
  for (const [aufrufer, body] of faelle) {
    const { deps, state } = aufbau()
    const { ergebnis, ausgabe } = await mitKonsole(() => behandlePasswortSetzen(aufrufer, body, deps))
    assert.ok(!JSON.stringify(ergebnis).includes(PW))
    assert.ok(!ausgabe.includes(PW))
    assert.ok(!JSON.stringify(state.logs).includes(PW))
  }
})
