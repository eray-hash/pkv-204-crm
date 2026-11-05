// Ablauf des Lead-Webhooks ohne Deno/Supabase-Abhaengigkeiten (Zugriffe kommen als "deps"), damit er per `node --test` pruefbar ist.
import { bearerToken, leseBegrenzterBody } from '../_shared/http.ts'
import { validateLead } from './validate.ts'
import { normalisiereEingang, type Standardwerte } from './normalisiere.ts'

export const MAX_BODY_BYTES = 16 * 1024

export interface LeadDeps {
  jetzt: () => Date
  /** SHA-256 als Hex (WebCrypto) */
  sha256Hex: (s: string) => Promise<string>
  /** Sucht den aktiven API-Schluessel zum Hash; wirft bei Datenbankfehlern */
  findeKey: (keyHash: string) => Promise<{ id: string; ist_test: boolean; standard?: Standardwerte | null } | null>
  /** Ruft public.ingest_lead auf; liefert das Ergebnis oder den Fehlercode (nie die Fehlermeldung von Postgres) */
  ingest: (params: Record<string, unknown>) => Promise<{ data: { o_lead_id: string; o_neu_angelegt: boolean }[] | null; fehlercode: string | null }>
  /**
   * Nur fuer TEST-Schluessel: bewahrt eine abgelehnte Anfrage unveraendert auf (Anbindung pruefen, wenn der Lieferant die Antwort
   * seines Systems nicht sehen kann). Fehler hier duerfen die Antwort nie veraendern.
   */
  speichereTestEingang?: (eintrag: { api_key_id: string; grund: string; rohtext: string }) => Promise<void>
}

export interface WebhookAntwort {
  status: number
  body: unknown
}

const NICHT_AUTHORISIERT: WebhookAntwort = { status: 401, body: { fehler: 'Schluessel fehlt oder ist falsch' } }
const SERVERFEHLER: WebhookAntwort = { status: 500, body: { fehler: 'Interner Fehler, bitte spaeter erneut senden' } }

/**
 * Postgres-Fehlercodes der Klassen 22 (Datenfehler), 23 (Integritaet/Constraints) und 42 (Format/Typ) sind Fehler der Eingabe:
 * der Lieferant soll sie nicht wiederholen (400). Alles andere ist ein echter Serverfehler (500, Lieferant darf es erneut senden).
 */
/** Protokolliert bei abgelehnten Anfragen NUR die Namen der fehlerhaften Felder (nie Werte), damit Anbindungsfehler im Funktions-Log sichtbar sind. */
function logAbgelehnt(fehler: { feld: string }[]): void {
  console.warn('Lead abgelehnt (400), Felder:', fehler.map((f) => f.feld).join(','))
}

export function istEingabefehler(code: string | null | undefined): boolean {
  return typeof code === 'string' && /^(22|23)/.test(code)
}

/** Die dokumentierten Felder des Webhooks. Nur diese landen im Originalbody (payload_roh); Zusatzfelder werden nicht gespeichert. */
export const BEKANNTE_FELDER = [
  'lead_id',
  'name',
  'telefon',
  'email',
  'gesellschaft',
  'tarifbeitrag',
  'quelle',
  'eingang_zeit',
  'einwilligung_zeit',
  'einwilligung_text',
  'einwilligung_quelle',
  'einwilligung_ip',
  'einwilligung_version',
  'kanal',
  'begunstigter',
  'user_agent',
  'rufnummer_verifiziert',
] as const

/** Reduziert den Originalbody auf die bekannten Felder (Allowlist); "authorization" und beliebige Zusatzfelder fallen automatisch weg. */
export function bereinigeRohbody(body: unknown): unknown {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return body
  const o = body as Record<string, unknown>
  return Object.fromEntries(BEKANNTE_FELDER.filter((k) => k in o).map((k) => [k, o[k]]))
}

