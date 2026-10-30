// Ausfuehren mit: npm test   (Node-Testrunner, keine zusaetzliche Abhaengigkeit)
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ageInDays,
  ALL_STATUS,
  beitragSumme,
  countByStatus,
  dialerPatch,
  filterKategorie,
  imBereich,
  kategorie,
  leadZugriff,
  filterZuweisung,
  queueFuerNutzer,
  verteilungsFehler,
  mapLeadRow,
  mapLeadRows,
  PIPELINE_STATUS,
  sortNewestFirst,
  statusLabel,
  statusTone,
  telHref,
  type DbLead,
} from './leads.ts'
import { mapAuthError } from './authErrors.ts'

const NOW = new Date('2026-10-23T12:00:00.000Z')

function lead(partial: Partial<DbLead> = {}): DbLead {
  return {
    id: 'l-1',
    name: 'Max Muster',
    telefon: '+491701234567',
    email: 'max@example.de',
    gesellschaft: 'Allianz',
    tarifbeitrag: 450,
    quelle: null,
    eingang_zeit: '2026-10-22T10:00:00.000Z',
    status: 'neu',
    ist_live: true,
    ist_test: false,
    moegliches_duplikat_von: null,
    zugewiesen_an: null,
    zugewiesen_von: null,
    uebernommen_am: null,
    naechster_anruf_ab: null,
    created_at: '2026-10-22T10:00:00.000Z',
    updated_at: '2026-10-22T10:00:00.000Z',
    ...partial,
  }
}

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 86_400_000).toISOString()
}

test('Status-Beschriftungen decken alle DB-Status ab, "Antrag" gibt es nicht', () => {
  assert.equal(ALL_STATUS.length, 11)
  for (const s of ALL_STATUS) assert.notEqual(statusLabel(s), s)
  assert.equal(statusLabel('nicht_mehr_pkv'), 'Nicht mehr PKV')
  assert.equal(statusLabel('unbekannt'), 'unbekannt')
  assert.ok(!(ALL_STATUS as string[]).includes('antrag'))
  assert.ok(!PIPELINE_STATUS.map(statusLabel).includes('Antrag'))
})

test('Status-Farben', () => {
  assert.equal(statusTone('gewonnen'), 'green')
  assert.equal(statusTone('kein_interesse'), 'red')
  assert.equal(statusTone('neu'), 'ink')
})

test('Kategorie: gewonnen ist Kunde', () => {
  assert.equal(kategorie(lead({ status: 'gewonnen', eingang_zeit: daysAgo(400) }), NOW), 'kunde')
})

test('Kategorie: alle Abschluss-Status sind verloren, auch wenn der Lead alt ist', () => {
  for (const status of ['verloren', 'verstorben', 'nicht_mehr_pkv', 'kein_interesse', 'schon_umgestellt'] as const) {
    assert.equal(kategorie(lead({ status, eingang_zeit: daysAgo(3) }), NOW), 'verloren')
    assert.equal(kategorie(lead({ status, eingang_zeit: daysAgo(300) }), NOW), 'verloren')
  }
})

test('Kategorie: offene Leads sind erst nach mehr als 60 Tagen alt', () => {
  assert.equal(kategorie(lead({ status: 'neu', eingang_zeit: daysAgo(60) }), NOW), 'aktiv')
  assert.equal(kategorie(lead({ status: 'neu', eingang_zeit: daysAgo(61) }), NOW), 'alt')
  for (const status of ['neu', 'kontaktiert', 'nicht_erreicht', 'termin_vereinbart', 'beratung'] as const) {
    assert.equal(kategorie(lead({ status, eingang_zeit: daysAgo(90) }), NOW), 'alt')
    assert.equal(kategorie(lead({ status, eingang_zeit: daysAgo(5) }), NOW), 'aktiv')
  }
})

