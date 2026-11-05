// Reine Logik fuer die echten Leads aus der Datenbank (ohne React/Supabase-Abhaengigkeiten, damit per
// `node --test` pruefbar).

export type DbLeadStatus =
  | 'neu'
  | 'kontaktiert'
  | 'nicht_erreicht'
  | 'termin_vereinbart'
  | 'beratung'
  | 'gewonnen'
  | 'verloren'
  | 'verstorben'
  | 'nicht_mehr_pkv'
  | 'kein_interesse'
  | 'schon_umgestellt'

export const STATUS_LABEL: Record<DbLeadStatus, string> = {
  neu: 'Neu',
  kontaktiert: 'Kontaktiert',
  nicht_erreicht: 'Nicht erreicht',
  termin_vereinbart: 'Termin vereinbart',
  beratung: 'Beratung',
  gewonnen: 'Gewonnen',
  verloren: 'Verloren',
  verstorben: 'Verstorben',
  nicht_mehr_pkv: 'Nicht mehr PKV',
  kein_interesse: 'Kein Interesse',
  schon_umgestellt: 'Schon umgestellt',
}

export const ALL_STATUS = Object.keys(STATUS_LABEL) as DbLeadStatus[]

/** Offene Status: der Lead ist noch in Bearbeitung. */
export const OPEN_STATUS: DbLeadStatus[] = ['neu', 'kontaktiert', 'nicht_erreicht', 'termin_vereinbart', 'beratung']

/** Status, die in "Verlorene Leads" erscheinen. */
export const LOST_STATUS: DbLeadStatus[] = ['verloren', 'verstorben', 'nicht_mehr_pkv', 'kein_interesse', 'schon_umgestellt']

/** Status, mit denen ein Lead endgueltig abgeschlossen wird (er wird nie wieder angerufen). */
export const CLOSING_STATUS: DbLeadStatus[] = ['kein_interesse', 'verstorben', 'nicht_mehr_pkv', 'schon_umgestellt', 'verloren']

/**
 * Status, aus denen ein Nicht-Geschaeftsfuehrer einen Lead nicht mehr herausholen darf (Statuswaechter, SQL: public.geschuetzte_status()):
 * die abschliessenden Status plus "gewonnen". Auf diese Status SETZEN darf jeder Bearbeiter (normaler Abschluss).
 */
export const GESCHUETZTE_STATUS: DbLeadStatus[] = ['verstorben', 'nicht_mehr_pkv', 'kein_interesse', 'schon_umgestellt', 'verloren', 'gewonnen']

/** Schritte der Bearbeitungs-Pipeline. */
export const PIPELINE_STATUS: DbLeadStatus[] = ['neu', 'kontaktiert', 'nicht_erreicht', 'termin_vereinbart', 'beratung', 'gewonnen']

export const ALT_NACH_TAGEN = 60
export const NICHT_ERREICHT_WARTEZEIT_STUNDEN = 2

export interface DbLead {
  id: string
  name: string
  telefon: string
  email: string
  gesellschaft: string
  tarifbeitrag: number
  quelle: string | null
  eingang_zeit: string
  status: DbLeadStatus
  ist_live: boolean
  ist_test: boolean
  moegliches_duplikat_von: string | null
  zugewiesen_an: string | null
  zugewiesen_von: string | null
  uebernommen_am: string | null
  naechster_anruf_ab: string | null
  /** Zeitpunkt einer Sperre/eines Widerrufs; gesperrte Leads werden nie angerufen */
  gesperrt_am: string | null
  sperrgrund: string | null
  /** Zeitpunkt der letzten Statusaenderung (Migration 20261103000100); fehlt sie noch, gilt updated_at */
  status_geaendert_am: string | null
  created_at: string
  updated_at: string
}

export type LeadKategorie = 'kunde' | 'verloren' | 'alt' | 'aktiv'

export function isDbLeadStatus(value: unknown): value is DbLeadStatus {
  return typeof value === 'string' && (ALL_STATUS as string[]).includes(value)
}

export function statusLabel(status: string): string {
  return isDbLeadStatus(status) ? STATUS_LABEL[status] : status
}

export type StatusTone = 'ink' | 'brand' | 'red' | 'amber' | 'green'

