// Loest ueber sipgate einen Anruf zu einem Lead aus (Rueckruf: erst klingelt das eigene Geraet, dann wird der Lead verbunden).
// Eingabe: { lead_id } - nie eine Rufnummer. Die Nummer wird hier aus der Datenbank geladen.
import { behandleAnrufen, type ZugangRow } from '../_shared/telefonie_handler.ts'
import { CORS_HEADERS, antwort, dbFehler, dienstClient, leseJson, nutzerIdAusRequest, schluessel } from '../_shared/server.ts'

const client = dienstClient()
const SPALTEN = 'user_id, anbieter, token_id, token_verschluesselt, geraet_id, rufnummer_caller, rufnummer_anzeige'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return antwort(405, { ok: false, fehler: 'Nur POST erlaubt' })

  const userId = await nutzerIdAusRequest(req, client)
  if (!userId) return antwort(401, { ok: false, code: 'nicht_angemeldet', fehler: 'Bitte erneut anmelden.' })

  const body = await leseJson(req)

  const res = await behandleAnrufen(userId, body, {
    schluessel,
    fetch: (url, init) => fetch(url, init),
    jetzt: () => new Date(),
    async ladeLead(leadId) {
      const { data, error } = await client.from('leads').select('id, telefon, status, ist_test').eq('id', leadId).maybeSingle()
      if (error) dbFehler('Lead laden', error)
      return data ?? null
    },
    async hatEinwilligung(leadId) {
      const { data, error } = await client.from('consent_records').select('id').eq('lead_id', leadId).maybeSingle()
      if (error) dbFehler('Einwilligung prüfen', error)
      return Boolean(data)
    },
    async ladeZugang(id) {
      const { data, error } = await client.from('telefonie_zugaenge').select(SPALTEN).eq('user_id', id).maybeSingle()
      if (error) dbFehler('Zugang laden', error)
      return (data as ZugangRow | null) ?? null
    },
    async letzterAnruf(id) {
      const { data, error } = await client
        .from('anrufe')
        .select('gestartet_am')
        .eq('user_id', id)
        .order('gestartet_am', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) dbFehler('Rate-Limit prüfen', error)
      return data?.gestartet_am ?? null
    },
    async speichereAnruf(row) {
      const { error } = await client.from('anrufe').insert(row)
      if (error) dbFehler('Anruf protokollieren', error)
    },
  })
  return antwort(res.status, res.body)
})
