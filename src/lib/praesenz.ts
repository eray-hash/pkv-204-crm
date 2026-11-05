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

export interface SchalterZustand {
  /** Der Schalter zeigt immer den EFFEKTIVEN Zustand (manuell oder automatisch online) */
  an: boolean
  modus: 'manuell' | 'automatisch' | 'aus'
  /** Aenderung, die ein Klick bewirkt: Einschalten = manuell online; Ausschalten = manuell offline UND, falls gerade nur das automatische Fenster online haelt, die Automatik aus */
  klickPatch: { online?: boolean; auto_online?: boolean }
  /** Erklaerung fuer Tooltip und Hinweis */
  hinweis: string
}

/** Eindeutiger Zustand des Kopf-Schalters "Ich nehme Live-Leads an" (kein Widerspruch zwischen Anzeige und Wirkung). */
export function schalterZustand(p: Erreichbarkeit, jetzt: Date): SchalterZustand {
  const imFenster = istImAutoFenster(p, jetzt)
  if (p.online) {
    return {
      an: true,
      modus: 'manuell',
      klickPatch: imFenster ? { online: false, auto_online: false } : { online: false },
      hinweis: imFenster
        ? 'Online (manuell). Ausschalten beendet auch die automatische Erreichbarkeit; wieder aktivieren unter Mein Profil → Erreichbarkeit.'
        : 'Online (manuell). Zum Ausschalten klicken.',
    }
  }
  if (imFenster) {
    return {
      an: true,
      modus: 'automatisch',
      klickPatch: { online: false, auto_online: false },
      hinweis: 'Online (automatisch durch Ihr Zeitfenster). Ausschalten beendet die automatische Erreichbarkeit; wieder aktivieren unter Mein Profil → Erreichbarkeit.',
    }
  }
  return { an: false, modus: 'aus', klickPatch: { online: true }, hinweis: 'Offline. Zum Online-Schalten klicken.' }
}
