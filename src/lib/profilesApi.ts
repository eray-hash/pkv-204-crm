// Zugriff auf `profiles`: eigenes Profil, Team-Liste und eigene Erreichbarkeit.
// Die neuen Spalten (Zeitzone, Erreichbarkeit) entstehen erst mit der Migration 20261030000000_verteilung.sql;
// bis dahin wird automatisch ohne diese Spalten gelesen (Standardwerte), damit nichts kaputtgeht.
import { supabase } from './supabase'
import { parseProfile, type Profile } from './profil'
import type { ErreichbarkeitEingabe } from './profil'

const BASIS = 'id, name, rolle, telefon_festnetz, telefon_mobil'
const ERWEITERT = `${BASIS}, zeitzone, online, auto_online, erreichbar_von, erreichbar_bis`

let erweitertVerfuegbar = true

export function erreichbarkeitVerfuegbar(): boolean {
  return erweitertVerfuegbar
}

export function istFehlendeSpalte(error: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!error) return false
  return error.code === '42703' || /column .* does not exist/i.test(error.message ?? '')
}

export interface ProfilErgebnis<T> {
  data: T | null
  error: string | null
}

export async function fetchProfil(userId: string): Promise<ProfilErgebnis<Profile | null>> {
  for (const spalten of erweitertVerfuegbar ? [ERWEITERT, BASIS] : [BASIS]) {
    const { data, error } = await supabase.from('profiles').select(spalten).eq('id', userId).maybeSingle()
    if (error) {
      if (spalten === ERWEITERT && istFehlendeSpalte(error)) {
        erweitertVerfuegbar = false
        continue
      }
      console.error('Profil laden fehlgeschlagen', error)
      return { data: null, error: 'Das Profil konnte nicht geladen werden.' }
    }
    return { data: parseProfile(data), error: null }
  }
  return { data: null, error: 'Das Profil konnte nicht geladen werden.' }
}

/** Alle Profile (fuer Namen und Team-Praesenz), nach Name sortiert. */
export async function fetchTeam(): Promise<ProfilErgebnis<Profile[]>> {
  for (const spalten of erweitertVerfuegbar ? [ERWEITERT, BASIS] : [BASIS]) {
    const { data, error } = await supabase.from('profiles').select(spalten).order('name', { ascending: true })
    if (error) {
      if (spalten === ERWEITERT && istFehlendeSpalte(error)) {
        erweitertVerfuegbar = false
        continue
      }
      console.error('Team laden fehlgeschlagen', error)
      return { data: null, error: 'Das Team konnte nicht geladen werden.' }
    }
    const liste: Profile[] = []
    for (const row of (data ?? []) as unknown[]) {
      const p = parseProfile(row)
      if (p) liste.push(p)
    }
    return { data: liste, error: null }
  }
  return { data: null, error: 'Das Team konnte nicht geladen werden.' }
}

export type ErreichbarkeitPatch = Partial<Pick<ErreichbarkeitEingabe, 'zeitzone' | 'online' | 'auto_online'>> & {
  erreichbar_von?: string | null
  erreichbar_bis?: string | null
}

/** Speichert die eigene Zeitzone/Erreichbarkeit und gibt das aktualisierte Profil zurueck. */
export async function updateErreichbarkeit(userId: string, patch: ErreichbarkeitPatch): Promise<ProfilErgebnis<Profile>> {
  const { data, error } = await supabase.from('profiles').update(patch).eq('id', userId).select(ERWEITERT).maybeSingle()
  if (error) {
    if (istFehlendeSpalte(error)) {
      erweitertVerfuegbar = false
      return { data: null, error: 'Die Erreichbarkeits-Einstellungen sind serverseitig noch nicht eingerichtet.' }
    }
    console.error('Erreichbarkeit speichern fehlgeschlagen', error)
    if (error.code === '22023') return { data: null, error: 'Ungültige Zeitzone.' }
    return { data: null, error: 'Die Einstellungen konnten nicht gespeichert werden.' }
  }
  const p = parseProfile(data)
  if (!p) return { data: null, error: 'Die Einstellungen wurden nicht gespeichert (keine Berechtigung).' }
  return { data: p, error: null }
}
