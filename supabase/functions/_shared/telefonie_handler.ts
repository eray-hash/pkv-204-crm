// Ablauflogik der beiden Telefonie-Funktionen. Die Datenbank- und Netzwerkzugriffe kommen als "deps" herein,
// dadurch ist alles ohne Supabase/Deno mit `node --test` pruefbar. index.ts verdrahtet nur noch die echten Zugriffe.
import {
  ANBIETER_NEO,
  TelefonieFehler,
  adapterFuer,
  entschluessele,
  parseAnrufenBody,
  parseVerbindenBody,
  leadVergeben,
  pruefeLeadAnrufbar,
  pruefeUebernehmbar,
  pruefeZuweisung,
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
        const geraete = await adapterFuer(anfrage.anbieter).geraete(z, deps.fetch)
        if (geraete.length === 0) {
          return fehlerAntwort(
            new TelefonieFehler('keine_geraete', 'Bei sipgate wurden keine Geräte zu diesem Token gefunden. Bitte das Recht „devices:read“ prüfen.', 422),
          )
        }
        // Nur verschluesselt speichern; das Token geht nie an den Browser zurueck.
        const blob = await verschluessele(z.token, await deps.schluessel(), aadFuer(userId))
        await deps.speichereZugang({
          user_id: userId,
          anbieter: anfrage.anbieter,
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
        if (row.anbieter === ANBIETER_NEO && anfrage.rufnummerCaller) {
          return fehlerAntwort(
            new TelefonieFehler('ungueltige_eingabe', 'Bei sipgate Neo kann keine eigene Rufnummer zum Zurückrufen gewählt werden. Es klingelt das gewählte Gerät.', 400),
          )
        }
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

/** Ergebnis von public.lead_uebernehmen_fuer (Datenbankfunktion; einzige Stelle der Uebernahme-Logik). */
export type UebernahmeErgebnis = 'ok' | 'eigen' | 'vergeben' | 'limit' | 'nicht_uebernehmbar' | 'nicht_gefunden' | 'nicht_angemeldet'

/** Ergebnis von public.anruf_reservieren: Eintrag angelegt (id) oder Limit erreicht (grund). */
export type Reservierung = { id: string } | { grund: string }

export interface AnrufenDeps {
  schluessel: () => Promise<CryptoKey>
  fetch: FetchLike
  jetzt: () => Date
  ladeLead: (leadId: string) => Promise<LeadFuerAnruf | null>
  /** Zeitpunkt der Einwilligung (consent_records.einwilligung_zeit) oder null, wenn es keinen Nachweis gibt */
  einwilligungZeit: (leadId: string) => Promise<string | null>
  /** Zentrale Datenbankpruefung public.darf_angerufen_werden (letzte Instanz; dieselbe Logik wie View und Policies) */
  darfAngerufenWerden: (leadId: string) => Promise<boolean>
  /** Uebernimmt einen freien Lead atomar fuer den Nutzer (public.lead_uebernehmen_fuer, inkl. Obergrenze offener Leads). */
  uebernehmeLead: (leadId: string, userId: string) => Promise<UebernahmeErgebnis | string>
  ladeZugang: (userId: string) => Promise<ZugangRow | null>
  /** Prueft die Limits (pro Lead 1 Anruf je 10 Min., pro Nutzer 30 je Stunde, 3 s Abstand) und legt den Eintrag atomar an. */
  reserviereAnruf: (row: { lead_id: string; user_id: string; kanal: 'mobil'; anbieter: string }) => Promise<Reservierung>
  /** Tragt die Anruf-ID des Anbieters nach. */
  bestaetigeAnruf: (id: string, providerCallId: string | null) => Promise<void>
  /** Entfernt eine reservierte Zeile, wenn der Anruf nicht zustande kam. */
  verwerfeAnruf: (id: string) => Promise<void>
}

// Schutz gegen Doppelklick/parallele Anfragen desselben Nutzers innerhalb einer Instanz (zusaetzlich zu den DB-Limits)
const laufend = new Set<string>()

function limitFehler(grund: string): TelefonieFehler {
  if (grund === 'lead_limit') {
    return new TelefonieFehler('zu_viele_anfragen', 'Dieser Lead wurde gerade erst angerufen. Bitte mindestens 10 Minuten bis zum nächsten Anruf warten.', 429)
  }
  if (grund === 'nutzer_limit') {
    return new TelefonieFehler('zu_viele_anfragen', 'Das Limit von 30 Anrufen pro Stunde ist erreicht. Bitte später weitertelefonieren.', 429)
  }
  return new TelefonieFehler('zu_viele_anfragen', 'Bitte einen Moment warten, bevor der nächste Anruf gestartet wird.', 429)
}

function uebernahmeFehler(ergebnis: string): TelefonieFehler | null {
  switch (ergebnis) {
    case 'ok':
    case 'eigen':
      return null
    case 'vergeben':
      return leadVergeben()
    case 'limit':
      return new TelefonieFehler(
        'lead_limit',
        'Sie haben bereits die maximale Zahl offener eigener Leads. Bitte zuerst Leads abarbeiten oder freigeben.',
        409,
      )
    case 'nicht_uebernehmbar':
      return new TelefonieFehler('lead_gesperrt', 'Dieser Lead kann nicht übernommen werden.', 403)
    case 'nicht_gefunden':
      return new TelefonieFehler('lead_nicht_gefunden', 'Dieser Lead wurde nicht gefunden.', 404)
    default:
      return new TelefonieFehler('intern', 'Unerwarteter Fehler. Bitte später erneut versuchen.', 500)
  }
}

export async function behandleAnrufen(userId: string, rawBody: unknown, deps: AnrufenDeps): Promise<HandlerAntwort> {
  if (laufend.has(userId)) {
    return fehlerAntwort(new TelefonieFehler('zu_viele_anfragen', 'Es läuft bereits ein Anruf. Bitte einen Moment warten.', 429))
  }
  laufend.add(userId)
  try {
    const parsed = parseAnrufenBody(rawBody)
    if (!parsed.ok) return fehlerAntwort(new TelefonieFehler('ungueltige_eingabe', parsed.meldung, 400))
    const { leadId } = parsed.value

    // Die Rufnummer kommt ausschliesslich aus der Datenbank, nie vom Client.
    const lead = await deps.ladeLead(leadId)
    const callee = pruefeLeadAnrufbar(lead, lead ? await deps.einwilligungZeit(lead.id) : null, deps.jetzt())
    if (!lead) throw new TelefonieFehler('lead_nicht_gefunden', 'Dieser Lead wurde nicht gefunden.', 404)

    // Nur freie oder eigene Leads; ein freier Lead nur in uebernehmbaren Status (sonst weist der Geschaeftsfuehrer zu).
    const mussUebernehmen = pruefeZuweisung(lead, userId)
    if (mussUebernehmen) pruefeUebernehmbar(lead)

    // Zentrale Datenbankpruefung als letzte Instanz (gleiche Logik wie die Ansicht anrufbare_leads)
    if (!(await deps.darfAngerufenWerden(lead.id))) {
      throw new TelefonieFehler('lead_gesperrt', 'Dieser Lead darf aktuell nicht angerufen werden.', 403)
    }

    const row = await deps.ladeZugang(userId)
    if (!row || !row.geraet_id) {
      throw new TelefonieFehler('nicht_verbunden', 'Telefonie ist nicht verbunden. Bitte unter Mein Profil → Telefonie einrichten.', 409)
    }
    const z = await zugangsdaten(row, deps)

    // 1. Anruf atomar RESERVIEREN (Limits + Protokollzeile), bevor irgendetwas bei sipgate ausgeloest wird.
    const reservierung = await deps.reserviereAnruf({ lead_id: lead.id, user_id: userId, kanal: 'mobil', anbieter: row.anbieter })
    if ('grund' in reservierung) throw limitFehler(reservierung.grund)
    const reservierungId = reservierung.id

    try {
      // 2. Freien Lead atomar uebernehmen (inkl. Obergrenze); scheitert das, wird die Reservierung zurueckgenommen
      if (mussUebernehmen) {
        const fehler = uebernahmeFehler(await deps.uebernehmeLead(lead.id, userId))
        if (fehler) throw fehler
      }
      // 3. Erst jetzt bei sipgate anrufen
      const { anrufId } = await adapterFuer(row.anbieter).anrufen(
        z,
        { geraetId: row.geraet_id, rufnummerCaller: row.rufnummer_caller, rufnummerAnzeige: row.rufnummer_anzeige, callee },
        deps.fetch,
      )
      // 4. Anruf-ID nachtragen; ein Fehler hier darf das Ergebnis nicht kippen (der Anruf laeuft)
      let protokolliert = true
      try {
        await deps.bestaetigeAnruf(reservierungId, anrufId)
      } catch {
        protokolliert = false
      }
      return { status: 200, body: { ok: true, protokolliert } }
    } catch (e) {
      // Der Anruf kam nicht zustande: die reservierte Zeile wird GELOESCHT (siehe README: das Protokoll zeigt nur wirklich
      // ausgeloeste Anrufe, und gescheiterte Versuche verbrauchen kein Limit).
      try {
        await deps.verwerfeAnruf(reservierungId)
      } catch {
        // schlimmstenfalls bleibt eine Zeile ohne Anbieter-ID stehen; der Originalfehler hat Vorrang
      }
      throw e
    }
  } catch (e) {
    return ausFehler(e)
  } finally {
    laufend.delete(userId)
  }
}
