import test from 'node:test'
import assert from 'node:assert/strict'
import { bereiteTelAnrufVor, type TelAnrufDeps } from './telAnruf.ts'
import type { DbLead } from './leads.ts'

function aufbau(over: Partial<TelAnrufDeps> = {}) {
  const ereignisse: string[] = []
  const deps: TelAnrufDeps = {
    meId: 'me',
    uebernehmen: async () => (ereignisse.push('uebernehmen'), { ok: true, fehler: null }),
    refreshLead: async () => (ereignisse.push('refresh'), null),
    logAnruf: async () => (ereignisse.push('log'), null),
    ...over,
  }
  return { deps, ereignisse }
}

test('tel-Anruf: eigener Lead wird nur protokolliert, dann darf gewaehlt werden', async () => {
  const { deps, ereignisse } = aufbau()
  assert.deepEqual(await bereiteTelAnrufVor({ id: 'l', zugewiesen_an: 'me' }, 'festnetz', deps), { ok: true, uebernommen: false })
  assert.deepEqual(ereignisse, ['log'])
})

test('tel-Anruf: freier Lead wird zuerst uebernommen, dann protokolliert', async () => {
  const { deps, ereignisse } = aufbau()
  assert.deepEqual(await bereiteTelAnrufVor({ id: 'l', zugewiesen_an: null }, 'mobil', deps), { ok: true, uebernommen: true })
  assert.deepEqual(ereignisse, ['uebernehmen', 'log'])
})

test('tel-Anruf: Lead eines anderen, gescheiterte Uebernahme oder abgelehntes Protokoll -> NICHT waehlen', async () => {
  let a = aufbau()
  let r = await bereiteTelAnrufVor({ id: 'l', zugewiesen_an: 'andere' }, 'festnetz', a.deps)
  assert.equal(r.ok, false)
  assert.deepEqual(a.ereignisse, [])

  a = aufbau({ uebernehmen: async () => ({ ok: false, fehler: 'Obergrenze erreicht' }) })
  r = await bereiteTelAnrufVor({ id: 'l', zugewiesen_an: null }, 'festnetz', a.deps)
  assert.deepEqual(r, { ok: false, meldung: 'Obergrenze erreicht' })
  assert.ok(!a.ereignisse.includes('log'))

  a = aufbau({ uebernehmen: async () => ({ ok: false, fehler: null }), refreshLead: async () => ({ zugewiesen_an: 'andere' } as DbLead) })
  r = await bereiteTelAnrufVor({ id: 'l', zugewiesen_an: null }, 'festnetz', a.deps)
  assert.equal(r.ok, false)
  assert.ok(r.ok === false && /jemand anderem/.test(r.meldung))

  // N5: noch frei, aber nicht uebernehmbar -> andere Meldung als "vergeben"
  a = aufbau({ uebernehmen: async () => ({ ok: false, fehler: null }), refreshLead: async () => ({ zugewiesen_an: null } as DbLead) })
  r = await bereiteTelAnrufVor({ id: 'l', zugewiesen_an: null }, 'festnetz', a.deps)
  assert.ok(r.ok === false && /nicht übernommen werden/.test(r.meldung) && !/jemand anderem/.test(r.meldung))
  // nicht mehr sichtbar (null) gilt als vergeben
  a = aufbau({ uebernehmen: async () => ({ ok: false, fehler: null }), refreshLead: async () => null })
  r = await bereiteTelAnrufVor({ id: 'l', zugewiesen_an: null }, 'festnetz', a.deps)
  assert.ok(r.ok === false && /jemand anderem/.test(r.meldung))

  a = aufbau({ logAnruf: async () => 'Dieser Lead wurde gerade erst angerufen.' })
  r = await bereiteTelAnrufVor({ id: 'l', zugewiesen_an: 'me' }, 'festnetz', a.deps)
  assert.deepEqual(r, { ok: false, meldung: 'Dieser Lead wurde gerade erst angerufen.' })
})

test('tel-Anruf: ok=false der Uebernahme, aber der Lead gehoert inzwischen mir -> weiter', async () => {
  const a = aufbau({ uebernehmen: async () => ({ ok: false, fehler: null }), refreshLead: async () => ({ zugewiesen_an: 'me' } as DbLead) })
  assert.deepEqual(await bereiteTelAnrufVor({ id: 'l', zugewiesen_an: null }, 'festnetz', a.deps), { ok: true, uebernommen: false })
})

test('tel-Anruf: ohne Anmeldung wird nichts getan', async () => {
  const a = aufbau({ meId: null })
  assert.equal((await bereiteTelAnrufVor({ id: 'l', zugewiesen_an: null }, 'festnetz', a.deps)).ok, false)
  assert.deepEqual(a.ereignisse, [])
})
