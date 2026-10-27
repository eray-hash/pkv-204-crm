// Ablauftests der Funktionen mit In-Memory-Datenbank und gefaktem sipgate (kein Netzwerk, kein echtes Token).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { behandleAnrufen, behandleVerbinden, type AnrufenDeps, type VerbindenDeps, type ZugangRow } from './telefonie_handler.ts'
import { parseSchluessel, type FetchLike } from './telefonie.ts'

const USER = '11111111-1111-4111-8111-111111111111'
const LEAD_ID = '22222222-2222-4222-8222-222222222222'
const TOKEN = 'sehr-geheimes-token-0987654321'
const TOKEN_ID = 'token-XYZ789'
const BASIC = `Basic ${Buffer.from(`${TOKEN_ID}:${TOKEN}`).toString('base64')}`
const KEY = parseSchluessel(Buffer.alloc(32, 5).toString('hex'))

interface Sipgate {
  fetch: FetchLike
  aufrufe: { url: string; method: string; auth: string; body: unknown }[]
  verhalten: { userinfo?: number; devices?: number; call?: number; domain?: string; netz?: boolean; geraete?: unknown[] }
}

function fakeSipgate(): Sipgate {
  const s: Sipgate = {
    aufrufe: [],
    verhalten: {},
    fetch: async (url, init) => {
      const h = init.headers as Record<string, string>
      s.aufrufe.push({ url, method: String(init.method), auth: h.Authorization, body: init.body ? JSON.parse(init.body as string) : undefined })
      const v = s.verhalten
      if (v.netz) throw new Error(`socket hang up ${h.Authorization}`)
      const antwort = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })
      if (url.endsWith('/authorization/userinfo')) {
        return v.userinfo && v.userinfo !== 200 ? antwort(v.userinfo, { detail: TOKEN }) : antwort(200, { sub: 'w0', domain: v.domain ?? 'sipgate.de' })
      }
      if (url.endsWith('/w0/devices')) {
        return v.devices && v.devices !== 200
          ? antwort(v.devices, {})
          : antwort(200, { items: v.geraete ?? [{ id: 'm0', alias: 'Satellite', type: 'MOBILE', online: true }, { id: 'e1', alias: 'Büro', type: 'EXTERNAL', online: false }] })
      }
      if (url.endsWith('/sessions/calls')) return v.call && v.call !== 200 ? antwort(v.call, { detail: TOKEN }) : antwort(200, { sessionId: 'sess-1' })
      return antwort(404, {})
    },
  }
  return s
}

function verbindenDeps(sip: Sipgate) {
  const store = new Map<string, ZugangRow>()
  const deps: VerbindenDeps = {
    schluessel: () => KEY,
    fetch: sip.fetch,
    ladeZugang: async (id) => store.get(id) ?? null,
    speichereZugang: async (row) => void store.set(row.user_id, row),
    aktualisiereGeraet: async (id, felder) => {
      const r = store.get(id)
      if (r) store.set(id, { ...r, ...felder })
    },
    loescheZugang: async (id) => void store.delete(id),
  }
  return { deps, store }
}

const alsText = (x: unknown) => JSON.stringify(x)

// ---------- telefonie-verbinden ----------

test('verbinden: Token wird geprueft, verschluesselt gespeichert und nie zurueckgegeben', async () => {
  const sip = fakeSipgate()
  const { deps, store } = verbindenDeps(sip)
  const res = await behandleVerbinden(USER, { aktion: 'verbinden', tokenId: TOKEN_ID, token: TOKEN }, deps)
  assert.equal(res.status, 200)
  assert.deepEqual(res.body.geraete, [
    { id: 'm0', name: 'Satellite', typ: 'mobile', online: true },
    { id: 'e1', name: 'Büro', typ: 'external', online: false },
  ])
  assert.ok(!alsText(res.body).includes(TOKEN))
  const row = store.get(USER)!
  assert.equal(row.anbieter, 'sipgate_classic')
  assert.equal(row.token_id, TOKEN_ID)
  assert.match(row.token_verschluesselt, /^v1\./)
  assert.ok(!alsText(row).includes(TOKEN), 'Token darf nicht im Klartext gespeichert werden')
  assert.equal(row.geraet_id, null)
  // sipgate wurde mit Basic Auth (tokenId:token) angesprochen
  assert.ok(sip.aufrufe.length >= 2 && sip.aufrufe.every((a) => a.auth === BASIC))
})

