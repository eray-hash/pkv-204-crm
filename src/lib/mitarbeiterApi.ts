// Aufruf der Edge Function "mitarbeiter-passwort" (nur Geschaeftsfuehrer). Das Passwort wird nur gesendet,
// nirgends gespeichert oder geloggt und nie wieder angezeigt.
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { passwortFehlerText } from './passwort'

/** Gibt null bei Erfolg oder eine deutsche Fehlermeldung zurueck. */
export async function setzeVorlaeufigesPasswort(userId: string, passwort: string): Promise<string | null> {
  const { error } = await supabase.functions.invoke('mitarbeiter-passwort', { body: { user_id: userId, passwort } })
  if (!error) return null
  if (error instanceof FunctionsHttpError) {
    let json: unknown = null
    try {
      json = await error.context.json()
    } catch {
      // Antwort ohne JSON (z. B. Gateway-Fehler)
    }
    return passwortFehlerText(error.context.status, json)
  }
  return passwortFehlerText(null, null)
}