test('filterKategorie trennt die Listen ohne Ueberschneidung', () => {
  const leads = [
    lead({ id: 'a', status: 'neu', eingang_zeit: daysAgo(1) }),
    lead({ id: 'b', status: 'neu', eingang_zeit: daysAgo(100) }),
    lead({ id: 'c', status: 'gewonnen' }),
    lead({ id: 'd', status: 'verstorben' }),
  ]
  const ids = (k: Parameters<typeof filterKategorie>[1]) => filterKategorie(leads, k, NOW).map((l) => l.id)
  assert.deepEqual(ids('aktiv'), ['a'])
  assert.deepEqual(ids('alt'), ['b'])
  assert.deepEqual(ids('kunde'), ['c'])
  assert.deepEqual(ids('verloren'), ['d'])
})

test('ageInDays: ungueltiges Datum ergibt 0', () => {
  assert.equal(ageInDays('kein-datum', NOW), 0)
  assert.equal(ageInDays(daysAgo(7), NOW), 7)
})

test('mapLeadRow: normalisiert Datenbankzeilen', () => {
  const mapped = mapLeadRow({
    id: 'x',
    name: 'Erika Mustermann',
    telefon: '+4915112345678',
    email: 'e@example.de',
    gesellschaft: 'DKV',
    tarifbeitrag: '512.50',
    quelle: '',
    eingang_zeit: '2026-10-20T08:00:00+00:00',
    status: 'kontaktiert',
    moegliches_duplikat_von: 'y',
    naechster_anruf_ab: null,
  })
  assert.ok(mapped)
  assert.equal(mapped.tarifbeitrag, 512.5)
  assert.equal(mapped.quelle, null)
  assert.equal(mapped.moegliches_duplikat_von, 'y')
  assert.equal(mapped.ist_test, false)
  assert.equal(mapped.ist_live, true)
})

test('mapLeadRow: unbrauchbare Zeilen werden verworfen', () => {
  assert.equal(mapLeadRow(null), null)
  assert.equal(mapLeadRow({ id: 1, status: 'neu' }), null)
  assert.equal(mapLeadRow({ id: 'x', status: 'antrag' }), null)
  assert.equal(mapLeadRow({ id: 'x', status: 'neu', tarifbeitrag: 'abc' })?.tarifbeitrag, 0)
})

test('mapLeadRows: Testleads werden nie angezeigt', () => {
  const rows = [
    { id: 'a', status: 'neu', ist_test: false },
    { id: 'b', status: 'neu', ist_test: true },
    { id: 'c', status: 'ungueltig' },
  ]
  assert.deepEqual(mapLeadRows(rows).map((l) => l.id), ['a'])
  assert.deepEqual(mapLeadRows('kein array'), [])
})

test('sortNewestFirst und countByStatus', () => {
  const leads = [
    lead({ id: 'alt', eingang_zeit: daysAgo(10) }),
    lead({ id: 'neu', eingang_zeit: daysAgo(1) }),
    lead({ id: 'mitte', eingang_zeit: daysAgo(5), status: 'beratung' }),
  ]
  assert.deepEqual(sortNewestFirst(leads).map((l) => l.id), ['neu', 'mitte', 'alt'])
  const counts = countByStatus(leads)
  assert.equal(counts.neu, 2)
  assert.equal(counts.beratung, 1)
  assert.equal(counts.gewonnen, 0)
})

test('Dialer: "Nicht erreicht" setzt Status und naechsten Anruf in 2 Stunden', () => {
  const patch = dialerPatch('nicht_erreicht', NOW)
  assert.equal(patch.status, 'nicht_erreicht')
  assert.equal(patch.naechster_anruf_ab, '2026-10-23T14:00:00.000Z')
})

test('Dialer: "Spaeter" aendert nur den naechsten Anruf', () => {
  const patch = dialerPatch('spaeter', NOW, '2026-10-24T09:30:00.000Z')
  assert.deepEqual(patch, { naechster_anruf_ab: '2026-10-24T09:30:00.000Z' })
  assert.throws(() => dialerPatch('spaeter', NOW), /Zeitpunkt/)
  assert.throws(() => dialerPatch('spaeter', NOW, 'quatsch'), /Zeitpunkt/)
})

