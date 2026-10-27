// Verbindet das sipgate-Konto eines Nutzers (Personal Access Token). Aktionen (POST, JSON):
//   { aktion: 'status' }                                  -> verbunden ja/nein, gewaehltes Geraet
//   { aktion: 'verbinden', tokenId, token }               -> Token pruefen, verschluesselt speichern, Geraeteliste zurueck
//   { aktion: 'geraete' }                                 -> Geraeteliste mit dem gespeicherten Token
//   { aktion: 'geraet_waehlen', geraetId, rufnummerCaller?, rufnummerAnzeige? }
//   { aktion: 'trennen' }                                 -> Zugang loeschen
// Das Token wird nie an den Browser zurueckgegeben.
import { behandleVerbinden, type ZugangRow } from '../_shared/telefonie_handler.ts'
import { CORS_HEADERS, antwort, dbFehler, dienstClient, leseJson, nutzerIdAusRequest, schluessel } from '../_shared/server.ts'

const client = dienstClient()
const SPALTEN = 'user_id, anbieter, token_id, token_verschluesselt, geraet_id, rufnummer_caller, rufnummer_anzeige'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return antwort(405, { ok: false, fehler: 'Nur POST erlaubt' })

  const userId = await nutzerIdAusRequest(req, client)
  if (!userId) return antwort(401, { ok: false, code: 'nicht_angemeldet', fehler: 'Bitte erneut anmelden.' })

  const body = await leseJson(req)

  const res = await behandleVerbinden(userId, body, {
    schluessel,
    fetch: (url, init) => fetch(url, init),
    async ladeZugang(id) {
      const { data, error } = await client.from('telefonie_zugaenge').select(SPALTEN).eq('user_id', id).maybeSingle()
      if (error) dbFehler('Zugang laden', error)
      return (data as ZugangRow | null) ?? null
    },
    async speichereZugang(row) {
      const { error } = await client.from('telefonie_zugaenge').upsert(row, { onConflict: 'user_id' })
      if (error) dbFehler('Zugang speichern', error)
    },
    async aktualisiereGeraet(id, felder) {
      const { error } = await client.from('telefonie_zugaenge').update(felder).eq('user_id', id)
      if (error) dbFehler('Gerät speichern', error)
    },
    async loescheZugang(id) {
      const { error } = await client.from('telefonie_zugaenge').delete().eq('user_id', id)
      if (error) dbFehler('Zugang löschen', error)
    },
  })
  return antwort(res.status, res.body)
})
