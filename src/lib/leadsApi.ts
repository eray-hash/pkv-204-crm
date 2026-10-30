// Zugriff auf die Supabase-Tabellen fuer Leads. Alle Funktionen werfen bei Fehlern keinen Fehler,
// sondern liefern { error } mit einer deutschen Meldung (Details nur in der Konsole).
import { supabase } from './supabase'
import { mapLeadRow, mapLeadRows, sortNewestFirst, verteilungsFehler, type AnrufKanal, type DbLead, type LeadPatch } from './leads'
import { istFehlendeSpalte } from './profilesApi'

const SEITE = 1000
const MAX_SEITEN = 30

// Basis-Spalten (immer vorhanden) und die mit der Verteilungs-Migration hinzugekommenen Spalten.
const LEAD_SPALTEN =
  'id, name, telefon, email, gesellschaft, tarifbeitrag, quelle, eingang_zeit, status, ist_live, ist_test, moegliches_duplikat_von, zugewiesen_an, naechster_anruf_ab, created_at, updated_at'
const LEAD_SPALTEN_ERWEITERT = `${LEAD_SPALTEN}, zugewiesen_von, uebernommen_am`
let leadsErweitertVerfuegbar = true

export interface Ergebnis<T> {
  data: T | null
  error: string | null
}

function fehler<T>(meldung: string, detail: unknown): Ergebnis<T> {
  console.error(meldung, detail)
  return { data: null, error: meldung }
}

/** Alle echten Leads (keine Testleads), neueste zuerst. Liest seitenweise, weil PostgREST pro Anfrage begrenzt. */
export async function fetchLeads(): Promise<Ergebnis<DbLead[]>> {
  const alle: DbLead[] = []
  for (let seite = 0; seite < MAX_SEITEN; seite++) {
    const von = seite * SEITE
    const abfrage = (spalten: string) =>
      supabase.from('leads').select(spalten).eq('ist_test', false).order('eingang_zeit', { ascending: false }).range(von, von + SEITE - 1)
    let { data, error } = await abfrage(leadsErweitertVerfuegbar ? LEAD_SPALTEN_ERWEITERT : LEAD_SPALTEN)
    if (error && leadsErweitertVerfuegbar && istFehlendeSpalte(error)) {
      // Migration noch nicht eingespielt: ohne die neuen Spalten weiterarbeiten
      leadsErweitertVerfuegbar = false
      ;({ data, error } = await abfrage(LEAD_SPALTEN))
    }
    if (error) return fehler('Die Leads konnten nicht geladen werden.', error)
    alle.push(...mapLeadRows(data))
    if (!data || data.length < SEITE) break
  }
  return { data: sortNewestFirst(alle), error: null }
}

/** Anrufbare Leads aus der Datenbank-Ansicht (nur mit Einwilligungsnachweis, faellig), neueste zuerst. */
export async function fetchQueue(): Promise<Ergebnis<DbLead[]>> {
  const alle: DbLead[] = []
  for (let seite = 0; seite < MAX_SEITEN; seite++) {
    const von = seite * SEITE
    const { data, error } = await supabase
      .from('anrufbare_leads')
      .select(LEAD_SPALTEN)
      .order('eingang_zeit', { ascending: false })
      .range(von, von + SEITE - 1)
    if (error) return fehler('Die Anrufliste konnte nicht geladen werden.', error)
    alle.push(...mapLeadRows(data))
    if (!data || data.length < SEITE) break
  }
  return { data: sortNewestFirst(alle), error: null }
}

export async function fetchLead(id: string): Promise<Ergebnis<DbLead | null>> {
  const abfrage = (spalten: string) => supabase.from('leads').select(spalten).eq('id', id).maybeSingle()
  let { data, error } = await abfrage(leadsErweitertVerfuegbar ? LEAD_SPALTEN_ERWEITERT : LEAD_SPALTEN)
  if (error && leadsErweitertVerfuegbar && istFehlendeSpalte(error)) {
    leadsErweitertVerfuegbar = false
    ;({ data, error } = await abfrage(LEAD_SPALTEN))
  }
  if (error) return fehler('Der Lead konnte nicht geladen werden.', error)
  const lead = mapLeadRow(data)
  return { data: lead && !lead.ist_test ? lead : null, error: null }
}

export async function updateLeadRow(id: string, patch: LeadPatch): Promise<Ergebnis<DbLead>> {
  const { data, error } = await supabase
    .from('leads')
    .update(patch)
    .eq('id', id)
    .select(leadsErweitertVerfuegbar ? LEAD_SPALTEN_ERWEITERT : LEAD_SPALTEN)
    .maybeSingle()
  if (error) return fehler('Die Änderung konnte nicht gespeichert werden.', error)
  const lead = mapLeadRow(data)
  if (!lead) {
    return fehler('Keine Berechtigung: Der Lead gehört jemand anderem oder ist noch frei (bitte zuerst übernehmen).', 'leer')
  }
  return { data: lead, error: null }
}

// ---------- Lead-Verteilung (Datenbankfunktionen aus 20261030000000_verteilung.sql) ----------

