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
      'email', 'gesellschaft', 'lead_id', 'name', 'telefon',
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

// ---------- QA-Haertung ----------

import { istIPv4, istIPv6, istIp, parseIsoZeit } from './validate.ts'

const felder = (input: unknown) => {
  const r = validateLead(input, jetzt)
  return r.ok ? [] : r.fehler.map((f) => f.feld)
}

test('Premium-, Sonder- und Auslandsnummern werden abgelehnt', () => {
  for (const telefon of ['0900 1234567', '0137 1234567', '0180 1234567', '0700 12345678', '0118 12345', '032 12345678', '0190 123456', '+43 664 1234567', '+41 79 123 45 67', '0044 20 7946 0958']) {
    assert.deepEqual(felder({ ...gueltig, telefon }), ['telefon'], telefon)
  }
})

test('Trunk-Null nach der Landesvorwahl wird entfernt', () => {
  const r = validateLead({ ...gueltig, telefon: '+49 0151 12345678' }, jetzt)
  assert.equal(r.ok && r.value.telefon, '+4915112345678')
  assert.equal(normalizePhone('0049 0151 1234 5678'), '+4915112345678')
})

test('Steuerzeichen in Textfeldern werden abgelehnt', () => {
  for (const feld of ['name', 'gesellschaft', 'quelle', 'einwilligung_quelle', 'einwilligung_text', 'lead_id', 'telefon', 'email', 'kanal', 'user_agent']) {
    const wert = feld === 'telefon' ? '0151\u00001234567' : feld === 'email' ? 'max\n@example.de' : feld === 'einwilligung_text' ? 'Ich willige ein,\u0007 dass mich ein Vermittler anruft.' : `Wert\u0007${feld}`
    assert.deepEqual(felder({ ...gueltig, [feld]: wert }), [feld], feld)
  }
  assert.deepEqual(felder({ ...gueltig, name: 'Max\tMuster' }), ['name'])
  assert.deepEqual(felder({ ...gueltig, name: 'Max\u007fMuster' }), ['name'])
})

test('Einwilligungstext: Zeilenumbrueche und Tabs sind erlaubt, Steuerzeichen nicht', () => {
  const mitUmbruch = 'Ich willige ein,\r\ndass mich ein Vermittler\n\ttelefonisch anruft.'
  assert.deepEqual(felder({ ...gueltig, einwilligung_text: mitUmbruch }), [])
  assert.deepEqual(felder({ ...gueltig, einwilligung_text: 'Ich willige ein,\u0000 dass mich ein Vermittler anruft.' }), ['einwilligung_text'])
})

test('Zeitstempel: Jahr 0000 und unmoegliche Daten werden abgelehnt', () => {
  assert.equal(parseIsoZeit('0000-01-01T00:00:00Z'), null)
  assert.equal(parseIsoZeit('1999-12-31T23:59:59Z'), null)
  assert.notEqual(parseIsoZeit('2000-01-01T00:00:00Z'), null)
  assert.equal(parseIsoZeit('2026-02-31T10:00:00Z'), null)
  assert.equal(parseIsoZeit('2026-02-29T10:00:00Z'), null) // 2026 ist kein Schaltjahr
  assert.notEqual(parseIsoZeit('2028-02-29T10:00:00Z'), null)
  assert.equal(parseIsoZeit('2026-04-31T10:00:00Z'), null)
  assert.equal(parseIsoZeit('2026-13-01T10:00:00Z'), null)
  assert.equal(parseIsoZeit('2026-10-23T24:00:00Z'), null)
  assert.equal(parseIsoZeit('2026-10-23T10:60:00Z'), null)
  assert.equal(parseIsoZeit('2026-10-23T10:00:60Z'), null)
  assert.equal(parseIsoZeit('2026-10-23T10:00:00+25:00'), null)
  assert.equal(parseIsoZeit('2026-10-23T10:00:00'), null)
  assert.equal(parseIsoZeit('2026-10-23 10:00:00Z'), null)
  assert.deepEqual(felder({ ...gueltig, eingang_zeit: '2026-02-31T10:00:00+01:00' }), ['eingang_zeit'])
  assert.deepEqual(felder({ ...gueltig, einwilligung_zeit: '0000-01-01T00:00:00Z' }), ['einwilligung_zeit'])
})

test('Zeitstempel: Offsets werden korrekt in UTC umgerechnet', () => {
  assert.equal(parseIsoZeit('2026-10-23T10:15:30+02:00'), Date.parse('2026-10-23T08:15:30Z'))
  assert.equal(parseIsoZeit('2026-10-23T10:15:30.250-05:30'), Date.parse('2026-10-23T15:45:30.250Z'))
})

