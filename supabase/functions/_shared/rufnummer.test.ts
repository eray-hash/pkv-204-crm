import { test } from 'node:test'
import assert from 'node:assert/strict'
import { istErlaubteRufnummer, normalisiereDeutscheRufnummer as n } from './rufnummer.ts'

test('Mobil und Ortsnetz werden normalisiert', () => {
  assert.equal(n('0151 1234 5678'), '+4915112345678')
  assert.equal(n('0049 151 12345678'), '+4915112345678')
  assert.equal(n('+49 (0) 151 / 12345678'), '+4915112345678')
  assert.equal(n('015112345678'), '+4915112345678')
  assert.equal(n('0171 1234567'), '+491711234567')
  assert.equal(n('0160 12345678'), '+4916012345678')
  assert.equal(n('030 12345678'), '+493012345678')
  assert.equal(n('089 123456'), '+4989123456')
})

test('Ortsnetz: Mindest- und Hoechstlaenge', () => {
  assert.equal(n('030 12345'), '+493012345') // 7 Ziffern: Minimum
  assert.equal(n('030 1234'), null) // 6 Ziffern: zu kurz
  assert.equal(n('0211 123456789'), '+49211123456789') // 12 Ziffern: Maximum
  assert.equal(n('0211 1234567890'), null) // 13 Ziffern: zu lang
})

test('Trunk-Null nach der Landesvorwahl wird entfernt', () => {
  assert.equal(n('+49 0151 12345678'), '+4915112345678')
  assert.equal(n('0049 0151 12345678'), '+4915112345678')
  assert.equal(n('+490151 12345678'), '+4915112345678')
})

test('Premium- und Sondernummern werden abgelehnt', () => {
  for (const x of ['0900 1234567', '0137 1234567', '0180 1234567', '01805 123456', '0700 12345678', '0118 12345', '032 12345678', '0190 123456', '0800 1234567', '0116 123', '0123 4567890', '01012 3456789', '112', '110']) {
    assert.equal(n(x), null, x)
  }
  assert.equal(n('+49 900 1234567'), null)
})

test('Auslandsnummern und fremde Landesvorwahlen werden abgelehnt', () => {
  for (const x of ['+43 664 1234567', '0043 664 1234567', '+41 79 1234567', '+1 202 555 0123', '+44 20 7946 0958', '4915112345678', '+4915112345678+1']) {
    assert.equal(n(x), null, x)
  }
})

test('Mobil: falsche Laenge und unbekannte Praefixe', () => {
  assert.equal(n('0151 123456'), null)
  assert.equal(n('0151 1234567890'), null)
  assert.equal(n('0141 12345678'), null)
  assert.equal(n('0100 12345678'), null)
})

test('Buchstaben und Steuerzeichen fuehren zur Ablehnung', () => {
  assert.equal(n('abc'), null)
  assert.equal(n('0151 1234x678'), null)
  assert.equal(n('0151\u0000 12345678'), null)
  assert.equal(n('0151\n12345678'), null)
  assert.equal(n(''), null)
})

test('Altdaten: nur +49 im Format E.164 und Allowlist', () => {
  assert.equal(istErlaubteRufnummer('+4915112345678'), true)
  assert.equal(istErlaubteRufnummer('+491511234567'), true)
  assert.equal(istErlaubteRufnummer('+4390012345678'), false)
  assert.equal(istErlaubteRufnummer('+499001234567'), false)
  assert.equal(istErlaubteRufnummer('+493012345'), true)
  assert.equal(istErlaubteRufnummer('+49301234'), false)
  assert.equal(istErlaubteRufnummer('015112345678'), false)
  assert.equal(istErlaubteRufnummer('+49015112345678'), false)
  assert.equal(istErlaubteRufnummer('+4915112345678 '), false)
})
