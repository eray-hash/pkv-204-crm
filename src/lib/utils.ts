import { getAnzeigeZeitzone } from './zeit.ts'

export function formatEuro(value: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value)
}

export function formatEuroExact(value: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value)
}

/** Anzeige fuer fehlende oder ungueltige Werte (statt "Invalid Date" oder eines Absturzes). */
export const KEIN_WERT = '–'

function alsDatum(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

// Alle Zeitstempel erscheinen in der Zeitzone des eingeloggten Nutzers (siehe setAnzeigeZeitzone in zeit.ts).
export function formatDate(iso: string | null | undefined): string {
  const d = alsDatum(iso)
  if (!d) return KEIN_WERT
  return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: getAnzeigeZeitzone() }).format(d)
}

export function formatDateTime(iso: string | null | undefined): string {
  const d = alsDatum(iso)
  if (!d) return KEIN_WERT
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: getAnzeigeZeitzone(),
  }).format(d)
}

export function formatTime(iso: string | null | undefined): string {
  const d = alsDatum(iso)
  if (!d) return KEIN_WERT
  return new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: getAnzeigeZeitzone() }).format(d)
}

/** Initialen aus einem Namen (ein Buchstabe je Wort, mehrfache Leerzeichen werden ignoriert, hoechstens zwei). */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export const ZEITRAUM_LABELS = {
  heute: 'Heute',
  gestern: 'Gestern',
  letzte7: 'Letzte 7 Tage',
  letzte14: 'Letzte 2 Wochen',
  letzte30: 'Letzte 30 Tage',
  diesermonat: 'Dieser Monat',
  letztermonat: 'Letzter Monat',
  alle: 'Alle',
  custom: 'Benutzerdefiniert',
} as const
