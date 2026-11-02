// Ablauflogik der Funktion "mitarbeiter-passwort": Der Geschaeftsfuehrer legt fuer ein Teammitglied ein vorlaeufiges
// Passwort fest (ohne E-Mail). Datenbank- und Auth-Zugriffe kommen als "deps" herein, damit alles ohne Supabase/Deno
// mit `node --test` pruefbar ist.
//
// Sicherheitsregeln: Das Passwort wird nie geloggt, nie zurueckgegeben und taucht in keiner Fehlermeldung auf.
// Es wird ausschliesslich an deps.aktualisiereNutzer weitergereicht.

export const MIN_PASSWORT_LAENGE = 12
/** bcrypt verarbeitet hoechstens 72 Byte. */
export const MAX_PASSWORT_BYTES = 72
export const MIN_ABSTAND_MS = 3000

export interface HandlerAntwort {
  status: number
  body: Record<string, unknown>
}

export interface AuthAktualisierung {
  password: string
  email_confirm: true
  user_metadata: { passwort_wechseln: true }
}

export interface PasswortDeps {
  jetzt: () => Date
  /** Rolle des Aufrufers aus `profiles` (null, wenn es kein Profil gibt) */
  ladeRolle: (userId: string) => Promise<string | null>
  nutzerExistiert: (userId: string) => Promise<boolean>
  /** supabase.auth.admin.updateUserById(userId, attribute); wirft bei Fehlern (ohne das Passwort in der Meldung) */
  aktualisiereNutzer: (userId: string, attribute: AuthAktualisierung) => Promise<void>
  /** Protokollzeile ohne Passwortdaten; Fehler hier duerfen den Vorgang nicht verhindern */
  protokolliere: (eintrag: { gesetzt_von: string; fuer_nutzer: string }) => Promise<void>
  /** Letzter Aufruf des Aufrufers (Zeitpunkt in ms) oder null; merkeAufruf speichert den aktuellen */
  letzterAufruf: (userId: string) => number | null
  merkeAufruf: (userId: string, zeit: number) => void
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function fehler(status: number, code: string, text: string): HandlerAntwort {
  return { status, body: { ok: false, code, fehler: text } }
}

/** Gibt eine deutsche Fehlermeldung zurueck oder null. Der Text enthaelt nie das Passwort. */
export function pruefePasswortRegeln(passwort: unknown): string | null {
  if (typeof passwort !== 'string') return 'Bitte ein Passwort angeben.'
  const bytes = new TextEncoder().encode(passwort).length
  if (passwort.length < MIN_PASSWORT_LAENGE || bytes > MAX_PASSWORT_BYTES) {
    return `Das Passwort muss mindestens ${MIN_PASSWORT_LAENGE} und höchstens ${MAX_PASSWORT_BYTES} Zeichen lang sein.`
  }
  return null
}

export async function behandlePasswortSetzen(aufruferId: string, rawBody: unknown, deps: PasswortDeps): Promise<HandlerAntwort> {
  try {
    // Rate-Limit: hoechstens ein Aufruf je 3 Sekunden und Aufrufer (zaehlt jeden Versuch)
    const jetzt = deps.jetzt().getTime()
    const letzter = deps.letzterAufruf(aufruferId)
    deps.merkeAufruf(aufruferId, jetzt)
    if (letzter !== null && jetzt - letzter < MIN_ABSTAND_MS) {
      return fehler(429, 'zu_viele_anfragen', 'Bitte einen Moment warten und es dann erneut versuchen.')
    }

    // Nur der Geschaeftsfuehrer, noch vor jeder Pruefung der Eingabe
    const rolle = await deps.ladeRolle(aufruferId)
    if (rolle !== 'geschaeftsfuehrer') {
      return fehler(403, 'nicht_erlaubt', 'Nur der Geschäftsführer darf Passwörter festlegen.')
    }

    if (!rawBody || typeof rawBody !== 'object') return fehler(400, 'ungueltige_eingabe', 'Ungültige Anfrage.')
    const b = rawBody as Record<string, unknown>
    const userId = typeof b.user_id === 'string' ? b.user_id.trim() : ''
    if (!UUID.test(userId)) return fehler(400, 'ungueltige_eingabe', 'Bitte ein Teammitglied auswählen.')

    if (userId.toLowerCase() === aufruferId.toLowerCase()) {
      return fehler(400, 'eigene_id', 'Für das eigene Passwort gibt es Mein Profil → Passwort ändern.')
    }

    const regelFehler = pruefePasswortRegeln(b.passwort)
    if (regelFehler) return fehler(400, 'passwort_ungueltig', regelFehler)

    if (!(await deps.nutzerExistiert(userId))) return fehler(404, 'nicht_gefunden', 'Dieses Teammitglied wurde nicht gefunden.')

    await deps.aktualisiereNutzer(userId, {
      password: b.passwort as string,
      email_confirm: true,
      user_metadata: { passwort_wechseln: true },
    })

    try {
      await deps.protokolliere({ gesetzt_von: aufruferId, fuer_nutzer: userId })
    } catch {
      // Protokoll ist optional (z. B. Migration noch nicht eingespielt); das Passwort wurde bereits gesetzt
    }
    return { status: 200, body: { ok: true } }
  } catch {
    // Nichts aus dem Fehlerobjekt weitergeben
    return fehler(500, 'intern', 'Das Passwort konnte nicht gesetzt werden. Bitte später erneut versuchen.')
  }
}
