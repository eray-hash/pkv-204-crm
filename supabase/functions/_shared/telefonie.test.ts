// Ausfuehren mit: node --test supabase/functions/_shared/*.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  EINWILLIGUNG_MAX_ALTER_TAGE,
  GESCHLOSSENE_STATUS,
  OFFENE_STATUS,
  UEBERNEHMBARE_STATUS,
  pruefeUebernehmbar,
  TelefonieFehler,
  adapterFuer,
  baueAnrufBody,
  entschluessele,
  fehlerAusSipgateStatus,
  baueNeoAnrufBody,
  normalisiereRufnummer,
  ohnePlus,
  pruefeZuweisung,
  sipgateNeo,
  parseAnrufenBody,
  parseSchluessel,
  parseVerbindenBody,
  pruefeLeadAnrufbar,
  pruefeRateLimit,
  sipgateClassic,
  verschluessele,
  type FetchLike,
} from './telefonie.ts'

const HEX_KEY = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff'
const B64_KEY = Buffer.alloc(32, 7).toString('base64')
const GEHEIMES_TOKEN = 'geheimes-token-1234567890'
const Z = { tokenId: 'token-ABC123', token: GEHEIMES_TOKEN }

async function wirft(fn: () => Promise<unknown> | unknown): Promise<TelefonieFehler> {
  try {
    await fn()
  } catch (e) {
    assert.ok(e instanceof TelefonieFehler, `TelefonieFehler erwartet, bekommen: ${String(e)}`)
    return e
  }
  assert.fail('Es wurde kein Fehler geworfen')
}

