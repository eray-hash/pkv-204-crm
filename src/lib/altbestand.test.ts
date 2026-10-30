import test from 'node:test'
import assert from 'node:assert/strict'
import { ALTE_SPEICHER_SCHLUESSEL, raeumeAltbestandAuf } from './altbestand.ts'

function fakeSpeicher(start: Record<string, string>) {
  const daten = new Map(Object.entries(start))
  return { daten, removeItem: (k: string) => void daten.delete(k) }
}

test('Altbestand: entfernt die Beispieldaten, laesst die Supabase-Sitzung und Fremdes unberuehrt', () => {
  const s = fakeSpeicher({
    'pkv-204-crm-beispieldaten-v3': '{"beispielLeads":[]}',
    'pkv-204-crm-data-v1': '{}',
    'pkv-204-crm-data-v2': '{}',
    'sb-abc123-auth-token': '{"access_token":"x"}',
    anderes: '1',
  })
  raeumeAltbestandAuf(s)
  assert.deepEqual([...s.daten.keys()].sort(), ['anderes', 'sb-abc123-auth-token'])
})

test('Altbestand: mehrfaches Ausfuehren und fehlender oder gesperrter Speicher sind unkritisch', () => {
  const s = fakeSpeicher({})
  assert.doesNotThrow(() => raeumeAltbestandAuf(s))
  assert.doesNotThrow(() => raeumeAltbestandAuf(s))
  assert.equal(raeumeAltbestandAuf(null), 0)
  assert.equal(raeumeAltbestandAuf(undefined), 0)
  const gesperrt = {
    removeItem() {
      throw new Error('SecurityError')
    },
  }
  assert.doesNotThrow(() => raeumeAltbestandAuf(gesperrt))
})

test('Altbestand: es werden keine Supabase-Schluessel in der Liste gefuehrt', () => {
  for (const k of ALTE_SPEICHER_SCHLUESSEL) assert.ok(!k.startsWith('sb-'))
})