test('verbinden: ungueltiges Token (401) speichert nichts und gibt eine deutsche Meldung ohne Details', async () => {
  const sip = fakeSipgate()
  sip.verhalten.userinfo = 401
  const { deps, store } = verbindenDeps(sip)
  const res = await behandleVerbinden(USER, { aktion: 'verbinden', tokenId: TOKEN_ID, token: TOKEN }, deps)
  assert.equal(res.status, 422)
  assert.equal(res.body.code, 'token_ungueltig')
  assert.match(String(res.body.fehler), /Token/)
  assert.ok(!alsText(res.body).includes(TOKEN))
  assert.equal(store.size, 0)
})

test('verbinden: fehlende Rechte (403 bei devices) und keine Geraete werden sauber gemeldet', async () => {
  const sip = fakeSipgate()
  sip.verhalten.devices = 403
  const a = await behandleVerbinden(USER, { aktion: 'verbinden', tokenId: TOKEN_ID, token: TOKEN }, verbindenDeps(sip).deps)
  assert.equal(a.body.code, 'rechte_fehlen')
  assert.match(String(a.body.fehler), /devices:read/)

  const sip2 = fakeSipgate()
  sip2.verhalten.geraete = []
  const { deps, store } = verbindenDeps(sip2)
  const b = await behandleVerbinden(USER, { aktion: 'verbinden', tokenId: TOKEN_ID, token: TOKEN }, deps)
  assert.equal(b.body.code, 'keine_geraete')
  assert.equal(store.size, 0)
})

test('verbinden: Neo-Konto und Netzwerkausfall', async () => {
  const neo = fakeSipgate()
  neo.verhalten.domain = 'neo.sipgate.de'
  const a = await behandleVerbinden(USER, { aktion: 'verbinden', tokenId: TOKEN_ID, token: TOKEN }, verbindenDeps(neo).deps)
  assert.equal(a.body.code, 'nicht_unterstuetzt')

  const aus = fakeSipgate()
  aus.verhalten.netz = true
  const b = await behandleVerbinden(USER, { aktion: 'verbinden', tokenId: TOKEN_ID, token: TOKEN }, verbindenDeps(aus).deps)
  assert.equal(b.status, 502)
  assert.ok(!alsText(b.body).includes(TOKEN))
  assert.ok(!alsText(b.body).includes('socket'))
})

test('verbinden: ungueltige Eingabe ergibt 400', async () => {
  const { deps } = verbindenDeps(fakeSipgate())
  const res = await behandleVerbinden(USER, { aktion: 'verbinden', tokenId: '', token: '' }, deps)
  assert.equal(res.status, 400)
  assert.equal(res.body.code, 'ungueltige_eingabe')
})

test('geraet_waehlen: nur Geraete des eigenen Kontos, Rufnummern werden normalisiert', async () => {
  const sip = fakeSipgate()
  const { deps, store } = verbindenDeps(sip)
  await behandleVerbinden(USER, { aktion: 'verbinden', tokenId: TOKEN_ID, token: TOKEN }, deps)

  const fremd = await behandleVerbinden(USER, { aktion: 'geraet_waehlen', geraetId: 'x99' }, deps)
  assert.equal(fremd.body.code, 'geraet_unbekannt')
  assert.equal(store.get(USER)!.geraet_id, null)

  const ok = await behandleVerbinden(USER, { aktion: 'geraet_waehlen', geraetId: 'm0', rufnummerAnzeige: '030 1234567' }, deps)
  assert.equal(ok.status, 200)
  assert.deepEqual(ok.body, { ok: true, verbunden: true, geraetId: 'm0', geraetName: 'Satellite' })
  const row = store.get(USER)!
  assert.equal(row.geraet_id, 'm0')
  assert.equal(row.rufnummer_anzeige, '+49301234567')
  assert.equal(row.rufnummer_caller, null)
})

test('geraet_waehlen / geraete ohne gespeichertes Token: 409', async () => {
  const { deps } = verbindenDeps(fakeSipgate())
  assert.equal((await behandleVerbinden(USER, { aktion: 'geraete' }, deps)).body.code, 'nicht_verbunden')
  assert.equal((await behandleVerbinden(USER, { aktion: 'geraet_waehlen', geraetId: 'm0' }, deps)).status, 409)
})