test('Dialer: Termin und Abschluss-Ergebnisse setzen den passenden Status', () => {
  assert.deepEqual(dialerPatch('termin_vereinbart', NOW), { status: 'termin_vereinbart' })
  for (const e of ['kein_interesse', 'verstorben', 'nicht_mehr_pkv', 'schon_umgestellt'] as const) {
    assert.deepEqual(dialerPatch(e, NOW), { status: e })
  }
})

test('Abgeschlossene Leads sind nicht anrufbar (Status liegt ausserhalb der Dialer-Status)', () => {
  const anrufbar = ['neu', 'kontaktiert', 'nicht_erreicht']
  for (const e of ['kein_interesse', 'verstorben', 'nicht_mehr_pkv', 'schon_umgestellt'] as const) {
    assert.ok(!anrufbar.includes(dialerPatch(e, NOW).status as string))
  }
})

test('telHref entfernt Leerzeichen und Sonderzeichen', () => {
  assert.equal(telHref('+49 170 1234567'), 'tel:+491701234567')
  assert.equal(telHref(' +49 (0) 30-123 '), 'tel:+49030123')
})

test('imBereich und beitragSumme', () => {
  const bereich = { start: new Date('2026-10-01T00:00:00Z'), end: new Date('2026-10-31T23:59:59Z') }
  assert.equal(imBereich('2026-10-15T10:00:00Z', bereich), true)
  assert.equal(imBereich('2026-09-30T10:00:00Z', bereich), false)
  assert.equal(imBereich('2026-09-30T10:00:00Z', null), true)
  assert.equal(imBereich('quatsch', bereich), false)
  assert.equal(beitragSumme([lead({ tarifbeitrag: 400 }), lead({ tarifbeitrag: 250.5 })]), 650.5)
})

test('Auth-Fehlermeldungen auf Deutsch', () => {
  assert.match(mapAuthError({ message: 'Invalid login credentials', status: 400 }), /falsch/)
  assert.match(mapAuthError({ code: 'invalid_credentials' }), /falsch/)
  assert.match(mapAuthError({ message: 'Email not confirmed' }), /bestätigt/)
  assert.match(mapAuthError({ status: 429, message: 'x' }), /Zu viele Versuche/)
  assert.match(mapAuthError({ message: 'Failed to fetch' }), /Keine Verbindung/)
  assert.match(mapAuthError(new Error('irgendwas')), /fehlgeschlagen/)
  assert.match(mapAuthError(null), /fehlgeschlagen/)
})

const ICH = 'u-ich'
const ANDERER = 'u-anderer'

test('leadZugriff: freier Lead - Mitarbeiter kann uebernehmen, muss aber vor dem Bearbeiten uebernehmen', () => {
  const z = leadZugriff(lead({ zugewiesen_an: null }), ICH, false)
  assert.equal(z.bearbeiter, 'frei')
  assert.equal(z.darfUebernehmen, true)
  assert.equal(z.darfFreigeben, false)
  assert.equal(z.darfZuweisen, false)
  assert.equal(z.darfBearbeiten, true)
  assert.equal(z.uebernahmeVorBearbeitung, true)
})

test('leadZugriff: freier Lead mit Status ausserhalb der Uebernahme-Status oder Testlead ist nicht uebernehmbar', () => {
  assert.equal(leadZugriff(lead({ status: 'beratung' }), ICH, false).darfUebernehmen, false)
  assert.equal(leadZugriff(lead({ status: 'gewonnen' }), ICH, false).darfUebernehmen, false)
  assert.equal(leadZugriff(lead({ ist_test: true }), ICH, false).darfUebernehmen, false)
  for (const status of ['neu', 'kontaktiert', 'nicht_erreicht'] as const) assert.equal(leadZugriff(lead({ status }), ICH, false).darfUebernehmen, true)
})

