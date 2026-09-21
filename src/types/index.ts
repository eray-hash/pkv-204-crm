export type LeadStatus =
  | 'Neu'
  | 'Kontaktiert'
  | 'Termin vereinbart'
  | 'Beratung'
  | 'Antrag'
  | 'Gewonnen'
  | 'Verloren'

export const LEAD_STATUS_PIPELINE: LeadStatus[] = [
  'Neu',
  'Kontaktiert',
  'Termin vereinbart',
  'Beratung',
  'Antrag',
  'Gewonnen',
]

export type LeadListe = 'aktiv' | 'kunde' | 'verloren' | 'alt' | 'reklamiert'

export type ReklamationStatus = 'offen' | 'ersatz' | 'gutschrift'

export interface Reklamation {
  datum: string
  grund: string
  notiz: string
  status: ReklamationStatus
}

export const REKLAMATION_STATUS_LABEL: Record<ReklamationStatus, string> = {
  offen: 'Offen (an Lieferant gemeldet)',
  ersatz: 'Erledigt (Ersatz erhalten)',
  gutschrift: 'Erledigt (Gutschrift erhalten)',
}

export const REKLAMATION_GRUENDE = [
  'Nicht erreichbar',
  'Falsche Nummer',
  'Kein Interesse an §204',
  'Bereits Kunde woanders',
  'Sonstiges',
] as const

export type AktivitaetTyp = 'anruf' | 'email' | 'notiz' | 'status' | 'termin'

export interface Aktivitaet {
  id: string
  datum: string
  typ: AktivitaetTyp
  text: string
}

export interface Wiedervorlage {
  datum: string
  notiz: string
}

export interface Lead {
  id: string
  name: string
  telefon: string
  email: string
  versicherer: string
  tarif: string
  beitragAlt: number
  beitragNeu?: number
  ersparnis?: number
  status: LeadStatus
  liste: LeadListe
  erstelltAm: string
  notizen: string
  aktivitaeten: Aktivitaet[]
  wiedervorlage?: Wiedervorlage
  verlorenGrund?: string
  reklamation?: Reklamation
}

export interface Termin {
  id: string
  typ: 'Erstgespräch' | 'Beratungsgespräch'
  leadName: string
  leadId?: string
  datum: string
  dauerMinuten: number
  format: 'Video' | 'Telefon' | 'Vor Ort'
}

export interface Nachricht {
  id: string
  absender: string
  email: string
  betreff: string
  vorschau: string
  inhalt: string
  datum: string
  gelesen: boolean
  ordner: 'posteingang' | 'gesendet' | 'archiv'
}

export interface Auszahlung {
  id: string
  datum: string
  betrag: number
  status: 'ausgezahlt' | 'in Bearbeitung' | 'angefordert'
}

export interface UmsatzPunkt {
  monat: string
  umsatz: number
  provision: number
}

export interface SalesProvisionZeile {
  id: string
  produkt: string
  abschlussart: string
  satzProzent: number
  hinweis: string
}

export interface TeamProvisionZeile {
  id: string
  stufe: string
  bedingung: string
  satzProzent: number
}

export interface Benachrichtigung {
  id: string
  text: string
  datum: string
  gelesen: boolean
}

export interface Teammitglied {
  id: string
  name: string
  rolle: string
  darfKalenderSehen: boolean
}

export type Rolle = 'mitarbeiter' | 'geschaeftsfuehrer'

export interface TeamPerformance {
  teammitgliedId: string
  einnahmen: number
  anrufeGesamt: number
  guteAnrufe: number
  terminAnrufe: number
  abschlussAnrufe: number
  nichtErreichtAnrufe: number
}

export interface Zeitfenster {
  von: string
  bis: string
}

export interface Wochenplan {
  [tag: string]: { aktiv: boolean; zeitfenster: Zeitfenster[] }
}

export interface Blockzeit {
  id: string
  titel: string
  von: string
  bis: string
}

export interface OnboardingVideo {
  id: string
  titel: string
  dauer: string
  kategorie: string
}

export interface Profil {
  name: string
  telefon: string
  email: string
  signaturHtml: string
  signaturText: string
  buchungslink: string
  wochenplan: Wochenplan
  blockzeiten: Blockzeit[]
}

export type ZeitraumFilter =
  | 'heute'
  | 'gestern'
  | 'letzte7'
  | 'letzte14'
  | 'letzte30'
  | 'diesermonat'
  | 'letztermonat'
  | 'alle'
  | 'custom'
