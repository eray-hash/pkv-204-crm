import test from 'node:test'
import assert from 'node:assert/strict'
import { effektivOnline, imZeitfenster, istImAutoFenster, parseUhrzeit, type Erreichbarkeit } from './praesenz.ts'

const person = (over: Partial<Erreichbarkeit> = {}): Erreichbarkeit => ({
  zeitzone: 'Europe/Berlin',
  online: false,
  auto_online: true,
  erreichbar_von: '09:00:00',
  erreichbar_bis: '17:00:00',
  ...over,
})
const d = (iso: string) => new Date(iso)
const min = (h: number, m = 0) => h * 60 + m

test('parseUhrzeit: HH:MM und HH:MM:SS, ungueltig -> null', () => {
  assert.equal(parseUhrzeit('08:30'), 510)
  assert.equal(parseUhrzeit('08:30:00'), 510)
  assert.equal(parseUhrzeit('0:05'), 5)
  assert.equal(parseUhrzeit('24:00'), null)
  assert.equal(parseUhrzeit('12:60'), null)
  assert.equal(parseUhrzeit(''), null)
  assert.equal(parseUhrzeit(null), null)
  assert.equal(parseUhrzeit('abc'), null)
})

test('Zeitfenster am selben Tag: von inklusive, bis exklusive', () => {
  assert.equal(imZeitfenster(min(8, 59), min(9), min(17)), false)
  assert.equal(imZeitfenster(min(9), min(9), min(17)), true)
  assert.equal(imZeitfenster(min(16, 59), min(9), min(17)), true)
  assert.equal(imZeitfenster(min(17), min(9), min(17)), false)
})

test('Zeitfenster ueber Mitternacht (20:00 bis 06:00)', () => {
  const v = min(20)
  const b = min(6)
  assert.equal(imZeitfenster(min(19, 59), v, b), false)
  assert.equal(imZeitfenster(min(20), v, b), true)
  assert.equal(imZeitfenster(min(23, 59), v, b), true)
  assert.equal(imZeitfenster(0, v, b), true)
  assert.equal(imZeitfenster(min(5, 59), v, b), true)
  assert.equal(imZeitfenster(min(6), v, b), false)
  assert.equal(imZeitfenster(min(12), v, b), false)
})

test('Gleiche Zeiten ergeben ein leeres Fenster', () => {
  assert.equal(imZeitfenster(min(12), min(9), min(9)), false)
  assert.equal(imZeitfenster(min(9), min(9), min(9)), false)
})

test('Fenster gilt in der Ortszeit der Person (Berlin vs. Bangkok zum selben Zeitpunkt)', () => {
  const berlin = person({ zeitzone: 'Europe/Berlin' })
  const bangkok = person({ zeitzone: 'Asia/Bangkok' })
  // 08:00 UTC = 10:00 Berlin (Sommer) = 15:00 Bangkok: beide im Fenster 09-17
  assert.equal(istImAutoFenster(berlin, d('2026-07-01T08:00:00Z')), true)
  assert.equal(istImAutoFenster(bangkok, d('2026-07-01T08:00:00Z')), true)
  // 12:00 UTC = 14:00 Berlin, aber 19:00 Bangkok
  assert.equal(istImAutoFenster(berlin, d('2026-07-01T12:00:00Z')), true)
  assert.equal(istImAutoFenster(bangkok, d('2026-07-01T12:00:00Z')), false)
})

test('Matthias in Thailand: Fenster 14:00 bis 23:00 Ortszeit (= 9 bis 18 Uhr deutscher Sommerzeit)', () => {
  const m = person({ zeitzone: 'Asia/Bangkok', erreichbar_von: '14:00', erreichbar_bis: '23:00' })
  assert.equal(istImAutoFenster(m, d('2026-07-01T07:00:00Z')), true) // 14:00 Bangkok
  assert.equal(istImAutoFenster(m, d('2026-07-01T06:59:00Z')), false)
  assert.equal(istImAutoFenster(m, d('2026-07-01T15:59:00Z')), true) // 22:59 Bangkok
  assert.equal(istImAutoFenster(m, d('2026-07-01T16:00:00Z')), false) // 23:00 Bangkok
})

