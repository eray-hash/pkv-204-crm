// Zeitraum-Filter (Dashboard u. a.): Tagesgrenzen werden in der Anzeige-Zeitzone des Profils berechnet, nicht in der Browser-Zeitzone.
// Reine Logik (per `node --test` pruefbar), Sommerzeit wird ueber Intl beachtet.
import { lokalZuIso, ortszeit, STANDARD_ZEITZONE } from './zeit.ts'

export type ZeitraumArt = 'heute' | 'gestern' | 'letzte7' | 'letzte14' | 'letzte30' | 'diesermonat' | 'letztermonat' | 'alle' | 'custom'

export interface ZeitBereichUtc {
  start: Date
  end: Date
}

export interface ZeitraumErgebnis {
  /** null = kein Filter (alle) oder ungueltige Eingabe (dann steht ein Hinweis in `hinweis`) */
  bereich: ZeitBereichUtc | null
  /** Verstaendlicher Hinweis bei unvollstaendigem/ungueltigem benutzerdefiniertem Bereich */
  hinweis: string | null
}

interface Tag {
  j: number
  m: number
  t: number
}

const p2 = (n: number) => String(n).padStart(2, '0')

function verschiebe(tag: Tag, tage: number): Tag {
  const d = new Date(Date.UTC(tag.j, tag.m - 1, tag.t + tage))
  return { j: d.getUTCFullYear(), m: d.getUTCMonth() + 1, t: d.getUTCDate() }
}

/** Beginn des Kalendertags `tag` in der Zeitzone `tz` (als UTC-Zeitpunkt). */
function tagesbeginn(tag: Tag, tz: string): Date {
  return new Date(lokalZuIso(`${String(tag.j).padStart(4, '0')}-${p2(tag.m)}-${p2(tag.t)}T00:00`, tz) ?? NaN)
}

/** Letzte Millisekunde des Kalendertags `tag` in `tz` (richtig auch an Tagen mit Zeitumstellung: 23 oder 25 Stunden). */
function tagesende(tag: Tag, tz: string): Date {
  return new Date(tagesbeginn(verschiebe(tag, 1), tz).getTime() - 1)
}

const DATUM = /^(\d{4})-(\d{2})-(\d{2})$/

function parseDatum(wert: string): Tag | null {
  const m = DATUM.exec(wert)
  if (!m) return null
  const tag = { j: Number(m[1]), m: Number(m[2]), t: Number(m[3]) }
  const d = new Date(Date.UTC(tag.j, tag.m - 1, tag.t))
  return d.getUTCFullYear() === tag.j && d.getUTCMonth() === tag.m - 1 && d.getUTCDate() === tag.t ? tag : null
}

export function zeitraumBereich(
  art: ZeitraumArt,
  optionen: { jetzt?: Date; tz?: string; custom?: { start: string; end: string } } = {},
): ZeitraumErgebnis {
  const jetzt = optionen.jetzt ?? new Date()
  const tz = optionen.tz || STANDARD_ZEITZONE
  const o = ortszeit(jetzt, tz)
  const heute: Tag = { j: o.jahr, m: o.monat, t: o.tag }
  const ok = (start: Tag, ende: Tag): ZeitraumErgebnis => ({ bereich: { start: tagesbeginn(start, tz), end: tagesende(ende, tz) }, hinweis: null })

  switch (art) {
    case 'heute':
      return ok(heute, heute)
    case 'gestern': {
      const g = verschiebe(heute, -1)
      return ok(g, g)
    }
    case 'letzte7':
      return ok(verschiebe(heute, -6), heute)
    case 'letzte14':
      return ok(verschiebe(heute, -13), heute)
    case 'letzte30':
      return ok(verschiebe(heute, -29), heute)
    case 'diesermonat':
      return ok({ j: heute.j, m: heute.m, t: 1 }, heute)
    case 'letztermonat': {
      const ersterDieses = { j: heute.j, m: heute.m, t: 1 }
      const letzterVorMonat = verschiebe(ersterDieses, -1)
      return ok({ j: letzterVorMonat.j, m: letzterVorMonat.m, t: 1 }, letzterVorMonat)
    }
    case 'custom': {
      const c = optionen.custom
      if (!c?.start || !c.end) return { bereich: null, hinweis: 'Bitte Start- und Enddatum wählen.' }
      const s = parseDatum(c.start)
      const e = parseDatum(c.end)
      if (!s || !e) return { bereich: null, hinweis: 'Bitte gültige Daten wählen.' }
      if (tagesbeginn(e, tz).getTime() < tagesbeginn(s, tz).getTime()) {
        return { bereich: null, hinweis: 'Das Enddatum liegt vor dem Startdatum.' }
      }
      return ok(s, e)
    }
    case 'alle':
    default:
      return { bereich: null, hinweis: null }
  }
}
