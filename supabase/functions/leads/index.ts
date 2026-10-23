import { createClient } from 'jsr:@supabase/supabase-js@2'
import { validateLead } from './validate.ts'

const MAX_BODY_BYTES = 16 * 1024

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
})

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json(405, { fehler: 'Nur POST erlaubt' })

  const auth = req.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!token) return json(401, { fehler: 'Schluessel fehlt oder ist falsch' })

  const { data: key, error: keyError } = await supabase
    .from('api_keys')
    .select('id, ist_test')
    .eq('key_hash', await sha256Hex(token))
    .eq('aktiv', true)
    .maybeSingle()
  if (keyError) {
    console.error('api_keys lookup failed', keyError.message)
    return json(500, { fehler: 'Interner Fehler, bitte spaeter erneut senden' })
  }
  if (!key) return json(401, { fehler: 'Schluessel fehlt oder ist falsch' })

  const raw = await req.text()
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) return json(413, { fehler: 'Anfrage zu gross' })

  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return json(400, { fehler: [{ feld: '(body)', meldung: 'Kein gueltiges JSON' }] })
  }

  const result = validateLead(body)
  if (!result.ok) return json(400, { fehler: result.fehler })
  const v = result.value

  const { data, error } = await supabase.rpc('ingest_lead', {
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
  })
  if (error || !data || data.length === 0) {
    console.error('ingest_lead failed', error?.message)
    return json(500, { fehler: 'Interner Fehler, bitte spaeter erneut senden' })
  }

  const row = data[0] as { o_lead_id: string; o_neu_angelegt: boolean }
  return row.o_neu_angelegt
    ? json(201, { id: row.o_lead_id, status: 'angenommen' })
    : json(200, { id: row.o_lead_id, status: 'bereits_vorhanden' })
})
