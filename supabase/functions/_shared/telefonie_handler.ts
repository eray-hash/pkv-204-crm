// Ablauflogik der beiden Telefonie-Funktionen. Die Datenbank- und Netzwerkzugriffe kommen als "deps" herein,
// dadurch ist alles ohne Supabase/Deno mit `node --test` pruefbar. index.ts verdrahtet nur noch die echten Zugriffe.
import {
  ANBIETER_CLASSIC,
  TelefonieFehler,
  adapterFuer,
  entschluessele,
  parseAnrufenBody,
  parseVerbindenBody,
  pruefeLeadAnrufbar,
  pruefeRateLimit,
  verschluessele,
  type FetchLike,
  type Geraet,
  type LeadFuerAnruf,
  type Zugangsdaten,
} from './telefonie.ts'

export interface ZugangRow {
  user_id: string
  anbieter: string
  token_id: string
  token_verschluesselt: string
  geraet_id: string | null
  rufnummer_caller: string | null
  rufnummer_anzeige: string | null
}

export interface HandlerAntwort {
  status: number
  body: Record<string, unknown>
}

function fehlerAntwort(e: TelefonieFehler): HandlerAntwort {
  return { status: e.status, body: { ok: false, code: e.code, fehler: e.message } }
}

/** Wandelt jeden Fehler in eine sichere Antwort um. Unbekannte Fehler liefern nur einen festen Text (nichts aus dem Fehlerobjekt). */
function ausFehler(e: unknown): HandlerAntwort {
  if (e instanceof TelefonieFehler) return fehlerAntwort(e)
  return { status: 500, body: { ok: false, code: 'intern', fehler: 'Unerwarteter Fehler. Bitte später erneut versuchen.' } }
}

const aadFuer = (userId: string) => `telefonie:${userId}`

// ---------- telefonie-verbinden ----------

export interface VerbindenDeps {
  schluessel: () => Promise<CryptoKey>
  fetch: FetchLike
  ladeZugang: (userId: string) => Promise<ZugangRow | null>
  speichereZugang: (row: ZugangRow) => Promise<void>
  aktualisiereGeraet: (userId: string, felder: { geraet_id: string; rufnummer_caller: string | null; rufnummer_anzeige: string | null }) => Promise<void>
  loescheZugang: (userId: string) => Promise<void>
}

async function zugangsdaten(row: ZugangRow, deps: Pick<VerbindenDeps, 'schluessel'>): Promise<Zugangsdaten> {
  const token = await entschluessele(row.token_verschluesselt, await deps.schluessel(), aadFuer(row.user_id))
  return { tokenId: row.token_id, token }
}

function geraeteAnzeige(g: Geraet[]) {
  return g.map((x) => ({ id: x.id, name: x.name, typ: x.typ, online: x.online }))
}

export async function behandleVerbinden(userId: string, rawBody: unknown, deps: VerbindenDeps): Promise<HandlerAntwort> {
  try {
    const parsed = parseVerbindenBody(rawBody)
    if (!parsed.ok) return fehlerAntwort(new TelefonieFehler('ungueltige_eingabe', parsed.meldung, 400))
    const anfrage = parsed.value

    switch (anfrage.aktion) {
      case 'status': {
        const row = await deps.ladeZugang(userId)
        if (!row) return { status: 200, body: { ok: true, verbunden: false, tokenGespeichert: false } }
        const body: Record<string, unknown> = {
          ok: true,
          verbunden: Boolean(row.geraet_id),
          tokenGespeichert: true,
          anbieter: row.anbieter,
          geraetId: row.geraet_id,
          rufnummerCaller: row.rufnummer_caller,
          rufnummerAnzeige: row.rufnummer_anzeige,
        }
        if (!anfrage.live) return { status: 200, body }
        // Live-Pruefung: ist das Token noch gueltig, wie heisst das gewaehlte Geraet? Fehler hier sind nie fatal.
        try {
          const z = await zugangsdaten(row, deps)
          const geraete = await adapterFuer(row.anbieter).geraete(z, deps.fetch)
          body.tokenGueltig = true
          const gewaehlt = geraete.find((g) => g.id === row.geraet_id)
          if (gewaehlt) body.geraetName = gewaehlt.name
          else if (row.geraet_id) body.hinweis = 'Das gewählte Gerät wurde bei sipgate nicht mehr gefunden. Bitte ein Gerät neu auswählen.'
        } catch (e) {
          if (e instanceof TelefonieFehler) {
            body.tokenGueltig = e.code === 'token_ungueltig' || e.code === 'token_unlesbar' || e.code === 'rechte_fehlen' ? false : null
            body.hinweis = e.message
          } else {
            body.tokenGueltig = null
          }
        }
        return { status: 200, body }
      }

      case 'verbinden': {
        const z: Zugangsdaten = { tokenId: anfrage.tokenId, token: anfrage.token }
        const geraete = await adapterFuer(ANBIETER_CLASSIC).geraete(z, deps.fetch)
        if (geraete.length === 0) {
          return fehlerAntwort(
            new TelefonieFehler('keine_geraete', 'Bei sipgate wurden keine Geräte zu diesem Token gefunden. Bitte das Recht „devices:read“ prüfen.', 422),
          )
        }
        // Nur verschluesselt speichern; das Token geht nie an den Browser zurueck.
        const blob = await verschluessele(z.token, await deps.schluessel(), aadFuer(userId))
        await deps.speichereZugang({
          user_id: userId,
          anbieter: ANBIETER_CLASSIC,
          token_id: z.tokenId,
          token_verschluesselt: blob,
          geraet_id: null,
          rufnummer_caller: null,
          rufnummer_anzeige: null,
        })
        return { status: 200, body: { ok: true, geraete: geraeteAnzeige(geraete) } }
      }

      case 'geraete': {
        const row = await deps.ladeZugang(userId)
        if (!row) return fehlerAntwort(new TelefonieFehler('nicht_verbunden', 'Es ist noch kein sipgate-Token hinterlegt.', 409))
        const geraete = await adapterFuer(row.anbieter).geraete(await zugangsdaten(row, deps), deps.fetch)
        return { status: 200, body: { ok: true, geraete: geraeteAnzeige(geraete) } }
      }

      case 'geraet_waehlen': {
        const row = await deps.ladeZugang(userId)
        if (!row) return fehlerAntwort(new TelefonieFehler('nicht_verbunden', 'Es ist noch kein sipgate-Token hinterlegt.', 409))
        const geraete = await adapterFuer(row.anbieter).geraete(await zugangsdaten(row, deps), deps.fetch)
        const gewaehlt = geraete.find((g) => g.id === anfrage.geraetId)
        // Es koennen nur Geraete des eigenen sipgate-Kontos gewaehlt werden.
        if (!gewaehlt) {
          return fehlerAntwort(new TelefonieFehler('geraet_unbekannt', 'Dieses Gerät gehört nicht zu Ihrem sipgate-Konto.', 422))
        }
        await deps.aktualisiereGeraet(userId, {
          geraet_id: gewaehlt.id,
          rufnummer_caller: anfrage.rufnummerCaller,
          rufnummer_anzeige: anfrage.rufnummerAnzeige,
        })
        return { status: 200, body: { ok: true, verbunden: true, geraetId: gewaehlt.id, geraetName: gewaehlt.name } }
      }

      case 'trennen': {
        await deps.loescheZugang(userId)
        return { status: 200, body: { ok: true, verbunden: false } }
      }
    }
  } catch (e) {
    return ausFehler(e)
  }
}

