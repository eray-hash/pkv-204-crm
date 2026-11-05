import test from 'node:test'
import assert from 'node:assert/strict'
import { zeitraumBereich } from './zeitraum.ts'

const iso = (d: Date) => d.toISOString()

test('Zeitraum: "heute" richtet sich nach der Zeitzone, nicht nach der Browser-Zeitzone (Berlin gegen Bangkok)', () => {
  const jetzt = new Date('2026-10-29T20:00:00Z') // Berlin (MEZ) 21:00 am 29.10., Bangkok 03:00 am 30.10.
  const berlin = zeitraumBereich('heute', { jetzt, tz: 'Europe/Berlin' }).bereich!
  assert.equal(iso(berlin.start), '2026-10-28T23:00:00.000Z')
  assert.equal(iso(berlin.end), '2026-10-29T22:59:59.999Z')
  const bangkok = zeitraumBereich('heute', { jetzt, tz: 'Asia/Bangkok' }).bereich!
  assert.equal(iso(bangkok.start), '2026-10-29T17:00:00.000Z')
  assert.equal(iso(bangkok.end), '2026-10-30T16:59:59.999Z')
})

test('Zeitraum: Zeitumstellung - der Tag hat 25 bzw. 23 Stunden', () => {
  // Ende der Sommerzeit: 25.10.2026 (Berlin)
  const herbst = zeitraumBereich('heute', { jetzt: new Date('2026-10-25T12:00:00Z'), tz: 'Europe/Berlin' }).bereich!
  assert.equal(iso(herbst.start), '2026-10-24T22:00:00.000Z')
  assert.equal(iso(herbst.end), '2026-10-25T22:59:59.999Z')
  assert.equal((herbst.end.getTime() + 1 - herbst.start.getTime()) / 3_600_000, 25)
  // Beginn der Sommerzeit: 29.03.2026
  const fruehling = zeitraumBereich('heute', { jetzt: new Date('2026-03-29T12:00:00Z'), tz: 'Europe/Berlin' }).bereich!
  assert.equal(iso(fruehling.start), '2026-03-28T23:00:00.000Z')
  assert.equal(iso(fruehling.end), '2026-03-29T21:59:59.999Z')
  assert.equal((fruehling.end.getTime() + 1 - fruehling.start.getTime()) / 3_600_000, 23)
})

test('Zeitraum: gestern, letzte 7/14/30 Tage, dieser und letzter Monat', () => {
  const jetzt = new Date('2026-11-03T10:00:00Z')
  const z = (a: Parameters<typeof zeitraumBereich>[0]) => zeitraumBereich(a, { jetzt, tz: 'Europe/Berlin' }).bereich!
  assert.equal(iso(z('gestern').start), '2026-11-01T23:00:00.000Z')
  assert.equal(iso(z('gestern').end), '2026-11-02T22:59:59.999Z')
  assert.equal(iso(z('letzte7').start), '2026-10-27T23:00:00.000Z') // 28.10. 00:00 MEZ (Sommerzeit endete am 25.10.)
  assert.equal(iso(z('letzte30').start), '2026-10-04T22:00:00.000Z') // 05.10. 00:00 MESZ
  assert.equal(iso(z('diesermonat').start), '2026-10-31T23:00:00.000Z')
  assert.equal(iso(z('letztermonat').start), '2026-09-30T22:00:00.000Z')
  assert.equal(iso(z('letztermonat').end), '2026-10-31T22:59:59.999Z')
  assert.equal(zeitraumBereich('alle', { jetzt }).bereich, null)
})

test('Zeitraum: Monatsgrenze und Jahreswechsel', () => {
  const jan = zeitraumBereich('letztermonat', { jetzt: new Date('2027-01-15T12:00:00Z'), tz: 'Europe/Berlin' }).bereich!
  assert.equal(iso(jan.start), '2026-11-30T23:00:00.000Z')
  assert.equal(iso(jan.end), '2026-12-31T22:59:59.999Z')
})

test('Zeitraum: benutzerdefiniert in der Zeitzone, unvollstaendig oder Ende vor Start ergibt einen Hinweis statt "Alle"', () => {
  const b = zeitraumBereich('custom', { tz: 'Asia/Bangkok', custom: { start: '2026-10-01', end: '2026-10-02' } })
  assert.equal(iso(b.bereich!.start), '2026-09-30T17:00:00.000Z')
  assert.equal(iso(b.bereich!.end), '2026-10-02T16:59:59.999Z')
  assert.equal(b.hinweis, null)
  const einTag = zeitraumBereich('custom', { tz: 'Europe/Berlin', custom: { start: '2026-10-25', end: '2026-10-25' } }).bereich!
  assert.equal((einTag.end.getTime() + 1 - einTag.start.getTime()) / 3_600_000, 25)
  for (const custom of [{ start: '', end: '2026-10-02' }, { start: '2026-10-01', end: '' }, { start: '', end: '' }]) {
    const r = zeitraumBereich('custom', { custom })
    assert.equal(r.bereich, null)
    assert.match(r.hinweis ?? '', /Start- und Enddatum/)
  }
  assert.equal(zeitraumBereich('custom').hinweis !== null, true)
  const rueckwaerts = zeitraumBereich('custom', { custom: { start: '2026-10-05', end: '2026-10-01' } })
  assert.equal(rueckwaerts.bereich, null)
  assert.match(rueckwaerts.hinweis ?? '', /vor dem Startdatum/)
  const unmoeglich = zeitraumBereich('custom', { custom: { start: '2026-02-31', end: '2026-03-01' } })
  assert.equal(unmoeglich.bereich, null)
  assert.match(unmoeglich.hinweis ?? '', /gültige/)
})