test('Fenster ueber Mitternacht in Bangkok (20:00 bis 06:00)', () => {
  const m = person({ zeitzone: 'Asia/Bangkok', erreichbar_von: '20:00', erreichbar_bis: '06:00' })
  assert.equal(istImAutoFenster(m, d('2026-07-01T14:00:00Z')), true) // 21:00
  assert.equal(istImAutoFenster(m, d('2026-07-01T20:00:00Z')), true) // 03:00
  assert.equal(istImAutoFenster(m, d('2026-07-01T05:00:00Z')), false) // 12:00
})

test('Sommerzeitwechsel: Ortszeit-Fenster folgt der Wanduhr, nicht UTC', () => {
  const nachts = person({ erreichbar_von: '02:30', erreichbar_bis: '03:30' })
  assert.equal(istImAutoFenster(nachts, d('2026-10-25T00:45:00Z')), true) // 02:45 CEST
  assert.equal(istImAutoFenster(nachts, d('2026-10-25T01:45:00Z')), true) // 02:45 CET (Stunde wiederholt)
  assert.equal(istImAutoFenster(nachts, d('2026-10-25T02:45:00Z')), false) // 03:45 CET
  const fruehjahr = person({ erreichbar_von: '03:00', erreichbar_bis: '04:00' })
  assert.equal(istImAutoFenster(fruehjahr, d('2026-03-29T00:30:00Z')), false) // 01:30 CET
  assert.equal(istImAutoFenster(fruehjahr, d('2026-03-29T01:00:00Z')), true) // 03:00 CEST
  const ueberspringt = person({ erreichbar_von: '02:00', erreichbar_bis: '03:00' })
  assert.equal(istImAutoFenster(ueberspringt, d('2026-03-29T01:00:00Z')), false) // 02:xx gibt es an diesem Tag nicht
})

test('Winter vs. Sommer: dasselbe Bangkok-Fenster entspricht verschiedenen deutschen Uhrzeiten', () => {
  const m = person({ zeitzone: 'Asia/Bangkok', erreichbar_von: '14:00', erreichbar_bis: '23:00' })
  // 14:00 Bangkok = 09:00 Berlin im Sommer, aber 08:00 Berlin im Winter; als UTC immer 07:00
  assert.equal(istImAutoFenster(m, d('2026-12-01T07:00:00Z')), true)
  assert.equal(istImAutoFenster(m, d('2026-12-01T06:59:00Z')), false)
})

test('effektiv online: manuell, automatisch oder beides; ohne Fenster nie automatisch', () => {
  const jetzt = d('2026-07-01T08:00:00Z') // 10:00 Berlin
  assert.equal(effektivOnline(person({ online: true, auto_online: false }), jetzt), true)
  assert.equal(effektivOnline(person({ online: true, erreichbar_von: '20:00', erreichbar_bis: '21:00' }), jetzt), true)
  assert.equal(effektivOnline(person({ online: false }), jetzt), true) // automatisch im Fenster
  assert.equal(effektivOnline(person({ online: false, auto_online: false }), jetzt), false)
  assert.equal(effektivOnline(person({ erreichbar_von: null, erreichbar_bis: null }), jetzt), false)
  assert.equal(effektivOnline(person({ erreichbar_von: '10:00' , erreichbar_bis: null }), jetzt), false)
  assert.equal(effektivOnline(person({ erreichbar_von: '10:00', erreichbar_bis: '10:00' }), jetzt), false)
  assert.equal(effektivOnline(person({ zeitzone: 'Mars/Base' }), jetzt), true) // faellt auf Europe/Berlin zurueck
})
