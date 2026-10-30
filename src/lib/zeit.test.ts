import test from 'node:test'
import assert from 'node:assert/strict'
import {
  eingabeZeitzone,
  formatOrtszeit,
  getAnzeigeZeitzone,
  isoZuLokal,
  morgenFrueh,
  istGueltigeZeitzone,
  lokalZuIso,
  minutenSeitMitternacht,
  ortszeit,
  setAnzeigeZeitzone,
  zeitzonenListe,
  zonenOffsetMs,
} from './zeit.ts'

const d = (iso: string) => new Date(iso)

test('Zeitzonen-Gueltigkeit', () => {
  assert.equal(istGueltigeZeitzone('Europe/Berlin'), true)
  assert.equal(istGueltigeZeitzone('Asia/Bangkok'), true)
  assert.equal(istGueltigeZeitzone('Mars/Base'), false)
  assert.equal(istGueltigeZeitzone(''), false)
  assert.equal(istGueltigeZeitzone(null), false)
})

test('Berlin und Bangkok: 5 Stunden Unterschied im Sommer, 6 im Winter', () => {
  const sommer = d('2026-07-01T12:00:00Z')
  assert.equal(formatOrtszeit(sommer, 'Europe/Berlin'), '14:00')
  assert.equal(formatOrtszeit(sommer, 'Asia/Bangkok'), '19:00')
  const winter = d('2026-12-01T12:00:00Z')
  assert.equal(formatOrtszeit(winter, 'Europe/Berlin'), '13:00')
  assert.equal(formatOrtszeit(winter, 'Asia/Bangkok'), '19:00')
  assert.equal(zonenOffsetMs(sommer, 'Europe/Berlin'), 2 * 3_600_000)
  assert.equal(zonenOffsetMs(winter, 'Europe/Berlin'), 3_600_000)
  assert.equal(zonenOffsetMs(sommer, 'Asia/Bangkok'), 7 * 3_600_000)
  assert.equal(zonenOffsetMs(winter, 'Asia/Bangkok'), 7 * 3_600_000)
})

test('Sommerzeitwechsel Berlin 2026 (29.03. vor, 25.10. zurueck)', () => {
  assert.equal(formatOrtszeit(d('2026-03-29T00:59:00Z'), 'Europe/Berlin'), '01:59')
  assert.equal(formatOrtszeit(d('2026-03-29T01:00:00Z'), 'Europe/Berlin'), '03:00')
  assert.equal(formatOrtszeit(d('2026-10-25T00:30:00Z'), 'Europe/Berlin'), '02:30')
  assert.equal(formatOrtszeit(d('2026-10-25T01:30:00Z'), 'Europe/Berlin'), '02:30') // die Stunde wiederholt sich
  assert.equal(formatOrtszeit(d('2026-10-25T02:00:00Z'), 'Europe/Berlin'), '03:00')
  assert.equal(minutenSeitMitternacht(d('2026-10-25T02:00:00Z'), 'Europe/Berlin'), 180)
})

test('Mitternacht wird als 00:xx, nie als 24:xx dargestellt', () => {
  assert.equal(ortszeit(d('2026-07-01T17:05:00Z'), 'Asia/Bangkok').stunde, 0)
  assert.equal(formatOrtszeit(d('2026-07-01T17:05:00Z'), 'Asia/Bangkok'), '00:05')
})

test('Ungueltige Zeitzone faellt auf Europe/Berlin zurueck', () => {
  assert.equal(formatOrtszeit(d('2026-07-01T12:00:00Z'), 'Mars/Base'), '14:00')
})

test('lokalZuIso / isoZuLokal: Eingaben gelten in der gewaehlten Zeitzone (Sommer, Winter, Bangkok)', () => {
  assert.equal(lokalZuIso('2026-07-01T14:00', 'Europe/Berlin'), '2026-07-01T12:00:00.000Z')
  assert.equal(lokalZuIso('2026-12-01T13:00', 'Europe/Berlin'), '2026-12-01T12:00:00.000Z')
  assert.equal(lokalZuIso('2026-07-01T19:00', 'Asia/Bangkok'), '2026-07-01T12:00:00.000Z')
  assert.equal(isoZuLokal('2026-07-01T12:00:00Z', 'Asia/Bangkok'), '2026-07-01T19:00')
  assert.equal(isoZuLokal('2026-12-01T12:00:00Z', 'Europe/Berlin'), '2026-12-01T13:00')
  assert.equal(lokalZuIso('kein-datum', 'Europe/Berlin'), null)
})

test('lokalZuIso: Eingaben rund um den Sommerzeitwechsel bleiben rund', () => {
  // vor dem Wechsel (CET, +1) und danach (CEST, +2)
  assert.equal(lokalZuIso('2026-03-29T01:30', 'Europe/Berlin'), '2026-03-29T00:30:00.000Z')
  assert.equal(lokalZuIso('2026-03-29T03:30', 'Europe/Berlin'), '2026-03-29T01:30:00.000Z')
  assert.equal(lokalZuIso('2026-10-25T03:30', 'Europe/Berlin'), '2026-10-25T02:30:00.000Z')
  for (const wert of ['2026-03-29T03:30', '2026-10-25T02:30', '2026-10-25T04:15', '2026-07-01T00:00']) {
    assert.equal(isoZuLokal(lokalZuIso(wert, 'Europe/Berlin')!, 'Europe/Berlin'), wert)
  }
})

test('Anzeige-Zeitzone: ungueltige Werte werden ignoriert', () => {
  setAnzeigeZeitzone('Asia/Bangkok')
  assert.equal(getAnzeigeZeitzone(), 'Asia/Bangkok')
  assert.equal(eingabeZeitzone(), 'Asia/Bangkok')
  setAnzeigeZeitzone('Mars/Base')
  assert.equal(getAnzeigeZeitzone(), undefined)
  setAnzeigeZeitzone(null)
  assert.equal(getAnzeigeZeitzone(), undefined)
  assert.ok(istGueltigeZeitzone(eingabeZeitzone()))
})

test('Zeitzonen-Liste enthaelt Europe/Berlin und Asia/Bangkok, ist sortiert und gueltig', () => {
  const liste = zeitzonenListe()
  assert.ok(liste.includes('Europe/Berlin'))
  assert.ok(liste.includes('Asia/Bangkok'))
  assert.ok(liste.every(istGueltigeZeitzone))
  assert.deepEqual(liste, [...liste].sort((a, b) => a.localeCompare(b)))
})

test('morgenFrueh: morgen 09:00 in der Zeitzone der Person, auch rund um Mitternacht und Monatswechsel', () => {
  // 2026-07-01 22:30 UTC = 03:30 am 02.07. in Bangkok -> morgen = 03.07.
  assert.equal(morgenFrueh(d('2026-07-01T20:30:00Z'), 'Asia/Bangkok'), '2026-07-03T09:00')
  // gleicher Zeitpunkt in Berlin: 22:30 am 01.07. -> morgen = 02.07.
  assert.equal(morgenFrueh(d('2026-07-01T20:30:00Z'), 'Europe/Berlin'), '2026-07-02T09:00')
  assert.equal(morgenFrueh(d('2026-07-31T10:00:00Z'), 'Europe/Berlin'), '2026-08-01T09:00')
  assert.equal(morgenFrueh(d('2026-12-31T10:00:00Z'), 'Europe/Berlin', 8), '2027-01-01T08:00')
})
