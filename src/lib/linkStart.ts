// MUSS in main.tsx als ERSTES importiert werden: wertet die Adresse aus, bevor der Supabase-Client
// (lib/supabase.ts, wird mit der App geladen) den Hash verarbeitet und entfernt.
import { normalisiereHash, parseAuthLink, verlangtNeuesPasswort, type AuthLink } from './authLink'

const PFLICHT_KEY = 'pkv-204-crm-passwort-pflicht'

function lese(): AuthLink | null {
  if (typeof window === 'undefined') return null
  const hash = normalisiereHash(window.location.hash)
  if (hash !== window.location.hash) {
    try {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${hash}`)
    } catch {
      // ignorieren
    }
  }
  return parseAuthLink(hash, window.location.search)
}

export const startLink: AuthLink | null = lese()

function merke(): boolean {
  try {
    if (verlangtNeuesPasswort(startLink)) window.sessionStorage.setItem(PFLICHT_KEY, '1')
    return window.sessionStorage.getItem(PFLICHT_KEY) === '1'
  } catch {
    return verlangtNeuesPasswort(startLink)
  }
}

/**
 * true, solange der Nutzer ueber Einladung/Recovery-Link kam und noch kein Passwort festgelegt hat.
 * Wird in sessionStorage gemerkt, damit ein Neuladen der Seite die Pflicht nicht umgeht.
 */
export const startPasswortPflicht: boolean = typeof window === 'undefined' ? false : merke()

/** Pflicht erfuellt (Passwort gespeichert) oder abgemeldet. */
export function loeschePasswortPflicht(): void {
  try {
    window.sessionStorage.removeItem(PFLICHT_KEY)
  } catch {
    // ignorieren
  }
}

/** Setzt die Adresse auf die Startseite und entfernt Token und Fehlerangaben aus Hash und Query. */
export function bereinigeAdresse(): void {
  if (typeof window === 'undefined') return
  try {
    window.history.replaceState(null, '', `${window.location.pathname}#/`)
    window.dispatchEvent(new PopStateEvent('popstate'))
  } catch {
    // ignorieren
  }
}
