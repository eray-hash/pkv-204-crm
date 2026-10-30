// Anrufzahlen je Nutzer aus der Tabelle "anrufe" (lesbar fuer alle eingeloggten Nutzer, siehe RLS-Policy anrufe_select).
import { supabase } from './supabase'

/** Liefert { userId: Anzahl } oder null, wenn das Laden fehlschlaegt. */
export async function ladeAnrufzahlen(userIds: string[]): Promise<Record<string, number> | null> {
  try {
    const ergebnisse = await Promise.all(
      userIds.map(async (id) => {
        const { count, error } = await supabase.from('anrufe').select('id', { count: 'exact', head: true }).eq('user_id', id)
        if (error) throw error
        return [id, count ?? 0] as const
      }),
    )
    return Object.fromEntries(ergebnisse)
  } catch (e) {
    console.error('Anrufzahlen laden fehlgeschlagen', e)
    return null
  }
}