export function statusTone(status: string): StatusTone {
  switch (status) {
    case 'gewonnen':
      return 'green'
    case 'kontaktiert':
    case 'beratung':
      return 'brand'
    case 'nicht_erreicht':
    case 'termin_vereinbart':
      return 'amber'
    case 'verloren':
    case 'verstorben':
    case 'nicht_mehr_pkv':
    case 'kein_interesse':
    case 'schon_umgestellt':
      return 'red'
    default:
      return 'ink'
  }
}

export function isOpenStatus(status: DbLeadStatus): boolean {
  return OPEN_STATUS.includes(status)
}

export function isLostStatus(status: DbLeadStatus): boolean {
  return LOST_STATUS.includes(status)
}

export function ageInDays(eingangZeit: string, now: Date = new Date()): number {
  const t = Date.parse(eingangZeit)
  if (Number.isNaN(t)) return 0
  return Math.floor((now.getTime() - t) / 86_400_000)
}

/** Ordnet einen Lead einer der Listen zu: gewonnen -> Kunde, Abschluss-Status -> verloren, offen + aelter als 60 Tage -> alt. */
export function kategorie(lead: Pick<DbLead, 'status' | 'eingang_zeit'>, now: Date = new Date()): LeadKategorie {
  if (lead.status === 'gewonnen') return 'kunde'
  if (isLostStatus(lead.status)) return 'verloren'
  if (ageInDays(lead.eingang_zeit, now) > ALT_NACH_TAGEN) return 'alt'
  return 'aktiv'
}

