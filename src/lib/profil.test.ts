import test from 'node:test'
import assert from 'node:assert/strict'
import { parseProfile, pruefeErreichbarkeit, uhrzeitKurz } from './profil.ts'

test('parseProfile: komplette Zeile (nach der Migration)', () => {
  const p = parseProfile({
    id: 'u1',
    name: 'Matthias',
    rolle: 'mitarbeiter',
    zeitzone: 'Asia/Bangkok',
    online: true,
    auto_online: true,
    erreichbar_von: '14:00:00',
    erreichbar_bis: '23:00:00',
  })
  assert.deepEqual(p, {
    id: 'u1',
    name: 'Matthias',
    rolle: 'mitarbeiter',
    telefon_festnetz: null,
    telefon_mobil: null,
    zeitzone: 'Asia/Bangkok',
    online: true,
    auto_online: true,
    erreichbar_von: '14:00',
    erreichbar_bis: '23:00',
  })
})

test('parseProfile: Zeile ohne neue Spalten (vor der Migration) bekommt Standardwerte', () => {
  const p = parseProfile({ id: 'u1', name: 'Carsten', rolle: 'geschaeftsfuehrer' })
  assert.equal(p?.rolle, 'geschaeftsfuehrer')
  assert.equal(p?.zeitzone, 'Europe/Berlin')
  assert.equal(p?.online, false)
  assert.equal(p?.auto_online, false)
  assert.equal(p?.erreichbar_von, null)
})

test('parseProfile: ungueltige Werte werden bereinigt', () => {
  assert.equal(parseProfile({ id: 'u1', zeitzone: 'Mars/Base', rolle: 'admin' })?.zeitzone, 'Europe/Berlin')
  assert.equal(parseProfile({ id: 'u1', rolle: 'admin' })?.rolle, 'mitarbeiter')
  assert.equal(parseProfile({ id: 'u1' })?.name, 'Unbekannt')
  assert.equal(parseProfile(null), null)
  assert.equal(parseProfile({ name: 'x' }), null)
})

test('uhrzeitKurz', () => {
  assert.equal(uhrzeitKurz('08:05:00'), '08:05')
  assert.equal(uhrzeitKurz('8:05'), '08:05')
  assert.equal(uhrzeitKurz('25:00'), null)
  assert.equal(uhrzeitKurz(null), null)
})

test('pruefeErreichbarkeit: Fehler auf Deutsch', () => {
  const ok = { zeitzone: 'Asia/Bangkok', online: false, auto_online: true, erreichbar_von: '20:00', erreichbar_bis: '06:00' }
  assert.equal(pruefeErreichbarkeit(ok), null)
  assert.match(pruefeErreichbarkeit({ ...ok, zeitzone: 'Mars/Base' })!, /Zeitzone/)
  assert.match(pruefeErreichbarkeit({ ...ok, erreichbar_bis: '' })!, /Zeitfensters/)
  assert.match(pruefeErreichbarkeit({ ...ok, erreichbar_von: '09:00', erreichbar_bis: '09:00' })!, /nicht gleich/)
  assert.match(pruefeErreichbarkeit({ ...ok, erreichbar_von: '99:00' })!, /ungültig/)
  assert.equal(pruefeErreichbarkeit({ ...ok, auto_online: false, erreichbar_von: '', erreichbar_bis: '' }), null)
})
