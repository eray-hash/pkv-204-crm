// Aufraeumen des Browser-Speichers der frueheren Beispieldaten-Version.
// Betrifft ausschliesslich die unten genannten Schluessel, niemals die Supabase-Sitzung (Schluessel "sb-...").

/** localStorage-Schluessel, unter denen die Beispieldaten des Mockups gespeichert wurden. */
export const ALTE_SPEICHER_SCHLUESSEL = ['pkv-204-crm-data-v1', 'pkv-204-crm-data-v2', 'pkv-204-crm-beispieldaten-v3'] as const

interface Speicher {
  removeItem(key: string): void
}

/** Entfernt die alten Beispieldaten-Schluessel. Gibt zurueck, wie viele Schluessel angefasst wurden (fuer Tests). */
export function raeumeAltbestandAuf(speicher: Speicher | null | undefined): number {
  if (!speicher) return 0
  let n = 0
  for (const key of ALTE_SPEICHER_SCHLUESSEL) {
    try {
      speicher.removeItem(key)
      n++
    } catch {
      // Speicher gesperrt (z. B. privater Modus): nichts zu tun
    }
  }
  return n
}