test('leadZugriff: eigener Lead kann freigegeben und bearbeitet werden', () => {
  const z = leadZugriff(lead({ zugewiesen_an: ICH }), ICH, false)
  assert.equal(z.bearbeiter, 'ich')
  assert.equal(z.darfFreigeben, true)
  assert.equal(z.darfBearbeiten, true)
  assert.equal(z.darfUebernehmen, false)
  assert.equal(z.uebernahmeVorBearbeitung, false)
})

test('leadZugriff: Lead eines anderen - Mitarbeiter gesperrt, Geschaeftsfuehrer darf alles', () => {
  const ma = leadZugriff(lead({ zugewiesen_an: ANDERER }), ICH, false)
  assert.equal(ma.bearbeiter, 'andere')
  assert.equal(ma.darfBearbeiten, false)
  assert.equal(ma.darfFreigeben, false)
  assert.equal(ma.darfUebernehmen, false)
  const gf = leadZugriff(lead({ zugewiesen_an: ANDERER }), ICH, true)
  assert.equal(gf.darfBearbeiten, true)
  assert.equal(gf.darfFreigeben, true)
  assert.equal(gf.darfZuweisen, true)
  assert.equal(leadZugriff(lead({ zugewiesen_an: null }), ICH, true).uebernahmeVorBearbeitung, false)
})

test('filterZuweisung: Frei / Meine / Alle', () => {
  const leads = [lead({ id: 'a', zugewiesen_an: null }), lead({ id: 'b', zugewiesen_an: ICH }), lead({ id: 'c', zugewiesen_an: ANDERER })]
  assert.deepEqual(filterZuweisung(leads, 'alle', ICH).map((l) => l.id), ['a', 'b', 'c'])
  assert.deepEqual(filterZuweisung(leads, 'frei', ICH).map((l) => l.id), ['a'])
  assert.deepEqual(filterZuweisung(leads, 'meine', ICH).map((l) => l.id), ['b'])
  assert.deepEqual(filterZuweisung(leads, 'meine', null).map((l) => l.id), [])
})

test('queueFuerNutzer: freie und eigene Leads, nie die anderer Personen', () => {
  const q = [lead({ id: 'a', zugewiesen_an: null }), lead({ id: 'b', zugewiesen_an: ICH }), lead({ id: 'c', zugewiesen_an: ANDERER })]
  assert.deepEqual(queueFuerNutzer(q, ICH).map((l) => l.id), ['a', 'b'])
  assert.deepEqual(queueFuerNutzer(q, null).map((l) => l.id), ['a'])
})

test('mapLeadRow: Zuweisungsfelder, fehlende Spalten (vor der Migration) werden zu null', () => {
  const neu = mapLeadRow({ id: 'x', status: 'neu', zugewiesen_an: 'u1', zugewiesen_von: 'u2', uebernommen_am: '2026-10-30T10:00:00Z' })
  assert.equal(neu?.zugewiesen_von, 'u2')
  assert.equal(neu?.uebernommen_am, '2026-10-30T10:00:00Z')
  const alt = mapLeadRow({ id: 'x', status: 'neu' })
  assert.equal(alt?.zugewiesen_an, null)
  assert.equal(alt?.zugewiesen_von, null)
  assert.equal(alt?.uebernommen_am, null)
})

test('verteilungsFehler: deutsche Meldungen', () => {
  assert.match(verteilungsFehler({ code: 'PGRST202', message: 'x' }), /noch nicht eingerichtet/)
  assert.match(verteilungsFehler({ code: '42501', message: 'Nur der Geschaeftsfuehrer darf Leads zuweisen.' }), /Geschäftsführer/)
  assert.match(verteilungsFehler({ code: 'XX', message: 'boom' }), /nicht ausgeführt/)
  assert.match(verteilungsFehler(null), /nicht ausgeführt/)
})
