import test from 'node:test'
import assert from 'node:assert/strict'
import { summeTeam, teamZeilen } from './team.ts'
import { wiedervorlagenFuer, type DbLead } from './leads.ts'

function lead(p: Partial<DbLead>): DbLead {
  return {
    id: 'l' + Math.random(), name: 'X', telefon: '+49', email: 'a@b.invalid', gesellschaft: '', tarifbeitrag: 0, quelle: null,
    eingang_zeit: '2026-10-01T10:00:00Z', status: 'neu', ist_live: true, ist_test: false, moegliches_duplikat_von: null,
    zugewiesen_an: null, zugewiesen_von: null, uebernommen_am: null, naechster_anruf_ab: null,
    gesperrt_am: null, sperrgrund: null, status_geaendert_am: null,
    created_at: '2026-10-01T10:00:00Z', updated_at: '2026-10-01T10:00:00Z', ...p,
  }
}

test('Team: zaehlt zugewiesene, Termin- und gewonnene Leads je Nutzer, Testleads zaehlen nicht', () => {
  const leads = [
    lead({ zugewiesen_an: 'a', status: 'termin_vereinbart' }),
    lead({ zugewiesen_an: 'a', status: 'gewonnen' }),
    lead({ zugewiesen_an: 'a', status: 'neu', ist_test: true }),
    lead({ zugewiesen_an: 'b', status: 'kontaktiert' }),
    lead({ zugewiesen_an: null }),
  ]
  const z = teamZeilen(['a', 'b', 'c'], leads, { a: 7, b: 1 })
  assert.deepEqual(z.map((r) => [r.zugewiesen, r.terminVereinbart, r.gewonnen, r.anrufe]), [[2, 1, 1, 7], [1, 0, 0, 1], [0, 0, 0, 0]])
  assert.deepEqual(summeTeam(z), { anrufe: 8, zugewiesen: 3, terminVereinbart: 1, gewonnen: 1 })
})

test('Team: ohne ladbare Anrufzahlen bleibt die Zahl leer (null) statt 0', () => {
  const z = teamZeilen(['a'], [], null)
  assert.equal(z[0].anrufe, null)
  assert.equal(summeTeam(z).anrufe, null)
  assert.equal(summeTeam([]).anrufe, null)
  assert.deepEqual(teamZeilen([], [], {}), [])
})

test('Wiedervorlagen: nur eigene, offene Leads mit Termin, aelteste zuerst, ueberfaellig markiert', () => {
  const now = new Date('2026-10-30T12:00:00Z')
  const leads = [
    lead({ id: 'spaet', zugewiesen_an: 'me', naechster_anruf_ab: '2026-10-31T09:00:00Z' }),
    lead({ id: 'alt', zugewiesen_an: 'me', status: 'nicht_erreicht', naechster_anruf_ab: '2026-10-29T09:00:00Z' }),
    lead({ id: 'fremd', zugewiesen_an: 'other', naechster_anruf_ab: '2026-10-29T09:00:00Z' }),
    lead({ id: 'frei', zugewiesen_an: null, naechster_anruf_ab: '2026-10-29T09:00:00Z' }),
    lead({ id: 'zu', zugewiesen_an: 'me', status: 'gewonnen', naechster_anruf_ab: '2026-10-29T09:00:00Z' }),
    lead({ id: 'ohne', zugewiesen_an: 'me' }),
    lead({ id: 'test', zugewiesen_an: 'me', ist_test: true, naechster_anruf_ab: '2026-10-29T09:00:00Z' }),
  ]
  const w = wiedervorlagenFuer(leads, 'me', now)
  assert.deepEqual(w.map((x) => [x.lead.id, x.ueberfaellig]), [['alt', true], ['spaet', false]])
  assert.deepEqual(wiedervorlagenFuer(leads, null, now), [])
})

test('Team: Termin/Gewonnen im Zeitraum zaehlen nach dem Statuszeitpunkt (nicht nach updated_at)', () => {
  const leads = [
    lead({ zugewiesen_an: 'a', status: 'gewonnen', status_geaendert_am: '2026-10-20T10:00:00Z', updated_at: '2026-11-01T10:00:00Z' }),
    lead({ zugewiesen_an: 'a', status: 'gewonnen', status_geaendert_am: null, updated_at: '2026-10-21T10:00:00Z' }),
    lead({ zugewiesen_an: 'a', status: 'termin_vereinbart', status_geaendert_am: '2026-11-02T10:00:00Z' }),
  ]
  const bereich = { start: new Date('2026-10-15T00:00:00Z'), end: new Date('2026-10-31T23:59:59Z') }
  const [z] = teamZeilen(['a'], leads, { a: 0 }, bereich)
  assert.deepEqual([z.zugewiesen, z.gewonnen, z.terminVereinbart], [3, 2, 0])
  const [alle] = teamZeilen(['a'], leads, { a: 0 })
  assert.deepEqual([alle.gewonnen, alle.terminVereinbart], [2, 1])
})