test('status: nicht verbunden, Token ohne Geraet, voll verbunden - ohne Token in der Antwort', async () => {
  const sip = fakeSipgate()
  const { deps } = verbindenDeps(sip)
  assert.deepEqual((await behandleVerbinden(USER, { aktion: 'status' }, deps)).body, { ok: true, verbunden: false, tokenGespeichert: false })

  await behandleVerbinden(USER, { aktion: 'verbinden', tokenId: TOKEN_ID, token: TOKEN }, deps)
  const halb = await behandleVerbinden(USER, { aktion: 'status' }, deps)
  assert.equal(halb.body.verbunden, false)
  assert.equal(halb.body.tokenGespeichert, true)
  assert.equal(halb.body.tokenGueltig, true)

  await behandleVerbinden(USER, { aktion: 'geraet_waehlen', geraetId: 'e1', rufnummerCaller: '0151 1112222' }, deps)
  const voll = await behandleVerbinden(USER, { aktion: 'status' }, deps)
  assert.equal(voll.body.verbunden, true)
  assert.equal(voll.body.geraetId, 'e1')
  assert.equal(voll.body.geraetName, 'Büro')
  assert.equal(voll.body.rufnummerCaller, '+491511112222')
  const text = alsText(voll.body)
  assert.ok(!text.includes(TOKEN) && !text.includes('v1.') && !text.includes('verschluesselt'))
})

test('status ohne Live-Pruefung fragt sipgate nicht ab', async () => {
  const sip = fakeSipgate()
  const { deps } = verbindenDeps(sip)
  await behandleVerbinden(USER, { aktion: 'verbinden', tokenId: TOKEN_ID, token: TOKEN }, deps)
  await behandleVerbinden(USER, { aktion: 'geraet_waehlen', geraetId: 'm0' }, deps)
  sip.aufrufe.length = 0
  const res = await behandleVerbinden(USER, { aktion: 'status', live: false }, deps)
  assert.equal(res.body.verbunden, true)
  assert.equal(res.body.geraetId, 'm0')
  assert.equal('tokenGueltig' in res.body, false)
  assert.equal(sip.aufrufe.length, 0)
})

test('status: abgelaufenes Token wird gemeldet, ohne dass die Abfrage scheitert', async () => {
  const sip = fakeSipgate()
  const { deps } = verbindenDeps(sip)
  await behandleVerbinden(USER, { aktion: 'verbinden', tokenId: TOKEN_ID, token: TOKEN }, deps)
  await behandleVerbinden(USER, { aktion: 'geraet_waehlen', geraetId: 'm0' }, deps)
  sip.verhalten.userinfo = 401
  const res = await behandleVerbinden(USER, { aktion: 'status' }, deps)
  assert.equal(res.status, 200)
  assert.equal(res.body.verbunden, true)
  assert.equal(res.body.tokenGueltig, false)
  assert.ok(!alsText(res.body).includes(TOKEN))

  sip.verhalten.userinfo = undefined
  sip.verhalten.netz = true
  assert.equal((await behandleVerbinden(USER, { aktion: 'status' }, deps)).body.tokenGueltig, null)
})

test('trennen: loescht den Zugang', async () => {
  const { deps, store } = verbindenDeps(fakeSipgate())
  await behandleVerbinden(USER, { aktion: 'verbinden', tokenId: TOKEN_ID, token: TOKEN }, deps)
  assert.equal(store.size, 1)
  assert.deepEqual((await behandleVerbinden(USER, { aktion: 'trennen' }, deps)).body, { ok: true, verbunden: false })
  assert.equal(store.size, 0)
})

test('ein Datensatz eines anderen Nutzers laesst sich nicht entschluesseln (AAD)', async () => {
  const sip = fakeSipgate()
  const { deps, store } = verbindenDeps(sip)
  await behandleVerbinden(USER, { aktion: 'verbinden', tokenId: TOKEN_ID, token: TOKEN }, deps)
  const andere = '99999999-9999-4999-8999-999999999999'
  store.set(andere, { ...store.get(USER)!, user_id: andere })
  const res = await behandleVerbinden(andere, { aktion: 'geraete' }, deps)
  assert.equal(res.body.code, 'token_unlesbar')
})

test('unerwartete Fehler (z. B. Datenbank) liefern nur einen festen Text', async () => {
  const { deps } = verbindenDeps(fakeSipgate())
  deps.ladeZugang = async () => {
    throw new Error(`password=${TOKEN} relation does not exist`)
  }
  const res = await behandleVerbinden(USER, { aktion: 'status' }, deps)
  assert.equal(res.status, 500)
  assert.equal(res.body.code, 'intern')
  assert.ok(!alsText(res.body).includes(TOKEN))
  assert.ok(!alsText(res.body).includes('relation'))
})