function jsonAntwort(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

// ---------- Verschluesselung ----------

test('Verschluesselung: hin und zurueck (Hex- und Base64-Schluessel)', async () => {
  for (const secret of [HEX_KEY, B64_KEY, B64_KEY.replace(/\+/g, '-').replace(/\//g, '_')]) {
    const key = await parseSchluessel(secret)
    const blob = await verschluessele(GEHEIMES_TOKEN, key, 'telefonie:user-1')
    assert.match(blob, /^v1\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+$/)
    assert.ok(!blob.includes(GEHEIMES_TOKEN))
    assert.equal(await entschluessele(blob, key, 'telefonie:user-1'), GEHEIMES_TOKEN)
  }
})

test('Verschluesselung: jede Verschluesselung nutzt einen neuen IV', async () => {
  const key = await parseSchluessel(HEX_KEY)
  const a = await verschluessele('abc', key, 'x')
  const b = await verschluessele('abc', key, 'x')
  assert.notEqual(a, b)
})

test('Verschluesselung: falscher Schluessel schlaegt fehl', async () => {
  const key = await parseSchluessel(HEX_KEY)
  const anderer = await parseSchluessel(Buffer.alloc(32, 9).toString('hex'))
  const blob = await verschluessele(GEHEIMES_TOKEN, key, 'telefonie:user-1')
  const fehler = await wirft(() => entschluessele(blob, anderer, 'telefonie:user-1'))
  assert.equal(fehler.code, 'token_unlesbar')
  assert.ok(!fehler.message.includes(GEHEIMES_TOKEN))
})

test('Verschluesselung: Datensatz eines anderen Nutzers (falsche AAD) wird nicht entschluesselt', async () => {
  const key = await parseSchluessel(HEX_KEY)
  const blob = await verschluessele(GEHEIMES_TOKEN, key, 'telefonie:user-1')
  assert.equal((await wirft(() => entschluessele(blob, key, 'telefonie:user-2'))).code, 'token_unlesbar')
})

test('Verschluesselung: manipulierte oder kaputte Daten schlagen fehl', async () => {
  const key = await parseSchluessel(HEX_KEY)
  const blob = await verschluessele(GEHEIMES_TOKEN, key, 'a')
  const teile = blob.split('.')
  const kaputt = `${teile[0]}.${teile[1]}.${teile[2].slice(0, -4)}AAAA`
  assert.equal((await wirft(() => entschluessele(kaputt, key, 'a'))).code, 'token_unlesbar')
  for (const muell of ['', 'abc', 'v2.a.b', 'v1.a']) {
    assert.equal((await wirft(() => entschluessele(muell, key, 'a'))).code, 'token_unlesbar')
  }
})

test('Schluessel: ungueltige Werte werden mit fester Meldung abgelehnt (ohne das Secret zu nennen)', async () => {
  const kurz = Buffer.alloc(16, 1).toString('hex')
  for (const secret of [undefined, null, '', '   ', kurz, 'kein base64 !!!', Buffer.alloc(31, 1).toString('base64')]) {
    const fehler = await wirft(() => parseSchluessel(secret as string | undefined))
    assert.equal(fehler.code, 'konfiguration')
    assert.equal(fehler.status, 500)
    if (typeof secret === 'string' && secret.trim()) assert.ok(!fehler.message.includes(secret))
  }
})

// ---------- Rufnummern und Eingaben ----------

test('Rufnummern werden zu E.164 (+49...) vereinheitlicht', () => {
  assert.equal(normalisiereRufnummer('0151 1234 5678'), '+4915112345678')
  assert.equal(normalisiereRufnummer('0049 151 12345678'), '+4915112345678')
  assert.equal(normalisiereRufnummer('+49 (0) 151 / 12345678'), '+4915112345678')
  assert.equal(normalisiereRufnummer('4915112345678'), null)
  assert.equal(normalisiereRufnummer('abc'), null)
})

test('parseVerbindenBody: Aktionen und Pflichtfelder', () => {
  assert.deepEqual(parseVerbindenBody({ aktion: 'status' }), { ok: true, value: { aktion: 'status', live: true } })
  assert.deepEqual(parseVerbindenBody({ aktion: 'status', live: false }), { ok: true, value: { aktion: 'status', live: false } })
  assert.deepEqual(parseVerbindenBody({ aktion: 'trennen' }), { ok: true, value: { aktion: 'trennen' } })
  assert.deepEqual(parseVerbindenBody({ aktion: 'verbinden', tokenId: ' token-AB ', token: 'abc' }), {
    ok: true,
    value: { aktion: 'verbinden', anbieter: 'sipgate_classic', tokenId: 'token-AB', token: 'abc' },
  })
  assert.deepEqual(parseVerbindenBody({ aktion: 'verbinden', anbieter: 'sipgate_neo', tokenId: 'token-AB', token: 'abc' }), {
    ok: true,
    value: { aktion: 'verbinden', anbieter: 'sipgate_neo', tokenId: 'token-AB', token: 'abc' },
  })
  assert.equal(parseVerbindenBody({ aktion: 'verbinden', anbieter: 'telekom', tokenId: 'token-AB', token: 'abc' }).ok, false)
  for (const schlecht of [
    { aktion: 'verbinden' },
    { aktion: 'verbinden', tokenId: 'token-AB' },
    { aktion: 'verbinden', tokenId: 'mit leerzeichen', token: 'abc' },
    { aktion: 'verbinden', tokenId: 'a:b', token: 'abc' },
    { aktion: 'verbinden', tokenId: 'token-AB', token: 'x'.repeat(201) },
    { aktion: 'loeschen' },
    null,
    'text',
  ]) {
    assert.equal(parseVerbindenBody(schlecht).ok, false, JSON.stringify(schlecht))
  }
})

test('parseVerbindenBody: Geraetewahl normalisiert Rufnummern und lehnt Muell ab', () => {
  const r = parseVerbindenBody({ aktion: 'geraet_waehlen', geraetId: 'm0', rufnummerCaller: '0151 111 2222', rufnummerAnzeige: '' })
  assert.deepEqual(r, { ok: true, value: { aktion: 'geraet_waehlen', geraetId: 'm0', rufnummerCaller: '+491511112222', rufnummerAnzeige: null } })
  assert.equal(parseVerbindenBody({ aktion: 'geraet_waehlen' }).ok, false)
  assert.equal(parseVerbindenBody({ aktion: 'geraet_waehlen', geraetId: 'm0; drop' }).ok, false)
  assert.equal(parseVerbindenBody({ aktion: 'geraet_waehlen', geraetId: 'm0', rufnummerCaller: 'abc' }).ok, false)
})

test('parseAnrufenBody: nur eine Lead-ID, Rufnummern vom Client werden ignoriert', () => {
  const id = '0F0F0F0F-0000-4000-8000-000000000001'
  const r = parseAnrufenBody({ lead_id: id, telefon: '+491700000000', callee: '+49111' })
  assert.deepEqual(r, { ok: true, value: { leadId: id.toLowerCase() } })
  assert.equal(parseAnrufenBody({ telefon: '+491700000000' }).ok, false)
  assert.equal(parseAnrufenBody({ lead_id: 'nicht-uuid' }).ok, false)
  assert.equal(parseAnrufenBody(undefined).ok, false)
})

// ---------- Regeln ----------

const lead = (over = {}) => ({ id: 'l1', telefon: '+4915112345678', status: 'neu', ist_test: false, ...over })
const JETZT = new Date('2026-10-28T10:00:00.000Z')
const EINWILLIGUNG = '2026-10-20T08:00:00.000Z'

test('Regeln: normaler Lead mit Einwilligung ist anrufbar', () => {
  assert.equal(pruefeLeadAnrufbar(lead(), EINWILLIGUNG, JETZT), '+4915112345678')
  for (const status of OFFENE_STATUS) {
    assert.equal(pruefeLeadAnrufbar(lead({ status }), EINWILLIGUNG, JETZT), '+4915112345678')
  }
})

test('Regeln: Testlead und gesperrter Lead werden verweigert', async () => {
  const f = await wirft(() => pruefeLeadAnrufbar(lead({ ist_test: true }), EINWILLIGUNG, JETZT))
  assert.equal(f.code, 'lead_gesperrt')
  assert.equal(f.status, 403)
  const g = await wirft(() => pruefeLeadAnrufbar(lead({ gesperrt_am: '2026-10-27T10:00:00Z' }), EINWILLIGUNG, JETZT))
  assert.equal(g.code, 'lead_gesperrt')
  assert.match(g.message, /gesperrt/)
})

test('Regeln: geschlossene Leads werden verweigert', async () => {
  assert.deepEqual([...GESCHLOSSENE_STATUS].sort(), ['gewonnen', 'kein_interesse', 'nicht_mehr_pkv', 'schon_umgestellt', 'verloren', 'verstorben'])
  for (const status of GESCHLOSSENE_STATUS) {
    assert.equal((await wirft(() => pruefeLeadAnrufbar(lead({ status }), EINWILLIGUNG, JETZT))).code, 'lead_gesperrt', status)
  }
})

test('Regeln: ohne Einwilligungsnachweis, zu alte Einwilligung, ohne Lead oder mit unzulaessiger Nummer wird verweigert', async () => {
  assert.equal((await wirft(() => pruefeLeadAnrufbar(lead(), null, JETZT))).code, 'keine_einwilligung')
  assert.equal((await wirft(() => pruefeLeadAnrufbar(lead(), '2025-10-27T09:59:59Z', JETZT))).code, 'keine_einwilligung')
  assert.doesNotThrow(() => pruefeLeadAnrufbar(lead(), '2025-10-28T10:00:00Z', JETZT)) // genau 365 Tage
  assert.equal((await wirft(() => pruefeLeadAnrufbar(lead(), 'kein-datum', JETZT))).code, 'keine_einwilligung')
  assert.equal((await wirft(() => pruefeLeadAnrufbar(null, EINWILLIGUNG, JETZT))).code, 'lead_nicht_gefunden')
  for (const telefon of ['0151 123', '+4990012345678', '+436641234567', '015112345678', '+4932123456789', '+4918051234567']) {
    assert.equal((await wirft(() => pruefeLeadAnrufbar(lead({ telefon }), EINWILLIGUNG, JETZT))).code, 'nummer_ungueltig', telefon)
  }
})

test('Regeln: freie Leads in beratung/termin_vereinbart sind nicht per Mitarbeiter uebernehmbar', async () => {
  assert.deepEqual(UEBERNEHMBARE_STATUS, ['neu', 'kontaktiert', 'nicht_erreicht'])
  for (const status of UEBERNEHMBARE_STATUS) assert.doesNotThrow(() => pruefeUebernehmbar({ status }))
  for (const status of ['termin_vereinbart', 'beratung']) {
    assert.equal((await wirft(() => pruefeUebernehmbar({ status }))).code, 'lead_gesperrt', status)
  }
})

test('Statuslisten und Konstanten stimmen mit der Migration 20261103000000 ueberein', () => {
  const sql = readFileSync(new URL('../../migrations/20261103000000_qa_haertung.sql', import.meta.url), 'utf8')
  const liste = (name: string) => {
    const m = new RegExp(`function public\\.${name}\\(\\) returns text\\[\\][\\s\\S]*?array\\[([^\\]]*)\\]`).exec(sql)
    assert.ok(m, name)
    return m![1].split(',').map((x) => x.trim().replace(/'/g, ''))
  }
  assert.deepEqual(liste('uebernehmbare_status'), UEBERNEHMBARE_STATUS)
  assert.deepEqual(liste('offene_status'), OFFENE_STATUS)
  assert.match(sql, new RegExp(`einwilligung_max_alter\\(\\) returns interval[\\s\\S]*?interval '${EINWILLIGUNG_MAX_ALTER_TAGE} days'`))
})

test('Rate-Limit: hoechstens ein Anruf alle 3 Sekunden', async () => {
  const jetzt = new Date('2026-10-28T10:00:10.000Z')
  assert.doesNotThrow(() => pruefeRateLimit(null, jetzt))
  assert.doesNotThrow(() => pruefeRateLimit(undefined, jetzt))
  assert.doesNotThrow(() => pruefeRateLimit('2026-10-28T10:00:06.999Z', jetzt))
  assert.doesNotThrow(() => pruefeRateLimit('2026-10-28T10:00:07.000Z', jetzt))
  const f = await wirft(() => pruefeRateLimit('2026-10-28T10:00:07.001Z', jetzt))
  assert.equal(f.code, 'zu_viele_anfragen')
  assert.equal(f.status, 429)
  assert.equal((await wirft(() => pruefeRateLimit('2026-10-28T10:00:10.000Z', jetzt))).status, 429)
  assert.doesNotThrow(() => pruefeRateLimit('kein-datum', jetzt))
})

// ---------- sipgate: Request-Aufbau ----------

test('Anruf-Body: Geraet klingelt zuerst (caller = Geraete-ID, keine deviceId)', () => {
  assert.deepEqual(baueAnrufBody({ geraetId: 'm0', rufnummerCaller: null, rufnummerAnzeige: null, callee: '+4915112345678' }), {
    caller: 'm0',
    callee: '+4915112345678',
  })
})

test('Anruf-Body: eigene Rufnummer als Caller braucht deviceId, callerId nur wenn gesetzt', () => {
  assert.deepEqual(
    baueAnrufBody({ geraetId: 'e1', rufnummerCaller: '+491511112222', rufnummerAnzeige: '+4930123456', callee: '+4915112345678' }),
    { deviceId: 'e1', caller: '+491511112222', callee: '+4915112345678', callerId: '+4930123456' },
  )
  const nurAnzeige = baueAnrufBody({ geraetId: 'm0', rufnummerCaller: null, rufnummerAnzeige: '+4930123456', callee: '+4915112345678' })
  assert.deepEqual(nurAnzeige, { caller: 'm0', callee: '+4915112345678', callerId: '+4930123456' })
})

test('sipgate Classic: Anruf wird korrekt an POST /sessions/calls gesendet', async () => {
  const aufrufe: { url: string; init: RequestInit }[] = []
  const f: FetchLike = async (url, init) => {
    aufrufe.push({ url, init })
    return jsonAntwort(200, { sessionId: 'sess-42' })
  }
  const r = await sipgateClassic.anrufen(Z, { geraetId: 'm0', rufnummerCaller: null, rufnummerAnzeige: null, callee: '+4915112345678' }, f)
  assert.deepEqual(r, { anrufId: 'sess-42' })
  assert.equal(aufrufe.length, 1)
  const a = aufrufe[0]
  assert.equal(a.url, 'https://api.sipgate.com/v2/sessions/calls')
  assert.equal(a.init.method, 'POST')
  const h = a.init.headers as Record<string, string>
  assert.equal(h.Authorization, `Basic ${Buffer.from(`${Z.tokenId}:${Z.token}`).toString('base64')}`)
  assert.equal(h['Content-Type'], 'application/json')
  assert.deepEqual(JSON.parse(a.init.body as string), { caller: 'm0', callee: '+4915112345678' })
})

test('sipgate Classic: Anruf ohne sessionId in der Antwort ist trotzdem erfolgreich', async () => {
  const r = await sipgateClassic.anrufen(Z, { geraetId: 'm0', rufnummerCaller: null, rufnummerAnzeige: null, callee: '+4915112345678' }, async () => jsonAntwort(200, {}))
  assert.deepEqual(r, { anrufId: null })
})

test('sipgate Classic: Geraete werden ueber userinfo (sub) und /{userId}/devices gelesen', async () => {
  const urls: string[] = []
  const auth: string[] = []
  const f: FetchLike = async (url, init) => {
    urls.push(url)
    auth.push((init.headers as Record<string, string>).Authorization)
    if (url.endsWith('/authorization/userinfo')) return jsonAntwort(200, { sub: 'w3', domain: 'sipgate.de', masterSipId: '0000000' })
    return jsonAntwort(200, {
      items: [
        { id: 'm0', alias: 'Satellite Mobil', type: 'MOBILE', online: true },
        { id: 'e1', type: 'EXTERNAL', online: false },
        { alias: 'ohne id' },
      ],
    })
  }
  const geraete = await sipgateClassic.geraete(Z, f)
  assert.deepEqual(urls, ['https://api.sipgate.com/v2/authorization/userinfo', 'https://api.sipgate.com/v2/w3/devices'])
  assert.ok(auth.every((a) => a === `Basic ${Buffer.from(`${Z.tokenId}:${Z.token}`).toString('base64')}`))
  assert.deepEqual(geraete, [
    { id: 'm0', name: 'Satellite Mobil', typ: 'mobile', online: true },
    { id: 'e1', name: 'e1', typ: 'external', online: false },
  ])
})

test('sipgate Classic: es gibt keine Erkennung per Domain mehr (den Kontotyp waehlt der Nutzer)', async () => {
  const f: FetchLike = async (url) => (url.endsWith('/authorization/userinfo') ? jsonAntwort(200, { sub: 'w0', domain: 'neo.sipgate.de' }) : jsonAntwort(200, { items: [{ id: 'm0' }] }))
  assert.equal((await sipgateClassic.geraete(Z, f)).length, 1)
})

test('sipgate Neo (nach Doku): Anruf geht an POST /calls mit deviceId/targetNumber ohne Pluszeichen', async () => {
  const aufrufe: { url: string; init: RequestInit }[] = []
  const f: FetchLike = async (url, init) => {
    aufrufe.push({ url, init })
    return jsonAntwort(200, { callSid: 'pbx-c-123' })
  }
  const r = await sipgateNeo.anrufen(Z, { geraetId: 'e0', rufnummerCaller: null, rufnummerAnzeige: '+4930123456', callee: '+4915112345678' }, f)
  assert.deepEqual(r, { anrufId: 'pbx-c-123' })
  assert.equal(aufrufe[0].url, 'https://api.sipgate.com/v2/calls')
  assert.equal(aufrufe[0].init.method, 'POST')
  assert.equal((aufrufe[0].init.headers as Record<string, string>).Authorization, `Basic ${Buffer.from(`${Z.tokenId}:${Z.token}`).toString('base64')}`)
  assert.deepEqual(JSON.parse(aufrufe[0].init.body as string), { deviceId: 'e0', targetNumber: '4915112345678', callerId: '4930123456' })
})

test('sipgate Neo: Body ohne callerId, keine Classic-Felder, eigene Rufnummer wird nicht gesendet', () => {
  const body = baueNeoAnrufBody({ geraetId: 'e0', rufnummerCaller: '+491511112222', rufnummerAnzeige: null, callee: '+4915112345678' })
  assert.deepEqual(body, { deviceId: 'e0', targetNumber: '4915112345678' })
  assert.equal('caller' in body, false)
  assert.equal(ohnePlus('+49123'), '49123')
  assert.equal(ohnePlus('49123'), '49123')
})

test('sipgate Neo: Geraete ueber userinfo und /{userId}/devices wie bei Classic', async () => {
  const urls: string[] = []
  const f: FetchLike = async (url) => {
    urls.push(url)
    return url.endsWith('/authorization/userinfo') ? jsonAntwort(200, { sub: 'w7', domain: 'sipgate.de' }) : jsonAntwort(200, { items: [{ id: 'e0', alias: 'Neo-Handy', type: 'EXTERNAL', online: true }] })
  }
  assert.deepEqual(await sipgateNeo.geraete(Z, f), [{ id: 'e0', name: 'Neo-Handy', typ: 'external', online: true }])
  assert.deepEqual(urls, ['https://api.sipgate.com/v2/authorization/userinfo', 'https://api.sipgate.com/v2/w7/devices'])
})

test('sipgate Neo: Fehler nennen das Neo-Recht rtcm:write, Classic sessions:calls:write', async () => {
  const neo = fehlerAusSipgateStatus(403, 'anruf', 'sipgate_neo')
  assert.match(neo.message, /rtcm:write/)
  assert.ok(!neo.message.includes('sessions:calls:write'))
  assert.match(fehlerAusSipgateStatus(403, 'anruf').message, /sessions:calls:write/)
  assert.match(fehlerAusSipgateStatus(403, 'geraete', 'sipgate_neo').message, /rtcm:write/)
  const f: FetchLike = async () => jsonAntwort(400, {})
  const fehler = await wirft(() => sipgateNeo.anrufen(Z, { geraetId: 'e0', rufnummerCaller: null, rufnummerAnzeige: null, callee: '+4915112345678' }, f))
  assert.equal(fehler.code, 'nummer_ungueltig')
})

test('Adapter: Registry kennt Classic und Neo, unbekannte Anbieter scheitern', async () => {
  assert.equal(adapterFuer('sipgate_classic'), sipgateClassic)
  assert.equal(adapterFuer('sipgate_neo'), sipgateNeo)
  assert.equal((await wirft(() => adapterFuer('anderer'))).code, 'nicht_unterstuetzt')
})

test('Zuweisung: freier Lead wird uebernommen, eigener nicht, fremder wird verweigert (409, ohne Namen)', async () => {
  assert.equal(pruefeZuweisung({ zugewiesen_an: null }, 'u1'), true)
  assert.equal(pruefeZuweisung({}, 'u1'), true)
  assert.equal(pruefeZuweisung({ zugewiesen_an: 'u1' }, 'u1'), false)
  const f = await wirft(() => pruefeZuweisung({ zugewiesen_an: 'u2' }, 'u1'))
  assert.equal(f.code, 'lead_vergeben')
  assert.equal(f.status, 409)
  assert.equal(f.message, 'Dieser Lead wird bereits von jemand anderem bearbeitet.')
})

test('sipgate Classic: userinfo ohne Nutzerkennung ergibt Anbieterfehler', async () => {
  const fehler = await wirft(() => sipgateClassic.geraete(Z, async () => jsonAntwort(200, {})))
  assert.equal(fehler.code, 'anbieter_fehler')
})

// ---------- Fehlerabbildung ----------

test('Fehlerabbildung: sipgate-Status werden zu verstaendlichen deutschen Meldungen', () => {
  const faelle: [number, 'zugang' | 'geraete' | 'anruf', string, number][] = [
    [401, 'zugang', 'token_ungueltig', 422],
    [401, 'anruf', 'token_ungueltig', 422],
    [403, 'anruf', 'rechte_fehlen', 422],
    [403, 'geraete', 'rechte_fehlen', 422],
    [402, 'anruf', 'guthaben', 422],
    [404, 'anruf', 'geraet_unbekannt', 422],
    [400, 'anruf', 'nummer_ungueltig', 422],
    [400, 'geraete', 'anbieter_fehler', 502],
    [429, 'anruf', 'zu_viele_anfragen', 429],
    [500, 'anruf', 'anbieter_nicht_erreichbar', 502],
    [503, 'geraete', 'anbieter_nicht_erreichbar', 502],
    [418, 'anruf', 'anbieter_fehler', 502],
  ]
  for (const [status, kontext, code, httpStatus] of faelle) {
    const f = fehlerAusSipgateStatus(status, kontext)
    assert.equal(f.code, code, `${status}/${kontext}`)
    assert.equal(f.status, httpStatus, `${status}/${kontext}`)
    assert.ok(f.message.length > 20)
    assert.ok(!/\b(401|403|402|404|500|503|undefined|null)\b/.test(f.message), f.message)
  }
})

test('Fehlerabbildung: HTTP-Fehler von sipgate liefern keine Antwortinhalte oder Tokenteile', async () => {
  for (const status of [400, 401, 402, 403, 404, 429, 500, 502]) {
    const f: FetchLike = async () => jsonAntwort(status, { message: `intern: ${GEHEIMES_TOKEN} Stacktrace`, token: GEHEIMES_TOKEN })
    const fehler = await wirft(() => sipgateClassic.anrufen(Z, { geraetId: 'm0', rufnummerCaller: null, rufnummerAnzeige: null, callee: '+4915112345678' }, f))
    assert.ok(!fehler.message.includes(GEHEIMES_TOKEN))
    assert.ok(!fehler.message.includes('Stacktrace'))
    assert.ok(!fehler.message.includes(Z.tokenId))
  }
})

test('Fehlerabbildung: Netzwerkfehler und Zeitueberschreitung verraten nichts', async () => {
  const f: FetchLike = async () => {
    throw new Error(`connect ECONNREFUSED mit Authorization Basic ${Buffer.from(`${Z.tokenId}:${Z.token}`).toString('base64')}`)
  }
  const fehler = await wirft(() => sipgateClassic.geraete(Z, f))
  assert.equal(fehler.code, 'anbieter_nicht_erreichbar')
  assert.equal(fehler.status, 502)
  assert.ok(!fehler.message.includes('ECONNREFUSED'))
  assert.ok(!fehler.message.includes(GEHEIMES_TOKEN))
  assert.ok(!fehler.message.includes(Buffer.from(`${Z.tokenId}:${Z.token}`).toString('base64')))
})

test('Rueckruf-/Anzeigenummer: Ausland (E.164) erlaubt, Premium und Sondernummern abgelehnt, Lead-Ziele bleiben deutsch', () => {
  const r = parseVerbindenBody({ aktion: 'geraet_waehlen', geraetId: 'm0', rufnummerCaller: '+43 664 1234567', rufnummerAnzeige: '+66 81 234 5678' })
  assert.deepEqual(r, { ok: true, value: { aktion: 'geraet_waehlen', geraetId: 'm0', rufnummerCaller: '+436641234567', rufnummerAnzeige: '+66812345678' } })
  assert.equal(parseVerbindenBody({ aktion: 'geraet_waehlen', geraetId: 'm0', rufnummerCaller: '0900 1234567' }).ok, false)
  assert.equal(parseVerbindenBody({ aktion: 'geraet_waehlen', geraetId: 'm0', rufnummerAnzeige: '+41 900 123 456' }).ok, false)
  assert.equal(normalisiereRufnummer('+43 664 1234567'), null)
})
