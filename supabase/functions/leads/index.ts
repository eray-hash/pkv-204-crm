// Webhook, ueber den Lead-Lieferanten Leads einliefern (POST, Authorization: Bearer <API-Schluessel>).
// Der Ablauf steht in handler.ts, die Pruefung der Felder in validate.ts.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { behandleLeadAnfrage } from './handler.ts'

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
})

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req: Request) => {
  const res = await behandleLeadAnfrage(req, {
    jetzt: () => new Date(),
    sha256Hex,
    async findeKey(keyHash) {
      const { data, error } = await supabase.from('api_keys').select('id, ist_test').eq('key_hash', keyHash).eq('aktiv', true).maybeSingle()
      if (error) {
        console.error('api_keys lookup fehlgeschlagen:', error.code ?? '')
        throw new Error('api_keys')
      }
      return data ?? null
    },
    async ingest(params) {
      const { data, error } = await supabase.rpc('ingest_lead', params)
      return { data: (data as { o_lead_id: string; o_neu_angelegt: boolean }[] | null) ?? null, fehlercode: error ? (error.code ?? 'unbekannt') : null }
    },
  })
  return new Response(JSON.stringify(res.body), { status: res.status, headers: { 'Content-Type': 'application/json' } })
})
