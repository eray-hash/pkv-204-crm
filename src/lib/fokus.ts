// Fokus-Falle fuer Dialoge (reine Logik, per `node --test` pruefbar).

/**
 * Welches Element soll beim Tabulatorschritt den Fokus bekommen? `index` = aktuell fokussiertes Element in der Liste der
 * fokussierbaren Elemente (-1 = Fokus ausserhalb der Liste), `anzahl` = Laenge der Liste, `umschalt` = Shift gedrueckt.
 * Gibt null zurueck, wenn der Browser normal weiterspringen darf, sonst den Zielindex (am Rand wird umgebrochen).
 */
export function fokusFalleZiel(index: number, anzahl: number, umschalt: boolean): number | null {
  if (anzahl <= 0) return null
  if (index < 0 || index >= anzahl) return umschalt ? anzahl - 1 : 0
  if (!umschalt && index === anzahl - 1) return 0
  if (umschalt && index === 0) return anzahl - 1
  return null
}
