// Pruefung fuer neue Passwoerter (Login-Seite "Passwort festlegen" und Mein Profil → Passwort aendern).
export const MIN_PASSWORT_LAENGE = 8

/** Gibt eine deutsche Fehlermeldung zurueck oder null, wenn die Eingabe gueltig ist. */
export function pruefeNeuesPasswort(passwort: string, wiederholung: string): string | null {
  if (passwort.length < MIN_PASSWORT_LAENGE) return `Das Passwort muss mindestens ${MIN_PASSWORT_LAENGE} Zeichen lang sein.`
  if (passwort !== wiederholung) return 'Die beiden Passwörter stimmen nicht überein.'
  return null
}
