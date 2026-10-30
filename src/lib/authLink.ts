// Auswertung von Links aus Supabase-E-Mails (Einladung, Passwort zuruecksetzen) anhand von URL-Hash und Query.
// Reine Logik (per `node --test` pruefbar). Wichtig: Der Link hat die Form `<Site>/#access_token=...&type=invite`
// und kollidiert damit mit dem HashRouter (`#/...`). Deshalb wird der Hash beim Start ausgewertet, BEVOR der
// Supabase-Client ihn verarbeitet und entfernt (siehe linkStart.ts).

export type LinkArt = 'invite' | 'recovery' | 'sonstige'

export interface AuthLink {
  /** Art des Links; bei Fehlern, falls angegeben, ebenfalls (sonst null) */
  art: LinkArt | null
  /** Verstaendliche deutsche Fehlermeldung, wenn der Link nicht (mehr) gueltig ist */
  fehler: string | null
}

export const LINK_ABGELAUFEN = 'Der Link ist abgelaufen, bitte auf der Login-Seite „Passwort vergessen“ nutzen.'
export const LINK_FEHLERHAFT = 'Der Link konnte nicht verarbeitet werden. Bitte auf der Login-Seite „Passwort vergessen“ nutzen.'

/** Entfernt ein fuehrendes "/" hinter dem "#" (z. B. "#/access_token=..."), damit der Supabase-Client den Link erkennt. */
export function normalisiereHash(hash: string): string {
  const m = /^#\/+((?:access_token|error|error_code|error_description|type)=.*)$/.exec(hash)
  return m ? `#${m[1]}` : hash
}

function parameter(hash: string, search: string): Record<string, string> {
  const ergebnis: Record<string, string> = {}
  try {
    const roh = normalisiereHash(hash).replace(/^#/, '')
    new URLSearchParams(roh).forEach((v, k) => {
      ergebnis[k] = v
    })
  } catch {
    // kein Query-String im Hash (z. B. "#/leads")
  }
  try {
    new URLSearchParams(search).forEach((v, k) => {
      ergebnis[k] = v
    })
  } catch {
    // ignorieren
  }
  return ergebnis
}

function artVon(type: string | undefined): LinkArt | null {
  if (type === 'invite') return 'invite'
  if (type === 'recovery') return 'recovery'
  return type ? 'sonstige' : null
}

/** Gibt null zurueck, wenn die Adresse kein Link aus einer Supabase-E-Mail ist (normaler Aufruf, z. B. "#/leads" oder leer). */
export function parseAuthLink(hash: string, search = ''): AuthLink | null {
  const p = parameter(hash, search)
  const hatFehler = Boolean(p.error || p.error_code || p.error_description)
  if (hatFehler) {
    const beschreibung = (p.error_description ?? '').toLowerCase()
    const abgelaufen =
      p.error_code === 'otp_expired' || p.error === 'access_denied' || beschreibung.includes('expired') || beschreibung.includes('invalid')
    return { art: artVon(p.type), fehler: abgelaufen ? LINK_ABGELAUFEN : LINK_FEHLERHAFT }
  }
  if (p.access_token) return { art: artVon(p.type) ?? 'sonstige', fehler: null }
  return null
}

/** Einladung und "Passwort vergessen" fuehren zwingend zur Seite "Passwort festlegen". */
export function verlangtNeuesPasswort(link: AuthLink | null): boolean {
  return Boolean(link && !link.fehler && (link.art === 'invite' || link.art === 'recovery'))
}
