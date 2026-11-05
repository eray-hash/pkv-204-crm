// Ablauf des Lead-Webhooks ohne Deno/Supabase-Abhaengigkeiten (Zugriffe kommen als "deps"), damit er per `node --test` pruefbar ist.
import { bearerToken, leseBegrenzterBody } from '../_shared/http.ts'
import { validateLead } from './validate.ts'

export const MAX_BODY_BYTES = 16 * 1024

export interface LeadDeps {
  jetzt: () => Date
  /** SHA-256 als Hex (WebCrypto) */
  sha256Hex: (s: string) => Promise<string>
  /** Sucht den aktiven API-Schluessel zum Hash; wirft bei Datenbankfehlern */
  findeKey: (keyHash: string) => Promise<{ id: string; ist_test: boolean } | null>
  /** Ruft public.ingest_lead auf; liefert das Ergebnis oder den Fehlercode (nie die Fehlermeldung von Postgres) */
  ingest: (params: Record<string, unknown>) => Promise<{ data: { o_lead_id: string; o_neu_angelegt: boolean }[] | null; fehlercode: string | null }>
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
export function istEingabefehler(code: string | null | undefined): boolean {
  return typeof code === 'string' && /^(22|23)/.test(code)
}

/** Entfernt Schluessel "authorization" (beliebige Schreibweise) aus dem Originalbody, bevor er als Nachweis gespeichert wird. */
export function bereinigeRohbody(body: unknown): unknown {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return body
  return Object.fromEntries(Object.entries(body as Record<string, unknown>).filter(([k]) => k.toLowerCase() !== 'authorization'))
}

export async function behandleLeadAnfrage(req: Request, deps: LeadDeps): Promise<WebhookAntwort> {
  if (req.method !== 'POST') return { status: 405, body: { fehler: 'Nur POST erlaubt' } }

  const token = bearerToken(req.headers.get('authorization'))
  if (!token) return NICHT_AUTHORISIERT

  let key: { id: string; ist_test: boolean } | null
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

  let body: unknown
  try {
    body = JSON.parse(gelesen.text)
  } catch {
    return { status: 400, body: { fehler: [{ feld: '(body)', meldung: 'Kein gueltiges JSON' }] } }
  }

  const result = validateLead(body, deps.jetzt())
  if (!result.ok) return { status: 400, body: { fehler: result.fehler } }
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
      p_payload_roh: bereinigeRohbody(body),
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
