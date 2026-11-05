// Loest ueber sipgate einen Anruf zu einem Lead aus (Rueckruf: erst klingelt das eigene Geraet, dann wird der Lead verbunden).
// Eingabe: { lead_id } - nie eine Rufnummer. Die Nummer wird hier aus der Datenbank geladen.
// Ablauf (siehe _shared/telefonie_handler.ts): Pruefungen (Einwilligung, Sperre, Status, Rufnummer), Anruf RESERVIEREN
// (Limits, Protokollzeile), freien Lead atomar uebernehmen, erst dann sipgate; bei Fehlern wird die Reservierung geloescht.
import { behandleAnrufen, type ZugangRow } from '../_shared/telefonie_handler.ts'
import { CORS_HEADERS, antwort, bodyOderFehler, dbFehler, dienstClient, nutzerOderFehler, schluessel } from '../_shared/server.ts'

const client = dienstClient()
const SPALTEN = 'user_id, anbieter, token_id, token_verschluesselt, geraet_id, rufnummer_caller, rufnummer_anzeige'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return antwort(405, { ok: false, fehler: 'Nur POST erlaubt' })

  const nutzer = await nutzerOderFehler(req, client)
  if (nutzer instanceof Response) return nutzer
  const userId = nutzer.userId

  const gelesen = await bodyOderFehler(req)
  if (gelesen instanceof Response) return gelesen

  const res = await behandleAnrufen(userId, gelesen.body, {
    schluessel,
    fetch: (url, init) => fetch(url, init),
    jetzt: () => new Date(),
    async ladeLead(leadId) {
      const { data, error } = await client
        .from('leads')
        .select('id, telefon, status, ist_test, zugewiesen_an, gesperrt_am')
        .eq('id', leadId)
        .maybeSingle()
      if (error) dbFehler('Lead laden', error)
      return data ?? null
    },
    async einwilligungZeit(leadId) {
      const { data, error } = await client.from('consent_records').select('einwilligung_zeit').eq('lead_id', leadId).maybeSingle()
      if (error) dbFehler('Einwilligung prüfen', error)
      return (data?.einwilligung_zeit as string | undefined) ?? null
    },
    async darfAngerufenWerden(leadId) {
      const { data, error } = await client.rpc('darf_angerufen_werden', { p_lead_id: leadId })
      if (error) dbFehler('Anrufprüfung', error)
      return data === true
    },
    // Dieselbe Datenbankfunktion wie "Uebernehmen" im Browser (atomar, mit Obergrenze offener eigener Leads)
    async uebernehmeLead(leadId, id) {
      const { data, error } = await client.rpc('lead_uebernehmen_fuer', { p_lead_id: leadId, p_user_id: id })
      if (error) dbFehler('Lead übernehmen', error)
      return String(data)
    },
    async ladeZugang(id) {
      const { data, error } = await client.from('telefonie_zugaenge').select(SPALTEN).eq('user_id', id).maybeSingle()
      if (error) dbFehler('Zugang laden', error)
      return (data as ZugangRow | null) ?? null
    },
    async reserviereAnruf(row) {
      const { data, error } = await client.rpc('anruf_reservieren', {
        p_lead_id: row.lead_id,
        p_user_id: row.user_id,
        p_kanal: row.kanal,
        p_anbieter: row.anbieter,
      })
      if (error) dbFehler('Anruf reservieren', error)
      const zeile = (Array.isArray(data) ? data[0] : data) as { o_id?: string | null; o_grund?: string | null } | undefined
      if (zeile?.o_id) return { id: zeile.o_id }
      return { grund: zeile?.o_grund ?? 'abstand' }
    },
    async bestaetigeAnruf(id, providerCallId) {
      const { error } = await client.from('anrufe').update({ provider_call_id: providerCallId }).eq('id', id)
      if (error) dbFehler('Anruf bestätigen', error)
    },
    async verwerfeAnruf(id) {
      const { error } = await client.from('anrufe').delete().eq('id', id)
      if (error) dbFehler('Anruf verwerfen', error)
    },
  })
  return antwort(res.status, res.body)
})
