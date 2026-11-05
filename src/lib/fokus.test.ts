import test from 'node:test'
import assert from 'node:assert/strict'
import { fokusFalleZiel } from './fokus.ts'

test('Fokus-Falle: am Ende vorwaerts zum Anfang, am Anfang rueckwaerts zum Ende, sonst normal weiter', () => {
  assert.equal(fokusFalleZiel(2, 3, false), 0)
  assert.equal(fokusFalleZiel(0, 3, true), 2)
  assert.equal(fokusFalleZiel(1, 3, false), null)
  assert.equal(fokusFalleZiel(1, 3, true), null)
  assert.equal(fokusFalleZiel(0, 1, false), 0)
  assert.equal(fokusFalleZiel(0, 1, true), 0)
})

test('Fokus-Falle: Fokus ausserhalb des Dialogs wird hineingeholt, leerer Dialog laesst den Browser entscheiden', () => {
  assert.equal(fokusFalleZiel(-1, 4, false), 0)
  assert.equal(fokusFalleZiel(-1, 4, true), 3)
  assert.equal(fokusFalleZiel(-1, 0, false), null)
})
