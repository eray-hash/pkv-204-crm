// Erreichbarkeit der Teammitglieder (reine Logik, ohne React, per `node --test` pruefbar).
import { minutenSeitMitternacht, STANDARD_ZEITZONE } from './zeit.ts'

export interface Erreichbarkeit {
  zeitzone: string
  /** manuell eingeschaltet ("Ich nehme Live-Leads an") */
  online: boolean
  /** automatisch online im Zeitfenster erreichbar_von bis erreichbar_bis (Ortszeit der Person) */
  auto_online: boolean
  /** "HH:MM" oder "HH:MM:SS" (Datenbankformat time) */
  erreichbar_von: string | null
  erreichbar_bis: string | null
}

/** "08:30" oder "08:30:00" -> Minuten seit Mitternacht; ungueltig/leer -> null. */
export function parseUhrzeit(wert: string | null | undefined): number | null {
  if (!wert) return null
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(wert.trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

/**
 * Liegt `jetzt` im Fenster [von, bis)? Auch ueber Mitternacht (z. B. 20:00 bis 06:00).
 * Sind von und bis gleich, gilt das Fenster als leer (nie erreichbar), nicht als ganztaegig.
 */
export function imZeitfenster(jetztMin: number, vonMin: number, bisMin: number): boolean {
  if (vonMin === bisMin) return false
  if (vonMin < bisMin) return jetztMin >= vonMin && jetztMin < bisMin
  return jetztMin >= vonMin || jetztMin < bisMin
}

/** Ist die automatische Erreichbarkeit jetzt aktiv (Ortszeit der Person, Sommerzeit beachtet)? */
export function istImAutoFenster(p: Erreichbarkeit, jetzt: Date): boolean {
  if (!p.auto_online) return false
  const von = parseUhrzeit(p.erreichbar_von)
  const bis = parseUhrzeit(p.erreichbar_bis)
  if (von === null || bis === null) return false
  return imZeitfenster(minutenSeitMitternacht(jetzt, p.zeitzone || STANDARD_ZEITZONE), von, bis)
}

/** Effektiv online = manuell online ODER (automatisch aktiv und aktuell im eigenen Zeitfenster). */
export function effektivOnline(p: Erreichbarkeit, jetzt: Date): boolean {
  return p.online || istImAutoFenster(p, jetzt)
}
