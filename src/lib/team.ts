// Team-Kennzahlen, die sich aus der Datenbank ableiten lassen (reine Logik, per `node --test` pruefbar).
import type { DbLead } from './leads.ts'

export interface TeamZeile {
  userId: string
  /** Anzahl Anrufe aus der Tabelle "anrufe"; null, wenn sie nicht geladen werden konnten */
  anrufe: number | null
  zugewiesen: number
  terminVereinbart: number
  gewonnen: number
}

/** Zaehlt je Teammitglied die zugewiesenen Leads (gesamt, Status termin_vereinbart, Status gewonnen). */
export function teamZeilen(userIds: string[], leads: DbLead[], anrufe: Record<string, number> | null): TeamZeile[] {
  return userIds.map((userId) => {
    const eigene = leads.filter((l) => l.zugewiesen_an === userId && !l.ist_test)
    return {
      userId,
      anrufe: anrufe ? (anrufe[userId] ?? 0) : null,
      zugewiesen: eigene.length,
      terminVereinbart: eigene.filter((l) => l.status === 'termin_vereinbart').length,
      gewonnen: eigene.filter((l) => l.status === 'gewonnen').length,
    }
  })
}

export function summeTeam(zeilen: TeamZeile[]): Omit<TeamZeile, 'userId'> {
  const hatAnrufe = zeilen.length > 0 && zeilen.every((z) => z.anrufe !== null)
  return {
    anrufe: hatAnrufe ? zeilen.reduce((s, z) => s + (z.anrufe ?? 0), 0) : null,
    zugewiesen: zeilen.reduce((s, z) => s + z.zugewiesen, 0),
    terminVereinbart: zeilen.reduce((s, z) => s + z.terminVereinbart, 0),
    gewonnen: zeilen.reduce((s, z) => s + z.gewonnen, 0),
  }
}
