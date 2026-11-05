import test from 'node:test'
import assert from 'node:assert/strict'
import { formatDate, formatDateTime, formatTime, initials, KEIN_WERT } from './utils.ts'
import { setAnzeigeZeitzone } from './zeit.ts'

test('Datumsformate: ungueltige oder fehlende Werte ergeben einen Strich statt eines Fehlers', () => {
  for (const f of [formatDate, formatDateTime, formatTime]) {
    assert.equal(f('kein-datum'), KEIN_WERT)
    assert.equal(f(''), KEIN_WERT)
    assert.equal(f(null), KEIN_WERT)
    assert.equal(f(undefined), KEIN_WERT)
  }
})

test('Datumsformate: Anzeige in der Zeitzone des Profils', () => {
  setAnzeigeZeitzone('Europe/Berlin')
  assert.equal(formatDateTime('2026-10-29T20:00:00Z'), '29.10.2026, 21:00')
  setAnzeigeZeitzone('Asia/Bangkok')
  assert.equal(formatDateTime('2026-10-29T20:00:00Z'), '30.10.2026, 03:00')
  assert.equal(formatDate('2026-10-29T20:00:00Z'), '30.10.2026')
  assert.equal(formatTime('2026-10-29T20:00:00Z'), '03:00')
  setAnzeigeZeitzone(undefined)
})

test('Initialen: mehrfache Leerzeichen, leere Namen, nur ein Wort', () => {
  assert.equal(initials('Carsten Kessler'), 'CK')
  assert.equal(initials('  Carsten   Kessler  '), 'CK')
  assert.equal(initials('Matthias'), 'M')
  assert.equal(initials(''), '')
  assert.equal(initials('anna maria von test'), 'AM')
})