test('eingang_zeit: nicht aelter als 30 Tage und nicht in der Zukunft (5 Minuten Toleranz)', () => {
  // jetzt = 2026-10-23T08:20:00Z
  assert.deepEqual(felder({ ...gueltig, eingang_zeit: '2026-09-23T10:00:00+02:00', einwilligung_zeit: '2026-09-23T09:59:00+02:00' }), ['eingang_zeit'])
  assert.deepEqual(felder({ ...gueltig, eingang_zeit: '2026-09-24T10:30:00+02:00', einwilligung_zeit: '2026-09-24T10:29:00+02:00' }), [])
  assert.deepEqual(felder({ ...gueltig, eingang_zeit: '2026-10-23T10:24:00+02:00', einwilligung_zeit: '2026-10-23T10:20:00+02:00' }), [])
  assert.deepEqual(felder({ ...gueltig, eingang_zeit: '2026-10-23T10:26:00+02:00', einwilligung_zeit: '2026-10-23T10:20:00+02:00' }), ['eingang_zeit'])
})

test('einwilligung_zeit darf nicht nach eingang_zeit (plus 5 Minuten) liegen', () => {
  assert.deepEqual(felder({ ...gueltig, eingang_zeit: '2026-10-23T10:00:00+02:00', einwilligung_zeit: '2026-10-23T10:04:59+02:00' }), [])
  assert.deepEqual(felder({ ...gueltig, eingang_zeit: '2026-10-23T10:00:00+02:00', einwilligung_zeit: '2026-10-23T10:05:01+02:00' }), ['einwilligung_zeit'])
  // alte Einwilligung vor dem Eingang ist erlaubt
  assert.deepEqual(felder({ ...gueltig, einwilligung_zeit: '2026-01-05T10:00:00+01:00' }), [])
})

test('IP-Adressen: echte IPv4 und IPv6, keine Phantasiewerte', () => {
  for (const ip of ['203.0.113.7', '0.0.0.0', '255.255.255.255', '::1', '::', '2001:db8::1', '2001:0db8:0000:0000:0000:0000:0000:0001', '::ffff:192.0.2.1', 'fe80::1']) {
    assert.equal(istIp(ip), true, ip)
  }
  for (const ip of ['999.1.1.1', '1.2.3', '1.2.3.4.5', '01.2.3.4', '256.0.0.1', '1:2:3', ':::', '1::2::3', 'gggg::1', '12345::1', '....', '::..', '1.2.3.4:80', '2001:db8:1:2:3:4:5:6:7', '1:2:3:4:5:6:7::8']) {
    assert.equal(istIp(ip), false, ip)
  }
  assert.equal(istIPv4('203.0.113.7'), true)
  assert.equal(istIPv6('203.0.113.7'), false)
  assert.deepEqual(felder({ ...gueltig, einwilligung_ip: '999.999.999.999' }), ['einwilligung_ip'])
  assert.deepEqual(felder({ ...gueltig, einwilligung_ip: '2001:db8::1' }), [])
})

test('Einwilligungstext: Mindestlaenge 20 und nicht nur ein wiederholtes Zeichen', () => {
  assert.deepEqual(felder({ ...gueltig, einwilligung_text: 'a'.repeat(30) }), ['einwilligung_text'])
  assert.deepEqual(felder({ ...gueltig, einwilligung_text: 'ab '.repeat(12) }), ['einwilligung_text'])
  assert.deepEqual(felder({ ...gueltig, einwilligung_text: 'zu kurz' }), ['einwilligung_text'])
  assert.deepEqual(felder({ ...gueltig, einwilligung_text: 'Ich willige in Anrufe ein.' }), [])
})

test('Optionale Nachweisfelder werden uebernommen und auf Laenge/Typ geprueft', () => {
  const r = validateLead(
    { ...gueltig, einwilligung_version: 'v2.1', kanal: 'web', begunstigter: 'Beispiel GmbH', user_agent: 'Mozilla/5.0', rufnummer_verifiziert: true },
    jetzt,
  )
  assert.equal(r.ok, true)
  if (r.ok) {
    assert.equal(r.value.einwilligungVersion, 'v2.1')
    assert.equal(r.value.kanal, 'web')
    assert.equal(r.value.begunstigter, 'Beispiel GmbH')
    assert.equal(r.value.userAgent, 'Mozilla/5.0')
    assert.equal(r.value.rufnummerVerifiziert, true)
  }
  const ohne = validateLead(gueltig, jetzt)
  assert.equal(ohne.ok && ohne.value.kanal, null)
  assert.equal(ohne.ok && ohne.value.rufnummerVerifiziert, null)
  assert.deepEqual(felder({ ...gueltig, einwilligung_version: 'x'.repeat(101) }), ['einwilligung_version'])
  assert.deepEqual(felder({ ...gueltig, kanal: 'x'.repeat(101) }), ['kanal'])
  assert.deepEqual(felder({ ...gueltig, begunstigter: 'x'.repeat(201) }), ['begunstigter'])
  assert.deepEqual(felder({ ...gueltig, user_agent: 'x'.repeat(501) }), ['user_agent'])
  assert.deepEqual(felder({ ...gueltig, rufnummer_verifiziert: 'ja' }), ['rufnummer_verifiziert'])
  assert.deepEqual(felder({ ...gueltig, kanal: 5 }), ['kanal'])
})