// ---------- anrufen ----------

interface Welt {
  sip: Sipgate
  deps: AnrufenDeps
  anrufe: { lead_id: string; user_id: string; kanal: 'mobil'; anbieter: string; provider_call_id: string | null }[]
  lead: { id: string; telefon: string; status: string; ist_test: boolean } | null
  welt: { einwilligung: boolean; letzterAnruf: string | null; verbunden: boolean }
}

async function weltMitZugang(): Promise<Welt> {
  const sip = fakeSipgate()
  const { deps: vdeps, store } = verbindenDeps(sip)
  await behandleVerbinden(USER, { aktion: 'verbinden', tokenId: TOKEN_ID, token: TOKEN }, vdeps)
  await behandleVerbinden(USER, { aktion: 'geraet_waehlen', geraetId: 'm0' }, vdeps)
  sip.aufrufe.length = 0
  const w: Welt = {
    sip,
    anrufe: [],
    lead: { id: LEAD_ID, telefon: '+4915112345678', status: 'neu', ist_test: false },
    welt: { einwilligung: true, letzterAnruf: null, verbunden: true },
    deps: undefined as unknown as AnrufenDeps,
  }
  w.deps = {
    schluessel: () => KEY,
    fetch: sip.fetch,
    jetzt: () => new Date('2026-10-28T10:00:10.000Z'),
    ladeLead: async () => w.lead,
    hatEinwilligung: async () => w.welt.einwilligung,
    ladeZugang: async (id) => (w.welt.verbunden ? (store.get(id) ?? null) : null),
    letzterAnruf: async () => w.welt.letzterAnruf,
    speichereAnruf: async (row) => void w.anrufe.push(row),
  }
  return w
}

const anrufAufrufe = (w: Welt) => w.sip.aufrufe.filter((a) => a.url.endsWith('/sessions/calls'))

test('anrufen: Rufnummer kommt aus der Datenbank (nicht vom Client), Anruf wird protokolliert', async () => {
  const w = await weltMitZugang()
  const res = await behandleAnrufen(USER, { lead_id: LEAD_ID, telefon: '+491111111111', callee: '+492222222222' }, w.deps)
  assert.equal(res.status, 200)
  assert.deepEqual(res.body, { ok: true, protokolliert: true })
  const calls = anrufAufrufe(w)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].method, 'POST')
  assert.equal(calls[0].auth, BASIC)
  assert.deepEqual(calls[0].body, { caller: 'm0', callee: '+4915112345678' })
  assert.deepEqual(w.anrufe, [{ lead_id: LEAD_ID, user_id: USER, kanal: 'mobil', anbieter: 'sipgate_classic', provider_call_id: 'sess-1' }])
  assert.ok(!alsText(res.body).includes(TOKEN))
})

test('anrufen: Testlead und geschlossene Leads werden verweigert, ohne sipgate anzurufen', async () => {
  const w = await weltMitZugang()
  w.lead = { id: LEAD_ID, telefon: '+4915112345678', status: 'neu', ist_test: true }
  assert.equal((await behandleAnrufen(USER, { lead_id: LEAD_ID }, w.deps)).body.code, 'lead_gesperrt')
  for (const status of ['verstorben', 'nicht_mehr_pkv', 'kein_interesse', 'schon_umgestellt', 'verloren', 'gewonnen']) {
    w.lead = { id: LEAD_ID, telefon: '+4915112345678', status, ist_test: false }
    const res = await behandleAnrufen(USER, { lead_id: LEAD_ID }, w.deps)
    assert.equal(res.status, 403, status)
    assert.equal(res.body.code, 'lead_gesperrt', status)
  }
  assert.equal(w.sip.aufrufe.length, 0)
  assert.equal(w.anrufe.length, 0)
})

test('anrufen: ohne Einwilligungsnachweis oder unbekannter Lead wird verweigert', async () => {
  const w = await weltMitZugang()
  w.welt.einwilligung = false
  assert.equal((await behandleAnrufen(USER, { lead_id: LEAD_ID }, w.deps)).body.code, 'keine_einwilligung')
  w.lead = null
  assert.equal((await behandleAnrufen(USER, { lead_id: LEAD_ID }, w.deps)).status, 404)
  assert.equal(w.sip.aufrufe.length, 0)
})