// ---------- anrufen ----------

export interface AnrufenDeps {
  schluessel: () => Promise<CryptoKey>
  fetch: FetchLike
  jetzt: () => Date
  ladeLead: (leadId: string) => Promise<LeadFuerAnruf | null>
  hatEinwilligung: (leadId: string) => Promise<boolean>
  ladeZugang: (userId: string) => Promise<ZugangRow | null>
  letzterAnruf: (userId: string) => Promise<string | null>
  speichereAnruf: (row: { lead_id: string; user_id: string; kanal: 'mobil'; anbieter: string; provider_call_id: string | null }) => Promise<void>
}

// Schutz gegen Doppelklick/parallele Anfragen desselben Nutzers innerhalb einer Instanz
const laufend = new Set<string>()

export async function behandleAnrufen(userId: string, rawBody: unknown, deps: AnrufenDeps): Promise<HandlerAntwort> {
  if (laufend.has(userId)) {
    return fehlerAntwort(new TelefonieFehler('zu_viele_anfragen', 'Es läuft bereits ein Anruf. Bitte einen Moment warten.', 429))
  }
  laufend.add(userId)
  try {
    const parsed = parseAnrufenBody(rawBody)
    if (!parsed.ok) return fehlerAntwort(new TelefonieFehler('ungueltige_eingabe', parsed.meldung, 400))
    const { leadId } = parsed.value

    pruefeRateLimit(await deps.letzterAnruf(userId), deps.jetzt())

    // Die Rufnummer kommt ausschliesslich aus der Datenbank, nie vom Client.
    const lead = await deps.ladeLead(leadId)
    const callee = pruefeLeadAnrufbar(lead, lead ? await deps.hatEinwilligung(lead.id) : false)

    const row = await deps.ladeZugang(userId)
    if (!row || !row.geraet_id) {
      throw new TelefonieFehler('nicht_verbunden', 'Telefonie ist nicht verbunden. Bitte unter Mein Profil → Telefonie einrichten.', 409)
    }
    const z = await zugangsdaten(row, deps)
    const { anrufId } = await adapterFuer(row.anbieter).anrufen(
      z,
      { geraetId: row.geraet_id, rufnummerCaller: row.rufnummer_caller, rufnummerAnzeige: row.rufnummer_anzeige, callee },
      deps.fetch,
    )

    // Der Anruf ist ausgeloest; ein Fehler beim Protokollieren darf das Ergebnis nicht kippen.
    let protokolliert = true
    try {
      await deps.speichereAnruf({ lead_id: leadId, user_id: userId, kanal: 'mobil', anbieter: row.anbieter, provider_call_id: anrufId })
    } catch {
      protokolliert = false
    }
    return { status: 200, body: { ok: true, protokolliert } }
  } catch (e) {
    return ausFehler(e)
  } finally {
    laufend.delete(userId)
  }
}
