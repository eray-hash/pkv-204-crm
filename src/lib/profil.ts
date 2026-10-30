// Profil-Daten (reine Logik, per `node --test` pruefbar).
import { parseUhrzeit } from './praesenz.ts'
import { istGueltigeZeitzone, STANDARD_ZEITZONE } from './zeit.ts'

export type Rolle = 'mitarbeiter' | 'geschaeftsfuehrer'

export interface Profile {
  id: string
  name: string
  rolle: Rolle
  telefon_festnetz: string | null
  telefon_mobil: string | null
  zeitzone: string
  online: boolean
  auto_online: boolean
  /** "HH:MM" (Ortszeit der Person) oder null */
  erreichbar_von: string | null
  erreichbar_bis: string | null
}

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)

/** "08:30:00" -> "08:30"; ungueltig -> null */
export function uhrzeitKurz(v: unknown): string | null {
  const min = typeof v === 'string' ? parseUhrzeit(v) : null
  if (min === null) return null
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(Math.floor(min / 60))}:${p(min % 60)}`
}

/**
 * Wandelt eine Zeile aus `profiles` um. Spalten, die es (noch) nicht gibt, bekommen Standardwerte
 * (Europe/Berlin, nicht online), damit das Frontend auch vor der Datenbank-Migration funktioniert.
 */
export function parseProfile(row: unknown): Profile | null {
  if (!row || typeof row !== 'object') return null
  const r = row as Record<string, unknown>
  if (typeof r.id !== 'string') return null
  return {
    id: r.id,
    name: typeof r.name === 'string' && r.name ? r.name : 'Unbekannt',
    rolle: r.rolle === 'geschaeftsfuehrer' ? 'geschaeftsfuehrer' : 'mitarbeiter',
    telefon_festnetz: str(r.telefon_festnetz),
    telefon_mobil: str(r.telefon_mobil),
    zeitzone: istGueltigeZeitzone(typeof r.zeitzone === 'string' ? r.zeitzone : null) ? (r.zeitzone as string) : STANDARD_ZEITZONE,
    online: r.online === true,
    auto_online: r.auto_online === true,
    erreichbar_von: uhrzeitKurz(r.erreichbar_von),
    erreichbar_bis: uhrzeitKurz(r.erreichbar_bis),
  }
}

export interface ErreichbarkeitEingabe {
  zeitzone: string
  online: boolean
  auto_online: boolean
  erreichbar_von: string
  erreichbar_bis: string
}

/** Prueft die Eingaben der Erreichbarkeits-Einstellungen. Gibt eine deutsche Fehlermeldung oder null zurueck. */
export function pruefeErreichbarkeit(e: ErreichbarkeitEingabe): string | null {
  if (!istGueltigeZeitzone(e.zeitzone)) return 'Bitte eine gültige Zeitzone wählen.'
  const von = parseUhrzeit(e.erreichbar_von)
  const bis = parseUhrzeit(e.erreichbar_bis)
  if (e.erreichbar_von && von === null) return 'Die Uhrzeit „Erreichbar von“ ist ungültig.'
  if (e.erreichbar_bis && bis === null) return 'Die Uhrzeit „Erreichbar bis“ ist ungültig.'
  if (e.auto_online && (von === null || bis === null)) return 'Für „Automatisch online“ bitte Beginn und Ende des Zeitfensters angeben.'
  if (von !== null && bis !== null && von === bis) return '„Erreichbar von“ und „bis“ dürfen nicht gleich sein.'
  return null
}
