import test from 'node:test'
import assert from 'node:assert/strict'
import { LINK_ABGELAUFEN, LINK_FEHLERHAFT, normalisiereHash, parseAuthLink, verlangtNeuesPasswort } from './authLink.ts'
import { pruefeNeuesPasswort } from './passwort.ts'
import { mapAuthError } from './authErrors.ts'

test('Hash: Einladungslink (type=invite) wird erkannt und verlangt ein neues Passwort', () => {
  const l = parseAuthLink('#access_token=abc&expires_in=3600&refresh_token=r&token_type=bearer&type=invite')
  assert.deepEqual(l, { art: 'invite', fehler: null })
  assert.equal(verlangtNeuesPasswort(l), true)
})

test('Hash: Recovery-Link (type=recovery) wird erkannt und verlangt ein neues Passwort', () => {
  const l = parseAuthLink('#access_token=abc&refresh_token=r&type=recovery')
  assert.deepEqual(l, { art: 'recovery', fehler: null })
  assert.equal(verlangtNeuesPasswort(l), true)
})

test('Hash: abgelaufener Link (otp_expired) liefert die deutsche Meldung und verlangt kein Passwort', () => {
  const l = parseAuthLink('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired&type=invite')
  assert.equal(l?.fehler, LINK_ABGELAUFEN)
  assert.match(LINK_ABGELAUFEN, /abgelaufen.*Passwort vergessen/)
  assert.equal(verlangtNeuesPasswort(l), false)
  assert.equal(parseAuthLink('#error_code=otp_expired')?.fehler, LINK_ABGELAUFEN)
})

test('Hash: unbekannter Fehler liefert eine allgemeine deutsche Meldung', () => {
  assert.equal(parseAuthLink('#error=server_error&error_description=boom')?.fehler, LINK_FEHLERHAFT)
})

test('Hash: kein Hash, normale Routen und fremde Parameter sind kein Link', () => {
  assert.equal(parseAuthLink(''), null)
  assert.equal(parseAuthLink('#'), null)
  assert.equal(parseAuthLink('#/leads'), null)
  assert.equal(parseAuthLink('#/leads/123', '?foo=bar'), null)
  assert.equal(verlangtNeuesPasswort(null), false)
})

test('Hash: Token mit fuehrendem Slash (HashRouter-Form) wird normalisiert und erkannt', () => {
  assert.equal(normalisiereHash('#/access_token=abc&type=invite'), '#access_token=abc&type=invite')
  assert.equal(normalisiereHash('#/leads'), '#/leads')
  assert.equal(parseAuthLink('#/access_token=abc&type=invite')?.art, 'invite')
})

test('Hash: Token ohne Art gilt als sonstiger Link und verlangt kein neues Passwort', () => {
  const l = parseAuthLink('#access_token=abc&type=magiclink')
  assert.equal(l?.art, 'sonstige')
  assert.equal(verlangtNeuesPasswort(l), false)
  assert.equal(verlangtNeuesPasswort(parseAuthLink('#access_token=abc')), false)
})

test('Passwort: Mindestlaenge 8 und Wiederholung muessen stimmen', () => {
  assert.match(pruefeNeuesPasswort('kurz', 'kurz') ?? '', /mindestens 12/)
  assert.match(pruefeNeuesPasswort('elfzeichen1', 'elfzeichen1') ?? '', /mindestens 12/)
  assert.match(pruefeNeuesPasswort('langgenug123', 'anders123456') ?? '', /stimmen nicht überein/)
  assert.equal(pruefeNeuesPasswort('langgenug123', 'langgenug123'), null)
})

test('Passwort aendern: Fehlermeldungen sind deutsch und passen zum Passwortwechsel', () => {
  assert.match(mapAuthError({ code: 'weak_password' }), /zu schwach/)
  assert.doesNotMatch(mapAuthError({ code: 'weak_password' }), /8 Zeichen/)
  assert.match(mapAuthError({ code: 'same_password' }), /unterscheiden/)
  assert.match(mapAuthError({ code: 'reauthentication_needed' }), /erneut anmelden/)
  assert.match(mapAuthError({ code: 'session_not_found' }), /erneut anmelden/)
  assert.match(mapAuthError({ message: 'Failed to fetch' }), /Keine Verbindung/)
})

import { passwortFehlerText, pruefeVorlaeufigesPasswort } from './passwort.ts'

test('Vorlaeufiges Passwort: mindestens 12 Zeichen, hoechstens 72 Byte, Wiederholung muss stimmen', () => {
  assert.match(pruefeVorlaeufigesPasswort('kurzkurz123', 'kurzkurz123') ?? '', /mindestens 12/)
  assert.match(pruefeVorlaeufigesPasswort('a'.repeat(73), 'a'.repeat(73)) ?? '', /zu lang/)
  assert.match(pruefeVorlaeufigesPasswort('ä'.repeat(37), 'ä'.repeat(37)) ?? '', /zu lang/)
  assert.match(pruefeVorlaeufigesPasswort('zwoelfzeichen', 'andereswort13') ?? '', /stimmen nicht überein/)
  assert.equal(pruefeVorlaeufigesPasswort('a'.repeat(12), 'a'.repeat(12)), null)
  assert.equal(pruefeVorlaeufigesPasswort('a'.repeat(72), 'a'.repeat(72)), null)
})

test('Vorlaeufiges Passwort: Fehlertexte der Funktion werden uebernommen, sonst deutsche Standardtexte', () => {
  assert.equal(passwortFehlerText(403, { ok: false, fehler: 'Nur der Geschäftsführer darf Passwörter festlegen.' }), 'Nur der Geschäftsführer darf Passwörter festlegen.')
  assert.match(passwortFehlerText(404, null), /noch nicht eingerichtet/)
  assert.match(passwortFehlerText(null, null), /Keine Verbindung/)
  assert.match(passwortFehlerText(500, {}), /später erneut/)
})