export function filterKategorie(leads: DbLead[], k: LeadKategorie, now: Date = new Date()): DbLead[] {
  return leads.filter((l) => kategorie(l, now) === k)
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

function strOrNull(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null
}

/** Wandelt eine Datenbankzeile (unbekannte Form) in einen sauber typisierten Lead um. Gibt null fuer unbrauchbare Zeilen zurueck. */
export function mapLeadRow(row: unknown): DbLead | null {
  if (!row || typeof row !== 'object') return null
  const r = row as Record<string, unknown>
  if (typeof r.id !== 'string' || !isDbLeadStatus(r.status)) return null
  const betrag = typeof r.tarifbeitrag === 'string' ? Number(r.tarifbeitrag) : r.tarifbeitrag
  return {
    id: r.id,
    name: str(r.name, 'Unbekannt'),
    telefon: str(r.telefon),
    email: str(r.email),
    gesellschaft: str(r.gesellschaft, 'Unbekannt'),
    tarifbeitrag: typeof betrag === 'number' && Number.isFinite(betrag) ? betrag : 0,
    quelle: strOrNull(r.quelle),
    eingang_zeit: str(r.eingang_zeit, str(r.created_at)),
    status: r.status,
    ist_live: r.ist_live !== false,
    ist_test: r.ist_test === true,
    moegliches_duplikat_von: strOrNull(r.moegliches_duplikat_von),
    zugewiesen_an: strOrNull(r.zugewiesen_an),
    zugewiesen_von: strOrNull(r.zugewiesen_von),
    uebernommen_am: strOrNull(r.uebernommen_am),
    naechster_anruf_ab: strOrNull(r.naechster_anruf_ab),
    gesperrt_am: strOrNull(r.gesperrt_am),
    sperrgrund: strOrNull(r.sperrgrund),
    status_geaendert_am: strOrNull(r.status_geaendert_am),
    created_at: str(r.created_at),
    updated_at: str(r.updated_at),
  }
}

export function mapLeadRows(rows: unknown): DbLead[] {
  if (!Array.isArray(rows)) return []
  const out: DbLead[] = []
  for (const row of rows) {
    const lead = mapLeadRow(row)
    if (lead && !lead.ist_test) out.push(lead)
  }
  return out
}

/** Neueste zuerst (nach Eingang). */
export function sortNewestFirst(leads: DbLead[]): DbLead[] {
  return [...leads].sort((a, b) => Date.parse(b.eingang_zeit) - Date.parse(a.eingang_zeit) || b.id.localeCompare(a.id))
}

export function countByStatus(leads: DbLead[]): Record<DbLeadStatus, number> {
  const counts = Object.fromEntries(ALL_STATUS.map((s) => [s, 0])) as Record<DbLeadStatus, number>
  for (const l of leads) counts[l.status] += 1
  return counts
}

// ---------- Power Dialer ----------

export type DialerErgebnis =
  | 'nicht_erreicht'
  | 'spaeter'
  | 'termin_vereinbart'
  | 'kein_interesse'
  | 'verstorben'
  | 'nicht_mehr_pkv'
  | 'schon_umgestellt'

/** Ergebnisse, die den Lead abschliessen (er wird danach nie wieder angerufen). */
export const DIALER_ABSCHLUSS: DialerErgebnis[] = ['kein_interesse', 'verstorben', 'nicht_mehr_pkv', 'schon_umgestellt']

export function plusHours(now: Date, hours: number): string {
  return new Date(now.getTime() + hours * 3_600_000).toISOString()
}

export interface LeadPatch {
  status?: DbLeadStatus
  naechster_anruf_ab?: string | null
}

/** Welche Felder ein Anruf-Ergebnis in der Datenbank aendert. `spaeterAb` ist nur fuer "Spaeter" noetig. */
export function dialerPatch(ergebnis: DialerErgebnis, now: Date = new Date(), spaeterAb?: string): LeadPatch {
  switch (ergebnis) {
    case 'nicht_erreicht':
      return { status: 'nicht_erreicht', naechster_anruf_ab: plusHours(now, NICHT_ERREICHT_WARTEZEIT_STUNDEN) }
    case 'spaeter': {
      const t = spaeterAb ? Date.parse(spaeterAb) : NaN
      if (Number.isNaN(t)) throw new Error('Bitte einen gültigen Zeitpunkt wählen.')
      return { naechster_anruf_ab: new Date(t).toISOString() }
    }
    case 'termin_vereinbart':
      return { status: 'termin_vereinbart' }
    case 'kein_interesse':
    case 'verstorben':
    case 'nicht_mehr_pkv':
    case 'schon_umgestellt':
      return { status: ergebnis }
  }
}

/** Telefonnummer fuer einen tel:-Link (nur Ziffern und fuehrendes Plus). */
export function telHref(telefon: string): string {
  const cleaned = telefon.trim().replace(/[^\d+]/g, '')
  return `tel:${cleaned}`
}

export type AnrufKanal = 'festnetz' | 'mobil'

// ---------- Dashboard ----------

export interface ZeitBereich {
  start: Date
  end: Date
}

export function imBereich(iso: string, bereich: ZeitBereich | null): boolean {
  if (!bereich) return true
  const t = Date.parse(iso)
  return !Number.isNaN(t) && t >= bereich.start.getTime() && t <= bereich.end.getTime()
}

/** Zeitpunkt, seit dem der Lead im aktuellen Status ist (Fallback auf updated_at, solange die Migration fehlt). */
export function statusZeit(lead: Pick<DbLead, 'status_geaendert_am' | 'updated_at'>): string {
  return lead.status_geaendert_am ?? lead.updated_at
}

export function beitragSumme(leads: DbLead[]): number {
  return leads.reduce((s, l) => s + l.tarifbeitrag, 0)
}

// ---------- Lead-Verteilung ----------

/** Nur Leads mit diesen Status kann man uebernehmen (wie die Datenbankfunktion lead_uebernehmen). */
export const UEBERNAHME_STATUS: DbLeadStatus[] = ['neu', 'kontaktiert', 'nicht_erreicht']

export type Bearbeiter = 'frei' | 'ich' | 'andere'

export interface LeadZugriff {
  bearbeiter: Bearbeiter
  /** frei zum Uebernehmen (Status passt, kein Testlead) */
  darfUebernehmen: boolean
  /** eigener Lead oder Geschaeftsfuehrer */
  darfFreigeben: boolean
  darfZuweisen: boolean
  /** Status aendern, Notizen schreiben, anrufen: nicht, wenn der Lead einem anderen gehoert (Geschaeftsfuehrer ausgenommen) */
  darfBearbeiten: boolean
  /** Ein Mitarbeiter muss einen freien Lead zuerst uebernehmen, bevor er den Status aendern kann (Datenbankregel) */
  uebernahmeVorBearbeitung: boolean
}

export function leadZugriff(lead: Pick<DbLead, 'zugewiesen_an' | 'status' | 'ist_test'>, meId: string | null, istGeschaeftsfuehrer: boolean): LeadZugriff {
  const bearbeiter: Bearbeiter = lead.zugewiesen_an === null ? 'frei' : lead.zugewiesen_an === meId ? 'ich' : 'andere'
  return {
    bearbeiter,
    darfUebernehmen: bearbeiter === 'frei' && !lead.ist_test && UEBERNAHME_STATUS.includes(lead.status),
    darfFreigeben: bearbeiter !== 'frei' && (bearbeiter === 'ich' || istGeschaeftsfuehrer),
    darfZuweisen: istGeschaeftsfuehrer,
    darfBearbeiten: bearbeiter !== 'andere' || istGeschaeftsfuehrer,
    uebernahmeVorBearbeitung: bearbeiter === 'frei' && !istGeschaeftsfuehrer,
  }
}

/**
 * Sieht ein Mitarbeiter diesen Lead (wie die Zeilen-Policy leads_select)? Freie Leads nur in uebernehmbarem Status, nicht gesperrt und kein
 * Testlead; eigene Leads immer. Der Geschaeftsfuehrer sieht alles.
 */
export function fuerMitarbeiterSichtbar(lead: Pick<DbLead, 'zugewiesen_an' | 'status' | 'gesperrt_am' | 'ist_test'>, meId: string | null): boolean {
  if (lead.zugewiesen_an !== null) return lead.zugewiesen_an === meId
  return !lead.ist_test && !lead.gesperrt_am && UEBERNAHME_STATUS.includes(lead.status)
}

export type ZuweisungsFilter = 'alle' | 'frei' | 'meine'

export function filterZuweisung(leads: DbLead[], filter: ZuweisungsFilter, meId: string | null): DbLead[] {
  if (filter === 'frei') return leads.filter((l) => l.zugewiesen_an === null)
  if (filter === 'meine') return leads.filter((l) => meId !== null && l.zugewiesen_an === meId)
  return leads
}

/** Warteschlange des Power Dialers: freie Leads plus eigene, Leads anderer Personen werden nie angezeigt. */
export function queueFuerNutzer(queue: DbLead[], meId: string | null): DbLead[] {
  return queue.filter((l) => l.zugewiesen_an === null || (meId !== null && l.zugewiesen_an === meId))
}

/**
 * Reihenfolge im Power Dialer: ZUERST zugesagte Rueckrufe (naechster_anruf_ab ist faellig, der aelteste Termin zuerst), DANACH alle
 * anderen nach Eingang, neueste zuerst. Die Funktion aendert die Eingabe nicht.
 */
export function dialerReihenfolge(leads: DbLead[], jetzt: Date = new Date()): DbLead[] {
  const faelligMs = (l: DbLead): number | null => {
    if (!l.naechster_anruf_ab) return null
    const t = Date.parse(l.naechster_anruf_ab)
    return Number.isNaN(t) || t > jetzt.getTime() ? null : t
  }
  const rueckrufe = leads.filter((l) => faelligMs(l) !== null).sort((a, b) => (faelligMs(a) as number) - (faelligMs(b) as number) || a.id.localeCompare(b.id))
  const neue = leads
    .filter((l) => faelligMs(l) === null)
    .sort((a, b) => Date.parse(b.eingang_zeit) - Date.parse(a.eingang_zeit) || a.id.localeCompare(b.id))
  return [...rueckrufe, ...neue]
}

/** Status, in denen ein Lead angerufen werden darf (wie public.offene_status() in der Datenbank). */
export const ANRUF_STATUS: DbLeadStatus[] = ['neu', 'kontaktiert', 'nicht_erreicht', 'termin_vereinbart', 'beratung']

/** Maximales Alter einer Einwilligung (wie public.einwilligung_max_alter(): 365 Tage, anwaltlich zu klaeren). */
export const EINWILLIGUNG_MAX_ALTER_TAGE = 365

export interface AnrufPruefung {
  ok: boolean
  /** Verstaendlicher Grund, wenn nicht anrufbar */
  grund: string | null
}

/**
 * Darf der Nutzer diesen Lead jetzt anrufen? Spiegelt die Datenbankregeln (Gesperrt, Einwilligung vorhanden und nicht zu alt, Status offen,
 * eigener Lead oder freier Lead in einem uebernehmbaren Status). `einwilligungZeit`: Zeitpunkt der Einwilligung, null = kein Nachweis,
 * undefined = noch nicht geladen (dann wird die Einwilligung nicht bemaengelt; die Datenbank prueft ohnehin).
 */
export function anrufPruefung(
  lead: Pick<DbLead, 'status' | 'zugewiesen_an' | 'gesperrt_am' | 'ist_test'>,
  einwilligungZeit: string | null | undefined,
  meId: string | null,
  jetzt: Date = new Date(),
): AnrufPruefung {
  const nein = (grund: string): AnrufPruefung => ({ ok: false, grund })
  if (lead.ist_test) return nein('Testleads werden nicht angerufen.')
  if (lead.gesperrt_am) return nein('Gesperrt (Widerruf oder Wunsch, nicht angerufen zu werden): kein Anruf möglich.')
  if (!ANRUF_STATUS.includes(lead.status)) return nein('Der Lead ist abgeschlossen und wird nicht mehr angerufen.')
  if (lead.zugewiesen_an !== null && lead.zugewiesen_an !== meId) return nein('Der Lead wird von jemand anderem bearbeitet.')
  if (lead.zugewiesen_an === null && !UEBERNAHME_STATUS.includes(lead.status)) {
    return nein('Dieser freie Lead kann nur vom Geschäftsführer zugewiesen werden.')
  }
  if (einwilligungZeit === null) return nein('Es liegt kein Einwilligungsnachweis vor: kein Anruf möglich.')
  if (typeof einwilligungZeit === 'string') {
    const t = Date.parse(einwilligungZeit)
    if (Number.isNaN(t) || t < jetzt.getTime() - EINWILLIGUNG_MAX_ALTER_TAGE * 86_400_000) {
      return nein('Die Einwilligung ist zu alt: kein Anruf möglich.')
    }
  }
  return { ok: true, grund: null }
}

/**
 * Ist ein Eintrag der eingefrorenen Dialer-Liste noch anrufbar? `aktuell` ist der Lead aus der live aktualisierten Lead-Liste;
 * fehlt er dort (z. B. weil er inzwischen jemand anderem zugewiesen wurde und nicht mehr sichtbar ist), gilt er als nicht mehr anrufbar,
 * sofern die Lead-Liste ueberhaupt geladen ist (`listeGeladen`).
 */
export function nochImDialerAnrufbar(aktuell: DbLead | undefined, listeGeladen: boolean, meId: string | null, jetzt: Date = new Date()): boolean {
  if (!aktuell) return !listeGeladen
  return anrufPruefung(aktuell, undefined, meId, jetzt).ok && UEBERNAHME_STATUS.includes(aktuell.status)
}

/** Deutsche Meldung zu einem Fehler der Verteilungsfunktionen (supabase.rpc). */
export function verteilungsFehler(err: { code?: string | null; message?: string | null } | null | undefined): string {
  const code = err?.code ?? ''
  const msg = (err?.message ?? '').toLowerCase()
  if (code === 'PGRST202' || code === '42883' || msg.includes('could not find the function')) {
    return 'Die Lead-Verteilung ist serverseitig noch nicht eingerichtet.'
  }
  // PostgREST liefert die Obergrenze als SQLSTATE PT429 (HTTP 429); aeltere Stande als 53400. Zusaetzlich am Meldungstext erkennbar.
  if (code === 'PT429' || code === '53400' || msg.includes('limit_offene_leads') || msg.includes('obergrenze')) {
    return 'Sie haben bereits die maximale Zahl offener eigener Leads (50, auch Termine und Beratungen zählen). Schaffen Sie Platz: Leads abschließen oder freigeben (Lead öffnen und „Freigeben“ wählen).'
  }
  if (code === '42501' || msg.includes('geschaeftsfuehrer')) return 'Dafür fehlt die Berechtigung (nur der Geschäftsführer bzw. der Besitzer des Leads).'
  return 'Die Aktion konnte nicht ausgeführt werden. Bitte später erneut versuchen.'
}


/**
 * Deutsche Meldung, wenn der Browser einen Anruf nicht protokollieren darf (tel:-Pfad). Die Datenbank lehnt ab, wenn die Limits
 * erreicht sind (Fehler 53400, Meldung "anruf_limit:<grund>") oder der Lead nicht (mehr) angerufen werden darf (RLS, 42501).
 * Der Anruf wird dann NICHT gestartet.
 */
export function anrufProtokollFehler(err: { code?: string | null; message?: string | null } | null | undefined): string {
  const code = err?.code ?? ''
  const msg = (err?.message ?? '').toLowerCase()
  if (code === 'PT429' || code === '53400' || msg.includes('anruf_limit')) {
    if (msg.includes('lead_limit')) return 'Dieser Lead wurde gerade erst angerufen. Bitte mindestens 10 Minuten bis zum nächsten Anruf warten.'
    if (msg.includes('nutzer_limit')) return 'Das Limit von 30 Anrufen pro Stunde ist erreicht. Bitte später weitertelefonieren.'
    return 'Bitte einen Moment warten, bevor der nächste Anruf gestartet wird.'
  }
  if (code === '42501' || msg.includes('row-level security')) {
    return 'Dieser Anruf ist nicht erlaubt: Der Lead gehört Ihnen nicht, ist gesperrt, abgeschlossen oder hat keine gültige Einwilligung.'
  }
  return 'Der Anruf konnte nicht protokolliert werden und wird deshalb nicht gestartet. Bitte erneut versuchen.'
}

export interface Wiedervorlage {
  lead: DbLead
  faellig: string
  ueberfaellig: boolean
}

/**
 * Wiedervorlagen eines Nutzers: eigene, noch offene Leads mit gesetztem "naechster_anruf_ab" (Spaetter/Nicht erreicht).
 * Sortiert nach Faelligkeit, aelteste zuerst.
 */
export function wiedervorlagenFuer(leads: DbLead[], userId: string | null, now: Date = new Date()): Wiedervorlage[] {
  if (!userId) return []
  const liste: Wiedervorlage[] = []
  for (const lead of leads) {
    if (lead.zugewiesen_an !== userId || lead.ist_test || !isOpenStatus(lead.status) || !lead.naechster_anruf_ab) continue
    const t = Date.parse(lead.naechster_anruf_ab)
    if (Number.isNaN(t)) continue
    liste.push({ lead, faellig: lead.naechster_anruf_ab, ueberfaellig: t < now.getTime() })
  }
  return liste.sort((a, b) => Date.parse(a.faellig) - Date.parse(b.faellig))
}

// ---------- Zusammenfuehren von Ladungen und Realtime-Ereignissen ----------

/** Fuehrt eine neu geladene Liste mit dem lokalen Stand zusammen: Leads, die lokal NACH Beginn der Abfrage geaendert wurden, behalten ihren neueren Stand. */
export function fuehreZusammen(neu: DbLead[], lokal: DbLead[], lokalGeaendertAm: ReadonlyMap<string, number>, abfrageStart: number): DbLead[] {
  const lokalNachId = new Map(lokal.map((l) => [l.id, l]))
  const ergebnis = neu.map((l) => ((lokalGeaendertAm.get(l.id) ?? 0) > abfrageStart ? (lokalNachId.get(l.id) ?? l) : l))
  const vorhanden = new Set(ergebnis.map((l) => l.id))
  for (const l of lokal) {
    if (!vorhanden.has(l.id) && (lokalGeaendertAm.get(l.id) ?? 0) > abfrageStart) ergebnis.push(l)
  }
  return ergebnis
}

/** Nimmt einen Lead aus einem Realtime-Ereignis in die Liste auf; ein aelterer Stand ueberschreibt nie einen neueren. */
export function upsertLead(liste: DbLead[], lead: DbLead): DbLead[] {
  const i = liste.findIndex((l) => l.id === lead.id)
  if (i === -1) return [lead, ...liste]
  if (Date.parse(liste[i].updated_at) > Date.parse(lead.updated_at)) return liste
  const kopie = [...liste]
  kopie[i] = lead
  return kopie
}


// ---------- Sperre / Widerruf ----------

export type SperrGrundArt = 'widerruf' | 'wunsch' | 'verstorben' | 'nicht_mehr_pkv' | 'sonstiges'

export const SPERR_GRUENDE: { id: SperrGrundArt; label: string }[] = [
  { id: 'widerruf', label: 'Widerruf der Einwilligung' },
  { id: 'wunsch', label: 'Wunsch, nicht angerufen zu werden' },
  { id: 'verstorben', label: 'Verstorben' },
  { id: 'nicht_mehr_pkv', label: 'Nicht mehr PKV' },
  { id: 'sonstiges', label: 'Sonstiges' },
]

/** Text des Sperrgrunds fuer die Datenbank. Bei "Sonstiges" ist eine Angabe Pflicht (sonst null). Hoechstens 500 Zeichen. */
export function sperrGrundText(art: SperrGrundArt, freitext: string): string | null {
  const label = SPERR_GRUENDE.find((g) => g.id === art)?.label
  if (!label) return null
  const zusatz = freitext.trim()
  if (art === 'sonstiges') return zusatz ? `Sonstiges: ${zusatz}`.slice(0, 500) : null
  return (zusatz ? `${label}: ${zusatz}` : label).slice(0, 500)
}
