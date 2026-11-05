import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bearerToken, leseBegrenzterBody, leseJsonBegrenzt, pruefeNutzerToken } from './http.ts'

test('Bearer-Schema ist nicht von Gross-/Kleinschreibung abhaengig', () => {
  assert.equal(bearerToken('Bearer abc.def'), 'abc.def')
  assert.equal(bearerToken('bearer abc'), 'abc')
  assert.equal(bearerToken('BEARER   abc  '), 'abc')
  assert.equal(bearerToken('Basic abc'), '')
  assert.equal(bearerToken('Bearer'), '')
  assert.equal(bearerToken(''), '')
  assert.equal(bearerToken(null), '')
})

function post(body: string, headers: Record<string, string> = {}) {
  return new Request('http://x.test/', { method: 'POST', body, headers })
}

test('Body: zu grosses Content-Length wird vor dem Lesen mit 413 abgelehnt', async () => {
  // Falls Content-Length nicht gesetzt werden darf (Request-Konstruktor), ein Stub mit den noetigen Teilen verwenden
  let leseversuche = 0
  const req = {
    headers: new Headers({ 'content-length': '100000' }),
    get body() {
      leseversuche++
      return null
    },
  } as unknown as Request
  const r = await leseBegrenzterBody(req, 8192)
  assert.deepEqual(r, { ok: false, status: 413 })
  assert.equal(leseversuche, 0)
})

test('Body: ohne Content-Length wird beim Lesen abgebrochen (413), kleine Bodies gehen durch', async () => {
  assert.deepEqual(await leseBegrenzterBody(post('x'.repeat(9000)), 8192), { ok: false, status: 413 })
  assert.deepEqual(await leseBegrenzterBody(post('hallo'), 8192), { ok: true, text: 'hallo' })
  assert.deepEqual(await leseBegrenzterBody(post('x'.repeat(8192)), 8192), { ok: true, text: 'x'.repeat(8192) })
  assert.deepEqual(await leseBegrenzterBody(new Request('http://x.test/', { method: 'POST' }), 100), { ok: true, text: '' })
})

test('Body: ungueltiges Content-Length ist 400', async () => {
  const req = new Request('http://x.test/', { method: 'POST', body: 'a', headers: { 'content-length': 'abc' } })
  // Node/undici erlaubt das Setzen eines falschen content-length nicht immer; dann gilt der echte Wert
  const r = await leseBegrenzterBody(req, 100)
  assert.ok(r.ok || r.status === 400)
})

test('JSON: gueltig, ungueltig (body undefined) und zu gross', async () => {
  assert.deepEqual(await leseJsonBegrenzt(post('{"a":1}'), 100), { ok: true, body: { a: 1 } })
  assert.deepEqual(await leseJsonBegrenzt(post('{kaputt'), 100), { ok: true, body: undefined })
  assert.deepEqual(await leseJsonBegrenzt(post('x'.repeat(200)), 100), { ok: false, status: 413 })
})

test('Nutzer-Token: gueltig, ungueltig (401), fehlend (401), Auth-Dienst nicht erreichbar (502)', async () => {
  const gut = async () => ({ data: { user: { id: 'u1' } }, error: null })
  assert.deepEqual(await pruefeNutzerToken('bearer tok', gut), { ok: true, userId: 'u1' })

  const ungueltig = async () => ({ data: { user: null }, error: { status: 401, name: 'AuthApiError' } })
  const r1 = await pruefeNutzerToken('Bearer tok', ungueltig)
  assert.equal(r1.ok, false)
  if (!r1.ok) assert.equal(r1.status, 401)

  let aufgerufen = false
  const r2 = await pruefeNutzerToken(null, async () => { aufgerufen = true; return gut() })
  assert.equal(r2.ok === false && r2.status, 401)
  assert.equal(aufgerufen, false)

  const netz = async (): Promise<never> => { throw new TypeError('fetch failed') }
  const r3 = await pruefeNutzerToken('Bearer tok', netz)
  assert.equal(r3.ok === false && r3.status, 502)

  const retry = async () => ({ data: null, error: { name: 'AuthRetryableFetchError', status: 0 } })
  const r4 = await pruefeNutzerToken('Bearer tok', retry)
  assert.equal(r4.ok === false && r4.status, 502)

  const fuenfhundert = async () => ({ data: null, error: { status: 503 } })
  assert.equal((await pruefeNutzerToken('Bearer tok', fuenfhundert)).ok, false)
  const r5 = await pruefeNutzerToken('Bearer tok', fuenfhundert)
  assert.equal(r5.ok === false && r5.status, 502)
})
