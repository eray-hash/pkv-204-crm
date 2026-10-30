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
  assert.match(pruefeNeuesPasswort('kurz', 'kurz') ?? '', /mindestens 8/)
  assert.match(pruefeNeuesPasswort('langgenug1', 'anders123') ?? '', /stimmen nicht überein/)
  assert.equal(pruefeNeuesPasswort('langgenug1', 'langgenug1'), null)
})

test('Passwort aendern: Fehlermeldungen sind deutsch und passen zum Passwortwechsel', () => {
  assert.match(mapAuthError({ code: 'weak_password' }), /zu schwach/)
  assert.match(mapAuthError({ code: 'same_password' }), /unterscheiden/)
  assert.match(mapAuthError({ code: 'reauthentication_needed' }), /erneut anmelden/)
  assert.match(mapAuthError({ code: 'session_not_found' }), /erneut anmelden/)
  assert.match(mapAuthError({ message: 'Failed to fetch' }), /Keine Verbindung/)
})