test('anrufen: ungueltige Lead-ID ergibt 400', async () => {
  const w = await weltMitZugang()
  const res = await behandleAnrufen(USER, { telefon: '+491700000000' }, w.deps)
  assert.equal(res.status, 400)
  assert.equal(w.sip.aufrufe.length, 0)
})

test('anrufen: ohne verbundene Telefonie kommt "nicht verbunden"', async () => {
  const w = await weltMitZugang()
  w.welt.verbunden = false
  const res = await behandleAnrufen(USER, { lead_id: LEAD_ID }, w.deps)
  assert.equal(res.status, 409)
  assert.equal(res.body.code, 'nicht_verbunden')
  assert.match(String(res.body.fehler), /Mein Profil/)
  assert.equal(w.sip.aufrufe.length, 0)
})

test('anrufen: Rate-Limit pro Nutzer (3 Sekunden)', async () => {
  const w = await weltMitZugang()
  w.welt.letzterAnruf = '2026-10-28T10:00:08.500Z'
  const res = await behandleAnrufen(USER, { lead_id: LEAD_ID }, w.deps)
  assert.equal(res.status, 429)
  assert.equal(res.body.code, 'zu_viele_anfragen')
  assert.equal(w.sip.aufrufe.length, 0)
  w.welt.letzterAnruf = '2026-10-28T10:00:06.000Z'
  assert.equal((await behandleAnrufen(USER, { lead_id: LEAD_ID }, w.deps)).status, 200)
})

test('anrufen: paralleler zweiter Anruf desselben Nutzers wird abgewiesen', async () => {
  const w = await weltMitZugang()
  const [a, b] = await Promise.all([behandleAnrufen(USER, { lead_id: LEAD_ID }, w.deps), behandleAnrufen(USER, { lead_id: LEAD_ID }, w.deps)])
  assert.deepEqual([a.status, b.status].sort(), [200, 429])
  assert.equal(anrufAufrufe(w).length, 1)
  // danach ist die Sperre wieder frei
  assert.equal((await behandleAnrufen(USER, { lead_id: LEAD_ID }, w.deps)).status, 200)
})

test('anrufen: sipgate-Fehler werden auf deutsche Meldungen ohne Details abgebildet und nicht protokolliert', async () => {
  const faelle: [number, string][] = [
    [401, 'token_ungueltig'],
    [403, 'rechte_fehlen'],
    [402, 'guthaben'],
    [400, 'nummer_ungueltig'],
    [500, 'anbieter_nicht_erreichbar'],
  ]
  for (const [status, code] of faelle) {
    const w = await weltMitZugang()
    w.sip.verhalten.call = status
    const res = await behandleAnrufen(USER, { lead_id: LEAD_ID }, w.deps)
    assert.equal(res.body.code, code, String(status))
    assert.ok(res.status >= 400)
    assert.ok(!alsText(res.body).includes(TOKEN))
    assert.equal(w.anrufe.length, 0, 'fehlgeschlagene Anrufe werden nicht protokolliert')
  }
})

test('anrufen: Fehler beim Protokollieren kippt den ausgeloesten Anruf nicht', async () => {
  const w = await weltMitZugang()
  w.deps.speichereAnruf = async () => {
    throw new Error('db down')
  }
  const res = await behandleAnrufen(USER, { lead_id: LEAD_ID }, w.deps)
  assert.equal(res.status, 200)
  assert.deepEqual(res.body, { ok: true, protokolliert: false })
})

test('anrufen: mit eigener Rufnummer und angezeigter Rufnummer wird der passende Body gesendet', async () => {
  const w = await weltMitZugang()
  const { deps: vdeps, store } = verbindenDeps(w.sip)
  await behandleVerbinden(USER, { aktion: 'verbinden', tokenId: TOKEN_ID, token: TOKEN }, vdeps)
  await behandleVerbinden(USER, { aktion: 'geraet_waehlen', geraetId: 'e1', rufnummerCaller: '0151 1112222', rufnummerAnzeige: '030 1234567' }, vdeps)
  w.deps.ladeZugang = async (id) => store.get(id) ?? null
  w.sip.aufrufe.length = 0
  const res = await behandleAnrufen(USER, { lead_id: LEAD_ID }, w.deps)
  assert.equal(res.status, 200)
  assert.deepEqual(anrufAufrufe(w)[0].body, { deviceId: 'e1', caller: '+491511112222', callee: '+4915112345678', callerId: '+49301234567' })
})
