import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalisiereEingang, normalisiereTelefon, normalisiereZeit, normalisiereBetrag } from './normalisiere.ts'
import { validateLead } from './validate.ts'

const jetzt = new Date('2026-11-05T12:00:00+01:00')
const standard = {
  einwilligung_text: 'Indem du auf Senden klickst, stimmst du zu, dass deine Informationen uebermittelt werden duerfen.',
  einwilligung_quelle: 'Meta (Facebook Lead Ad)',
  kanal: 'Facebook Lead Ad',
  rufnummer_verifiziert: true,
  gesellschaft: 'unbekannt',
  einwilligung_zeit_ist_eingang: true,
}

test('Facebook-Format (field_data) wird mit Standardwerten angenommen', async () => {
  const body = {
    id: 'l:123456789',
    created_time: '2026-11-05T11:30:00+0100',
    field_data: [
      { name: 'full_name', values: ['Max Mustermann'] },
      { name: 'phone_number', values: ['p:+4915112345678'] },
      { name: 'email', values: ['max@example.de'] },
    ],
  }
  const r = validateLead(await normalisiereEingang(body, standard, jetzt), jetzt)
  assert.equal(r.ok, true, JSON.stringify(r))
  if (r.ok) {
    assert.equal(r.value.externeId, 'l:123456789')
    assert.equal(r.value.telefon, '+4915112345678')
    assert.equal(r.value.gesellschaft, 'unbekannt')
    assert.equal(r.value.tarifbeitrag, null)
    assert.equal(r.value.einwilligungZeit, r.value.eingangZeit)
    assert.equal(r.value.rufnummerVerifiziert, true)
  }
})

test('Flaches Format mit anderen Feldnamen, Vor- und Nachname getrennt, ohne Lead-Nummer', async () => {
  const body = { first_name: 'Anna', last_name: 'Beispiel', phone: '0151 2345 6789', email_address: 'anna@example.de', created_time: 1793867400 }
  const norm = (await normalisiereEingang(body, standard, jetzt)) as Record<string, unknown>
  assert.equal(norm.name, 'Anna Beispiel')
  assert.match(String(norm.lead_id), /^auto-[0-9a-f]{16}$/)
  const norm2 = (await normalisiereEingang(body, standard, jetzt)) as Record<string, unknown>
  assert.equal(norm.lead_id, norm2.lead_id) // gleicher Lead, gleiche Nummer (Idempotenz)
  assert.equal(validateLead(norm, jetzt).ok, true)
})

test('Ohne Standardwerte fehlt weiter der Einwilligungsnachweis (Standardlieferanten bleiben streng)', async () => {
  const body = { lead_id: 'x1', name: 'Max Mustermann', telefon: '+4915112345678', email: 'max@example.de' }
  const r = validateLead(await normalisiereEingang(body, null, jetzt), jetzt)
  assert.equal(r.ok, false)
  if (!r.ok) {
    const f = r.fehler.map((e) => e.feld)
    assert.ok(f.includes('einwilligung_text') && f.includes('einwilligung_quelle') && f.includes('einwilligung_zeit') && f.includes('gesellschaft'))
  }
})

test('Falsche Werte werden nicht schoengerechnet: auslaendische und Premiumnummern bleiben abgelehnt', async () => {
  for (const tel of ['+436641234567', '0900 1234567']) {
    const r = validateLead(await normalisiereEingang({ id: 'a', name: 'Max Mustermann', phone_number: tel, email: 'max@example.de' }, standard, jetzt), jetzt)
    assert.equal(r.ok, false, tel)
  }
})

test('Hilfsfunktionen', () => {
  assert.equal(normalisiereTelefon('p:+49 151 1234567'), '+49 151 1234567')
  assert.equal(normalisiereTelefon('4915112345678'), '+4915112345678')
  assert.equal(normalisiereZeit('2026-11-05T10:15:30+0100'), '2026-11-05T10:15:30+01:00')
  assert.equal(normalisiereZeit('2026-11-05 10:15:30'), '2026-11-05T09:15:30.000Z') // deutsche Ortszeit (Winter: UTC+1)
  assert.equal(normalisiereZeit('2026-07-05 10:15:30'), '2026-07-05T08:15:30.000Z') // Sommerzeit: UTC+2
  assert.equal(normalisiereBetrag('512,40 €'), '512.40')
  assert.equal(normalisiereBetrag('1.512,40'), '1512.40')
})

test('Nicht-Objekte bleiben unveraendert und werden abgelehnt', async () => {
  assert.deepEqual(await normalisiereEingang([1, 2], standard, jetzt), [1, 2])
  assert.equal(validateLead(await normalisiereEingang('text', standard, jetzt), jetzt).ok, false)
})

test('Lead-Boersen-Format (Tim): verschachtelt, Telefon privat, Boersenstart in Ortszeit, Sonderfelder', async () => {
  const body = {
    leadId: '4778250',
    partnerId: '42121',
    leadDetails: {
      'Lead ID': '4778250',
      Versicherungsart: 'KVV-Opt',
      'Name / Nachname': 'Beispiel',
      Vorname: 'Max',
      'Telefon privat': '491721242134',
      'Telefon mobil': '',
      Email: 'muster@web.de',
      'Börsenstart': '2026-11-05 14:36:00',
      Buchungsdatum: '2026-11-05 14:36:00',
      'Sonderfeld 11': 'AXA',
      'Sonderfeld 20': '780',
    },
  }
  const jetztNachSendung = new Date('2026-11-05T13:37:00Z')
  const r = validateLead(await normalisiereEingang(body, standard, jetztNachSendung), jetztNachSendung)
  assert.equal(r.ok, true, JSON.stringify(r))
  if (r.ok) {
    assert.equal(r.value.externeId, '4778250')
    assert.equal(r.value.name, 'Max Beispiel')
    assert.equal(r.value.telefon, '+491721242134')
    assert.equal(r.value.gesellschaft, 'AXA')
    assert.equal(r.value.tarifbeitrag, 780)
    assert.equal(r.value.eingangZeit, '2026-11-05T13:36:00.000Z')
    assert.equal(r.value.einwilligungZeit, r.value.eingangZeit)
  }
})
