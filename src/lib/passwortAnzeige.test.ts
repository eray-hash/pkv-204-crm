import test from 'node:test'
import assert from 'node:assert/strict'
import { buttonLabel, eingabeTyp, STANDARD_SICHTBAR, umschalten } from './passwortAnzeige.ts'

test('Passwortfeld: standardmaessig verborgen', () => {
  assert.equal(STANDARD_SICHTBAR, false)
  assert.equal(eingabeTyp(STANDARD_SICHTBAR), 'password')
  assert.equal(buttonLabel(STANDARD_SICHTBAR), 'Passwort anzeigen')
})

test('Passwortfeld: Umschalten wechselt Typ und Beschriftung hin und zurueck', () => {
  const an = umschalten(false)
  assert.equal(an, true)
  assert.equal(eingabeTyp(an), 'text')
  assert.equal(buttonLabel(an), 'Passwort verbergen')
  assert.equal(umschalten(an), false)
})
