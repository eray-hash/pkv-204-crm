// Deno-spezifische Hilfen fuer die Telefonie-Funktionen (nicht unit-getestet, bewusst duenn gehalten).
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { parseSchluessel } from './telefonie.ts'
import { leseJsonBegrenzt, pruefeNutzerToken } from './http.ts'

// Der Browser ruft die Funktionen direkt auf (supabase.functions.invoke). Der Zugriff wird NICHT ueber die
// Herkunft, sondern ueber das Nutzer-JWT geschuetzt (siehe nutzerOderFehler).
export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function antwort(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

export const MAX_BODY_BYTES = 8 * 1024

/** Service-Client: nur serverseitig, der Schluessel kommt aus den Umgebungsvariablen der Funktion. */
export function dienstClient(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })
}

/**
 * Prueft das Nutzer-JWT (Authorization: Bearer <access token>, Schema unabhaengig von Gross-/Kleinschreibung).
 * Liefert die Nutzer-ID oder eine fertige Fehlerantwort (401, bei nicht erreichbarem Auth-Dienst 502; jeweils mit CORS-Headern).
 */
export async function nutzerOderFehler(req: Request, client: SupabaseClient): Promise<{ userId: string } | Response> {
  const r = await pruefeNutzerToken(req.headers.get('authorization'), (token) => client.auth.getUser(token))
  return r.ok ? { userId: r.userId } : antwort(r.status, r.body)
}

/** Liest den JSON-Body mit Groessenlimit (413 schon anhand von Content-Length). Ungueltiges JSON ergibt body = undefined. */
export async function bodyOderFehler(req: Request): Promise<{ body: unknown } | Response> {
  const r = await leseJsonBegrenzt(req, MAX_BODY_BYTES)
  if (!r.ok) {
    return antwort(r.status, { ok: false, code: r.status === 413 ? 'zu_gross' : 'ungueltige_eingabe', fehler: r.status === 413 ? 'Die Anfrage ist zu groß.' : 'Ungültige Anfrage.' })
  }
  return { body: r.body }
}

let schluesselCache: Promise<CryptoKey> | null = null
/** Liest TELEFONIE_KEY (Secret der Funktion) einmal ein. Fehlt er oder ist er ungueltig, gibt es eine feste Fehlermeldung. */
export function schluessel(): Promise<CryptoKey> {
  if (!schluesselCache) {
    schluesselCache = parseSchluessel(Deno.env.get('TELEFONIE_KEY')).catch((e) => {
      schluesselCache = null
      throw e
    })
  }
  return schluesselCache
}

/** Loggt nur den Fehlercode, nie die Meldung von Postgres (sie kann Eingabewerte enthalten). */
export function dbFehler(was: string, error: { code?: string; message?: string }): never {
  console.error(`${was} fehlgeschlagen:`, error.code ?? 'ohne Code')
  throw new Error(was)
}
