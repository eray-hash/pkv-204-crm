// Der Geschaeftsfuehrer legt fuer ein Teammitglied ein vorlaeufiges Passwort fest (ohne E-Mail).
// Eingabe: { user_id, passwort }. Antwort: { ok: true } - das Passwort wird nie zurueckgegeben oder geloggt.
// Aufrufer wird per Nutzer-JWT ermittelt, die Rolle ueber den Service-Client aus `profiles` geprueft.
// Benoetigt kein neues Secret: SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY stellt Supabase der Funktion automatisch bereit.
import { behandlePasswortSetzen } from '../_shared/passwort_handler.ts'
import { CORS_HEADERS, antwort, bodyOderFehler, dienstClient, nutzerOderFehler } from '../_shared/server.ts'

const client = dienstClient()
// Rate-Limit im Speicher der Funktionsinstanz (einfach, bewusst ohne Datenbank)
const letzteAufrufe = new Map<string, number>()

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return antwort(405, { ok: false, fehler: 'Nur POST erlaubt' })

  const nutzer = await nutzerOderFehler(req, client)
  if (nutzer instanceof Response) return nutzer
  const aufruferId = nutzer.userId

  const gelesen = await bodyOderFehler(req)
  if (gelesen instanceof Response) return gelesen

  const res = await behandlePasswortSetzen(aufruferId, gelesen.body, {
    jetzt: () => new Date(),
    letzterAufruf: (id) => letzteAufrufe.get(id) ?? null,
    merkeAufruf: (id, zeit) => void letzteAufrufe.set(id, zeit),
    async ladeRolle(id) {
      const { data, error } = await client.from('profiles').select('rolle').eq('id', id).maybeSingle()
      if (error) {
        console.error('Rolle laden fehlgeschlagen:', error.code ?? '')
        throw new Error('Rolle laden')
      }
      return (data?.rolle as string | undefined) ?? null
    },
    async ladeNutzerInfo(id) {
      const { data, error } = await client.auth.admin.getUserById(id)
      if (error) {
        // "User not found" ist ein erwarteter Fall (404), alles andere ein Fehler
        if (error.status === 404 || /not found/i.test(error.message)) return null
        console.error('Nutzer laden fehlgeschlagen:', error.status ?? '', error.code ?? '')
        throw new Error('Nutzer laden')
      }
      if (!data.user) return null
      const { data: profil } = await client.from('profiles').select('name').eq('id', id).maybeSingle()
      return { email: data.user.email ?? null, name: (profil?.name as string | undefined) ?? null }
    },
    async aktualisiereNutzer(id, attribute) {
      const { error } = await client.auth.admin.updateUserById(id, attribute)
      if (error) {
        // Bewusst nur Status/Code loggen, nie die Meldung oder Eingaben
        console.error('Passwort setzen fehlgeschlagen:', error.status ?? '', error.code ?? '')
        throw new Error('Passwort setzen')
      }
    },
    async protokolliere(eintrag) {
      // Pflicht: ohne Protokollzeile wird das Passwort nicht geaendert (die Tabelle passwort_log kommt mit 20261103000000)
      const { error } = await client.from('passwort_log').insert(eintrag)
      if (error) {
        console.error('Passwort-Protokoll fehlgeschlagen:', error.code ?? '')
        throw new Error('Protokoll')
      }
    },
    async beendeSitzungen(id) {
      const { error } = await client.rpc('nutzer_sitzungen_beenden', { p_user_id: id })
      if (error) {
        console.error('Sitzungen beenden fehlgeschlagen:', error.code ?? '')
        throw new Error('Sitzungen beenden')
      }
    },
  })
  return antwort(res.status, res.body)
})