export async function behandleLeadAnfrage(req: Request, deps: LeadDeps): Promise<WebhookAntwort> {
  if (req.method !== 'POST') return { status: 405, body: { fehler: 'Nur POST erlaubt' } }

  const token = bearerToken(req.headers.get('authorization'))
  if (!token) return NICHT_AUTHORISIERT

  let key: { id: string; ist_test: boolean; standard?: Standardwerte | null } | null
  try {
    key = await deps.findeKey(await deps.sha256Hex(token))
  } catch {
    return SERVERFEHLER
  }
  if (!key) return NICHT_AUTHORISIERT

  // Content-Length wird vor dem Lesen geprueft; ohne Angabe bricht das Lesen beim Ueberschreiten des Limits ab
  const gelesen = await leseBegrenzterBody(req, MAX_BODY_BYTES)
  if (!gelesen.ok) {
    return gelesen.status === 413
      ? { status: 413, body: { fehler: 'Anfrage zu gross' } }
      : { status: 400, body: { fehler: [{ feld: '(header)', meldung: 'Ungueltiger Content-Length-Header' }] } }
  }

  const merkeTestEingang = async (grund: string) => {
    if (!key.ist_test || !deps.speichereTestEingang) return
    try {
      await deps.speichereTestEingang({ api_key_id: key.id, grund, rohtext: gelesen.text })
    } catch {
      // Die Aufbewahrung ist nur eine Hilfe zur Fehlersuche und darf die Antwort nicht beeinflussen
    }
  }

  let body: unknown
  try {
    body = JSON.parse(gelesen.text)
  } catch {
    await merkeTestEingang('Kein gueltiges JSON')
    logAbgelehnt([{ feld: '(body)' }])
    return { status: 400, body: { fehler: [{ feld: '(body)', meldung: 'Kein gueltiges JSON' }] } }
  }

  const hatStandard = !!key.standard && Object.values(key.standard).some((w) => w !== null && w !== undefined)
  const normalisiert = await normalisiereEingang(body, key.standard, deps.jetzt())
  const result = validateLead(normalisiert, deps.jetzt())
  if (!result.ok) {
    await merkeTestEingang(`Felder: ${result.fehler.map((f) => f.feld).join(',')}`)
    logAbgelehnt(result.fehler)
    return { status: 400, body: { fehler: result.fehler } }
  }
  const v = result.value

  let ergebnis: Awaited<ReturnType<LeadDeps['ingest']>>
  try {
    ergebnis = await deps.ingest({
      p_api_key_id: key.id,
      p_externe_id: v.externeId,
      p_name: v.name,
      p_telefon: v.telefon,
      p_email: v.email,
      p_gesellschaft: v.gesellschaft,
      p_tarifbeitrag: v.tarifbeitrag,
      p_quelle: v.quelle,
      p_eingang_zeit: v.eingangZeit,
      p_einwilligung_zeit: v.einwilligungZeit,
      p_einwilligung_text: v.einwilligungText,
      p_einwilligung_quelle: v.einwilligungQuelle,
      p_einwilligung_ip: v.einwilligungIp,
      p_ist_test: key.ist_test,
      p_text_sha256: await deps.sha256Hex(v.einwilligungText),
      p_payload_roh: hatStandard ? { ...(bereinigeRohbody(normalisiert) as object), _original: body } : bereinigeRohbody(body),
      p_einwilligung_version: v.einwilligungVersion,
      p_kanal: v.kanal,
      p_begunstigter: v.begunstigter,
      p_user_agent: v.userAgent,
      p_rufnummer_verifiziert: v.rufnummerVerifiziert,
    })
  } catch {
    return SERVERFEHLER
  }

  if (ergebnis.fehlercode) {
    // Nur der Fehlercode wird geloggt, nie die Meldung von Postgres (sie kann Eingabewerte enthalten)
    console.error('ingest_lead fehlgeschlagen:', ergebnis.fehlercode)
    if (istEingabefehler(ergebnis.fehlercode)) {
      return { status: 400, body: { fehler: [{ feld: '(daten)', meldung: 'Die Daten wurden abgelehnt. Bitte Format und Inhalt pruefen.' }] } }
    }
    return SERVERFEHLER
  }
  if (!ergebnis.data || ergebnis.data.length === 0) return SERVERFEHLER

  const row = ergebnis.data[0]
  return row.o_neu_angelegt ? { status: 201, body: { id: row.o_lead_id, status: 'angenommen' } } : { status: 200, body: { id: row.o_lead_id, status: 'bereits_vorhanden' } }
}
