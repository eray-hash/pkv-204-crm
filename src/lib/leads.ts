// Reine Logik fuer die echten Leads aus der Datenbank (ohne React/Supabase-Abhaengigkeiten, damit per
// `node --test` pruefbar). Die Beispieldaten des Mockups nutzen weiterhin die Typen aus ../types.

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

/** Schritte der Bearbeitungs-Pipeline (ohne den frueheren Mockup-Status "Antrag", den es in der DB nicht gibt). */
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
  naechster_anruf_ab: string | null
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
    naechster_anruf_ab: strOrNull(r.naechster_anruf_ab),
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
  return [...leads].sort((a, b) => Date.parse(b.eingang_zeit) - Date.parse(a.eingang_zeit))
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
      if (Number.isNaN(t)) throw new Error('Bitte einen gueltigen Zeitpunkt waehlen.')
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

export function beitragSumme(leads: DbLead[]): number {
  return leads.reduce((s, l) => s + l.tarifbeitrag, 0)
}
