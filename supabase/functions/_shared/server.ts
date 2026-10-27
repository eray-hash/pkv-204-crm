// Deno-spezifische Hilfen fuer die Telefonie-Funktionen (nicht unit-getestet, bewusst duenn gehalten).
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { parseSchluessel } from './telefonie.ts'

// Der Browser ruft die Funktionen direkt auf (supabase.functions.invoke). Der Zugriff wird NICHT ueber die
// Herkunft, sondern ueber das Nutzer-JWT geschuetzt (siehe nutzerIdAusRequest).
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

/** Prueft das Nutzer-JWT (Authorization: Bearer <access token>) und liefert die Nutzer-ID oder null. */
export async function nutzerIdAusRequest(req: Request, client: SupabaseClient): Promise<string | null> {
  const auth = req.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!token) return null
  const { data, error } = await client.auth.getUser(token)
  if (error || !data.user) return null
  return data.user.id
}

export async function leseJson(req: Request): Promise<unknown> {
  const text = await req.text()
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) return undefined
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
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

export function dbFehler(was: string, error: { message: string }): never {
  console.error(`${was} fehlgeschlagen:`, error.message)
  throw new Error(was)
}
