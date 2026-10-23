import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizePhone, validateLead } from './validate.ts'

const jetzt = new Date('2026-10-23T10:20:00+02:00')

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

test('gueltiger Lead wird angenommen', () => {
  const r = validateLead(gueltig, jetzt)
  assert.equal(r.ok, true)
  if (r.ok) {
    assert.equal(r.value.telefon, '+4915112345678')
    assert.equal(r.value.tarifbeitrag, 512.4)
    assert.equal(r.value.eingangZeit, '2026-10-23T08:15:30.000Z')
  }
})

test('Telefonnummern werden vereinheitlicht', () => {
  assert.equal(normalizePhone('0151 1234 5678'), '+4915112345678')
  assert.equal(normalizePhone('0049 151 12345678'), '+4915112345678')
  assert.equal(normalizePhone('+49 (0) 151 / 12345678'), '+4915112345678')
  assert.equal(normalizePhone('015112345678'), '+4915112345678')
  assert.equal(normalizePhone('4915112345678'), null)
  assert.equal(normalizePhone('abc'), null)
  assert.equal(normalizePhone('+49123'), null)
})

test('fehlende Pflichtfelder werden einzeln gemeldet', () => {
  const r = validateLead({}, jetzt)
  assert.equal(r.ok, false)
  if (!r.ok) {
    const felder = r.fehler.map((f) => f.feld).sort()
    assert.deepEqual(felder, [
      'eingang_zeit', 'einwilligung_quelle', 'einwilligung_text', 'einwilligung_zeit',
      'email', 'gesellschaft', 'lead_id', 'name', 'tarifbeitrag', 'telefon',
    ])
  }
})

test('Lead ohne Einwilligungsnachweis wird abgelehnt', () => {
  const { einwilligung_text: _t, einwilligung_quelle: _q, einwilligung_zeit: _z, ...ohne } = gueltig
  const r = validateLead(ohne, jetzt)
  assert.equal(r.ok, false)
})

test('zu kurzer Einwilligungstext wird abgelehnt', () => {
  const r = validateLead({ ...gueltig, einwilligung_text: 'ja' }, jetzt)
  assert.equal(r.ok, false)
})

test('Zeitpunkt in der Zukunft oder ohne Zeitzone wird abgelehnt', () => {
  assert.equal(validateLead({ ...gueltig, einwilligung_zeit: '2026-10-24T10:00:00+02:00' }, jetzt).ok, false)
  assert.equal(validateLead({ ...gueltig, eingang_zeit: '2026-10-23T10:15:30' }, jetzt).ok, false)
})

test('ungueltige E-Mail und Beitrag werden abgelehnt', () => {
  assert.equal(validateLead({ ...gueltig, email: 'max@' }, jetzt).ok, false)
  assert.equal(validateLead({ ...gueltig, tarifbeitrag: 0 }, jetzt).ok, false)
  assert.equal(validateLead({ ...gueltig, tarifbeitrag: 'viel' }, jetzt).ok, false)
})

test('Beitrag als Text mit Punkt wird akzeptiert', () => {
  const r = validateLead({ ...gueltig, tarifbeitrag: '512.40' }, jetzt)
  assert.equal(r.ok, true)
})

test('ungueltige IP wird abgelehnt, fehlende IP ist erlaubt', () => {
  assert.equal(validateLead({ ...gueltig, einwilligung_ip: 'nicht-eine-ip' }, jetzt).ok, false)
  const { einwilligung_ip: _ip, ...ohneIp } = gueltig
  assert.equal(validateLead(ohneIp, jetzt).ok, true)
})
