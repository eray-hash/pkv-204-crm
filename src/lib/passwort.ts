// Pruefung fuer neue Passwoerter (Login-Seite "Passwort festlegen" und Mein Profil → Passwort aendern).
export const MIN_PASSWORT_LAENGE = 8

/** Gibt eine deutsche Fehlermeldung zurueck oder null, wenn die Eingabe gueltig ist. */
export function pruefeNeuesPasswort(passwort: string, wiederholung: string): string | null {
  if (passwort.length < MIN_PASSWORT_LAENGE) return `Das Passwort muss mindestens ${MIN_PASSWORT_LAENGE} Zeichen lang sein.`
  if (passwort !== wiederholung) return 'Die beiden Passwörter stimmen nicht überein.'
  return null
}

// ---------- Vorlaeufiges Passwort fuer ein Teammitglied (nur Geschaeftsfuehrer) ----------
export const MIN_VORLAEUFIG_LAENGE = 12
/** bcrypt verarbeitet hoechstens 72 Byte (Umlaute zaehlen mehrfach). */
export const MAX_VORLAEUFIG_BYTES = 72

export function pruefeVorlaeufigesPasswort(passwort: string, wiederholung: string): string | null {
  const bytes = new TextEncoder().encode(passwort).length
  if (passwort.length < MIN_VORLAEUFIG_LAENGE) return `Das Passwort muss mindestens ${MIN_VORLAEUFIG_LAENGE} Zeichen lang sein.`
  if (bytes > MAX_VORLAEUFIG_BYTES) return `Das Passwort ist zu lang (höchstens ${MAX_VORLAEUFIG_BYTES} Zeichen, Umlaute zählen doppelt).`
  if (passwort !== wiederholung) return 'Die beiden Passwörter stimmen nicht überein.'
  return null
}

/** Fehlertext aus der Antwort der Funktion "mitarbeiter-passwort" (sie liefert feste deutsche Texte in `fehler`). Enthaelt nie das Passwort. */
export function passwortFehlerText(status: number | null, json: unknown): string {
  const o = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>
  if (typeof o.fehler === 'string' && o.fehler) return o.fehler
  if (status === null) return 'Keine Verbindung zum Server. Bitte die Internetverbindung prüfen.'
  if (status === 401) return 'Bitte erneut anmelden.'
  if (status === 404) return 'Die Funktion „Passwort festlegen“ ist noch nicht eingerichtet.'
  return 'Das Passwort konnte nicht gesetzt werden. Bitte später erneut versuchen.'
}
