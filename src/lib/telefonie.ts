// Reine Logik fuer die sipgate-Telefonie im Frontend (ohne React/Supabase, damit per `node --test` pruefbar).
// Das Token wird nie hier gehalten: Es wird einmalig an die Edge Function gesendet und kommt nie zurueck.

export interface TelefonieGeraet {
  id: string
  name: string
  typ: string
  online: boolean
}

export type TelefonieAnbieter = 'sipgate_classic' | 'sipgate_neo'

export const ANBIETER_LABEL: Record<TelefonieAnbieter, string> = {
  sipgate_classic: 'Classic',
  sipgate_neo: 'Neo',
}

/** Rechte, die das Personal Access Token braucht (Quelle: sipgate-API-Dokumentation/OpenAPI). */
export const ERFORDERLICHE_RECHTE: Record<TelefonieAnbieter, string[]> = {
  sipgate_classic: ['sessions:calls:write', 'devices:read'],
  sipgate_neo: ['rtcm:write', 'devices:read'],
}

export interface TelefonieStatus {
  anbieter: TelefonieAnbieter | null
  verbunden: boolean
  tokenGespeichert: boolean
  geraetId: string | null
  geraetName: string | null
  rufnummerCaller: string | null
  rufnummerAnzeige: string | null
  /** true/false nach Live-Pruefung bei sipgate, null = unbekannt bzw. nicht geprueft */
  tokenGueltig: boolean | null
  hinweis: string | null
}

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)

export function parseStatus(json: unknown): TelefonieStatus | null {
  if (!json || typeof json !== 'object') return null
  const o = json as Record<string, unknown>
  if (o.ok !== true) return null
  return {
    anbieter: o.anbieter === 'sipgate_neo' ? 'sipgate_neo' : o.anbieter === 'sipgate_classic' ? 'sipgate_classic' : null,
    verbunden: o.verbunden === true,
    tokenGespeichert: o.tokenGespeichert === true,
    geraetId: str(o.geraetId),
    geraetName: str(o.geraetName),
    rufnummerCaller: str(o.rufnummerCaller),
    rufnummerAnzeige: str(o.rufnummerAnzeige),
    tokenGueltig: typeof o.tokenGueltig === 'boolean' ? o.tokenGueltig : null,
    hinweis: str(o.hinweis),
  }
}

export function parseGeraete(json: unknown): TelefonieGeraet[] {
  const items = json && typeof json === 'object' ? (json as { geraete?: unknown }).geraete : null
  if (!Array.isArray(items)) return []
  const out: TelefonieGeraet[] = []
  for (const item of items) {
    if (!item || typeof item !== 'object') continue
    const g = item as Record<string, unknown>
    if (typeof g.id !== 'string' || !g.id) continue
    out.push({
      id: g.id,
      name: typeof g.name === 'string' && g.name ? g.name : g.id,
      typ: typeof g.typ === 'string' ? g.typ : 'unbekannt',
      online: g.online === true,
    })
  }
  return out
}

export function geraetTypLabel(typ: string): string {
  switch (typ) {
    case 'mobile':
      return 'Mobilgerät (z. B. Satellite)'
    case 'register':
      return 'SIP-Telefon / Softphone'
    case 'external':
      return 'Externe Rufnummer'
    case 'app':
      return 'sipgate-App'
    default:
      return 'Gerät'
  }
}

/** Fehlertext aus der Antwort einer Edge Function. Die Funktionen liefern feste deutsche Texte in `fehler`. */
export function fehlerAusAntwort(status: number | null, json: unknown): { meldung: string; code: string | null } {
  const o = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>
  const code = typeof o.code === 'string' ? o.code : null
  if (typeof o.fehler === 'string' && o.fehler) return { meldung: o.fehler, code }
  if (status === 404) return { meldung: 'Der Telefonie-Dienst ist noch nicht eingerichtet.', code: 'dienst_fehlt' }
  if (status === 401) return { meldung: 'Bitte erneut anmelden.', code: 'nicht_angemeldet' }
  if (status === null) return { meldung: 'Der Telefonie-Dienst ist nicht erreichbar. Bitte die Internetverbindung prüfen.', code: 'netzwerk' }
  return { meldung: 'Die Telefonie ist gerade nicht verfügbar. Bitte später erneut versuchen.', code: null }
}

/** Fehler, bei denen der Power Dialer auf den tel:-Link zurueckfallen soll (statt eine Fehlermeldung zu zeigen). */
export function sollAufTelFallen(code: string | null): boolean {
  return code === 'nicht_verbunden' || code === 'dienst_fehlt' || code === 'netzwerk'
}
