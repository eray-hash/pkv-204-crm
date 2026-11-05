// Tests ohne Netzwerk: gefakte Auth-/Datenbank-Zugriffe.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { behandlePasswortSetzen, MIN_ABSTAND_MS, type AuthAktualisierung, type PasswortDeps, type ProtokollEintrag } from './passwort_handler.ts'

const GF = '11111111-1111-4111-8111-111111111111'
const MA = '22222222-2222-4222-8222-222222222222'
const UNBEKANNT = '33333333-3333-4333-8333-333333333333'
const PW = 'Sehr-Geheim-Passwort-42'

function aufbau(opts: { rollen?: Record<string, string>; vorhanden?: string[]; updateFehler?: boolean; logFehler?: boolean; start?: number; festeZeit?: boolean; sitzungenFehler?: boolean } = {}) {
  const rollen = opts.rollen ?? { [GF]: 'geschaeftsfuehrer', [MA]: 'mitarbeiter' }
  const vorhanden = new Set(opts.vorhanden ?? [GF, MA])
  const state = {
    zeit: opts.start ?? Date.parse('2026-11-02T10:00:00Z'),
    updates: [] as { id: string; attribute: AuthAktualisierung }[],
    logs: [] as ProtokollEintrag[],
    sitzungen: [] as string[],
    ereignisse: [] as string[],
    letzte: new Map<string, number>(),
  }
  const deps: PasswortDeps = {
    // Standard: jeder Aufruf geschieht 10 s nach dem vorigen (Rate-Limit stoert nicht); festeZeit steuert die Zeit selbst
    jetzt: () => new Date(opts.festeZeit ? state.zeit : (state.zeit += 10_000)),
    ladeRolle: async (id) => rollen[id] ?? null,
    ladeNutzerInfo: async (id) => (vorhanden.has(id) ? { name: `Name ${id.slice(0, 2)}`, email: `${id.slice(0, 2)}@x.test` } : null),
    aktualisiereNutzer: async (id, attribute) => {
      state.ereignisse.push('setzen')
      if (opts.updateFehler) throw new Error(`GoTrue sagt: Passwort ${attribute.password} abgelehnt`)
      state.updates.push({ id, attribute })
    },
    protokolliere: async (e) => {
      state.ereignisse.push('protokoll')
      if (opts.logFehler) throw new Error('tabelle fehlt')
      state.logs.push(e)
    },
    beendeSitzungen: async (id) => {
      state.ereignisse.push('sitzungen')
      if (opts.sitzungenFehler) throw new Error('rpc fehlt')
      state.sitzungen.push(id)
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
  assert.deepEqual(r, { status: 200, body: { ok: true, sitzungenBeendet: true } })
  assert.deepEqual(state.updates, [
    { id: MA, attribute: { password: PW, email_confirm: true, user_metadata: { passwort_wechseln: true } } },
  ])
  assert.equal(state.logs.length, 1)
  assert.deepEqual(
    { von: state.logs[0].gesetzt_von, fuer: state.logs[0].fuer_nutzer, vn: state.logs[0].gesetzt_von_name, fe: state.logs[0].fuer_nutzer_email },
    { von: GF, fuer: MA, vn: 'Name 11', fe: '22@x.test' },
  )
  assert.deepEqual(state.sitzungen, [MA])
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

test('Reihenfolge: erst Protokoll, dann Passwort setzen, dann Sitzungen beenden', async () => {
  const { deps, state } = aufbau()
  await behandlePasswortSetzen(GF, { user_id: MA, passwort: PW }, deps)
  assert.deepEqual(state.ereignisse, ['protokoll', 'setzen', 'sitzungen'])
})

test('Protokoll schlaegt fehl: 500 und das Passwort wird NICHT geaendert', async () => {
  const { deps, state } = aufbau({ logFehler: true })
  const r = await behandlePasswortSetzen(GF, { user_id: MA, passwort: PW }, deps)
  assert.equal(r.status, 500)
  assert.equal(state.updates.length, 0)
  assert.deepEqual(state.ereignisse, ['protokoll'])
  assert.ok(!JSON.stringify(r).includes(PW))
})

test('Sitzungen beenden schlaegt fehl: Passwort ist gesetzt, Antwort meldet es', async () => {
  const { deps, state } = aufbau({ sitzungenFehler: true })
  const r = await behandlePasswortSetzen(GF, { user_id: MA, passwort: PW }, deps)
  assert.deepEqual(r, { status: 200, body: { ok: true, sitzungenBeendet: false } })
  assert.equal(state.updates.length, 1)
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
