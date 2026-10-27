import test from 'node:test'
import assert from 'node:assert/strict'
import { fehlerAusAntwort, geraetTypLabel, parseGeraete, parseStatus, sollAufTelFallen } from './telefonie.ts'

test('parseStatus: verbunden, nicht verbunden und ungueltige Antworten', () => {
  assert.deepEqual(parseStatus({ ok: true, verbunden: false, tokenGespeichert: false }), {
    verbunden: false,
    tokenGespeichert: false,
    geraetId: null,
    geraetName: null,
    rufnummerCaller: null,
    rufnummerAnzeige: null,
    tokenGueltig: null,
    hinweis: null,
  })
  const s = parseStatus({ ok: true, verbunden: true, tokenGespeichert: true, geraetId: 'm0', geraetName: 'Satellite', tokenGueltig: true, token: 'GEHEIM' })
  assert.equal(s?.verbunden, true)
  assert.equal(s?.geraetName, 'Satellite')
  assert.equal(s?.tokenGueltig, true)
  assert.ok(!JSON.stringify(s).includes('GEHEIM'), 'unbekannte Felder werden nie uebernommen')
  assert.equal(parseStatus({ ok: false }), null)
  assert.equal(parseStatus(null), null)
})

test('parseGeraete: nur gueltige Eintraege, Name faellt auf die ID zurueck', () => {
  assert.deepEqual(parseGeraete({ geraete: [{ id: 'm0', name: 'Satellite', typ: 'mobile', online: true }, { id: 'e1' }, { name: 'ohne id' }, null] }), [
    { id: 'm0', name: 'Satellite', typ: 'mobile', online: true },
    { id: 'e1', name: 'e1', typ: 'unbekannt', online: false },
  ])
  assert.deepEqual(parseGeraete({}), [])
  assert.deepEqual(parseGeraete(undefined), [])
})

test('Geraetetyp-Beschriftung', () => {
  assert.match(geraetTypLabel('mobile'), /Mobil/)
  assert.match(geraetTypLabel('external'), /Extern/)
  assert.equal(geraetTypLabel('xyz'), 'Gerät')
})

test('fehlerAusAntwort: feste Meldung der Funktion, sonst verstaendliche Ersatztexte', () => {
  assert.deepEqual(fehlerAusAntwort(422, { ok: false, code: 'token_ungueltig', fehler: 'Das sipgate-Token ist ungültig.' }), {
    meldung: 'Das sipgate-Token ist ungültig.',
    code: 'token_ungueltig',
  })
  assert.equal(fehlerAusAntwort(404, { code: 'NOT_FOUND', message: 'Requested function was not found' }).code, 'dienst_fehlt')
  assert.match(fehlerAusAntwort(404, null).meldung, /nicht eingerichtet/)
  assert.equal(fehlerAusAntwort(401, {}).code, 'nicht_angemeldet')
  assert.equal(fehlerAusAntwort(null, undefined).code, 'netzwerk')
  assert.match(fehlerAusAntwort(500, 'html').meldung, /nicht verfügbar/)
})

test('Dialer-Fallback auf tel: bei fehlender Verbindung oder nicht erreichbarem Dienst, nicht bei echten Fehlern', () => {
  assert.equal(sollAufTelFallen('nicht_verbunden'), true)
  assert.equal(sollAufTelFallen('dienst_fehlt'), true)
  assert.equal(sollAufTelFallen('netzwerk'), true)
  assert.equal(sollAufTelFallen('lead_gesperrt'), false)
  assert.equal(sollAufTelFallen('token_ungueltig'), false)
  assert.equal(sollAufTelFallen(null), false)
})