export interface VerteilungsErgebnis {
  /** true = die Aktion hat den Lead tatsaechlich geaendert */
  ok: boolean
  /** Fehlermeldung bei technischen Problemen (nicht bei "bereits vergeben", das ist ok=false ohne Fehler) */
  fehler: string | null
}

async function verteilungAufrufen(funktion: string, args: Record<string, string>): Promise<VerteilungsErgebnis> {
  const { data, error } = await supabase.rpc(funktion, args)
  if (error) {
    console.error(`${funktion} fehlgeschlagen`, error)
    return { ok: false, fehler: verteilungsFehler(error) }
  }
  return { ok: data === true, fehler: null }
}

/** Atomar: nur der erste Aufrufer bekommt den freien Lead (ok=false: schon vergeben oder nicht uebernehmbar). */
export const rpcUebernehmen = (leadId: string) => verteilungAufrufen('lead_uebernehmen', { p_lead_id: leadId })
export const rpcFreigeben = (leadId: string) => verteilungAufrufen('lead_freigeben', { p_lead_id: leadId })
export const rpcZuweisen = (leadId: string, userId: string) => verteilungAufrufen('lead_zuweisen', { p_lead_id: leadId, p_user_id: userId })

// ---------- Einwilligung, Notizen, Anrufe ----------

export interface Einwilligung {
  einwilligung_zeit: string
  einwilligung_text: string
  einwilligung_quelle: string
}

/** Einwilligungsnachweis (ohne IP-Adresse, die wird im CRM nicht angezeigt). */
export async function fetchEinwilligung(leadId: string): Promise<Ergebnis<Einwilligung | null>> {
  const { data, error } = await supabase
    .from('consent_records')
    .select('einwilligung_zeit, einwilligung_text, einwilligung_quelle')
    .eq('lead_id', leadId)
    .maybeSingle()
  if (error) return fehler('Der Einwilligungsnachweis konnte nicht geladen werden.', error)
  if (!data) return { data: null, error: null }
  return {
    data: {
      einwilligung_zeit: String(data.einwilligung_zeit ?? ''),
      einwilligung_text: String(data.einwilligung_text ?? ''),
      einwilligung_quelle: String(data.einwilligung_quelle ?? ''),
    },
    error: null,
  }
}

export interface Notiz {
  id: string
  text: string
  created_at: string
  autor: string
}

function autorName(profiles: unknown): string {
  const p = Array.isArray(profiles) ? profiles[0] : profiles
  if (p && typeof p === 'object' && 'name' in p && typeof (p as { name: unknown }).name === 'string') return (p as { name: string }).name
  return 'Unbekannt'
}

export async function fetchNotizen(leadId: string): Promise<Ergebnis<Notiz[]>> {
  const { data, error } = await supabase
    .from('lead_notizen')
    .select('id, text, created_at, profiles(name)')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
  if (error) return fehler('Die Notizen konnten nicht geladen werden.', error)
  const notizen: Notiz[] = (data ?? []).map((r) => ({
    id: String(r.id),
    text: String(r.text),
    created_at: String(r.created_at),
    autor: autorName((r as { profiles?: unknown }).profiles),
  }))
  return { data: notizen, error: null }
}

export async function addNotiz(leadId: string, userId: string, text: string): Promise<string | null> {
  const bereinigt = text.trim()
  if (!bereinigt) return 'Bitte zuerst eine Notiz eingeben.'
  if (bereinigt.length > 10000) return 'Die Notiz ist zu lang (maximal 10.000 Zeichen).'
  const { error } = await supabase.from('lead_notizen').insert({ lead_id: leadId, user_id: userId, text: bereinigt })
  if (error) {
    console.error('Notiz speichern fehlgeschlagen', error)
    return 'Die Notiz konnte nicht gespeichert werden.'
  }
  return null
}

export interface Anruf {
  id: string
  kanal: AnrufKanal
  gestartet_am: string
  autor: string
}

export async function fetchAnrufe(leadId: string): Promise<Ergebnis<Anruf[]>> {
  const { data, error } = await supabase
    .from('anrufe')
    .select('id, kanal, gestartet_am, profiles(name)')
    .eq('lead_id', leadId)
    .order('gestartet_am', { ascending: false })
  if (error) return fehler('Die Anrufe konnten nicht geladen werden.', error)
  const anrufe: Anruf[] = (data ?? []).map((r) => ({
    id: String(r.id),
    kanal: r.kanal === 'mobil' ? 'mobil' : 'festnetz',
    gestartet_am: String(r.gestartet_am),
    autor: autorName((r as { profiles?: unknown }).profiles),
  }))
  return { data: anrufe, error: null }
}

export async function logAnruf(leadId: string, userId: string, kanal: AnrufKanal): Promise<string | null> {
  const { error } = await supabase.from('anrufe').insert({ lead_id: leadId, user_id: userId, kanal })
  if (error) {
    console.error('Anruf protokollieren fehlgeschlagen', error)
    return 'Der Anruf konnte nicht protokolliert werden.'
  }
  return null
}
