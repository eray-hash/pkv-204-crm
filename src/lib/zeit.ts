// Zeit- und Zeitzonen-Hilfen (reine Logik, ohne React, per `node --test` pruefbar).
// Alle Berechnungen laufen ueber Intl (IANA-Zeitzonen inkl. Sommerzeit), nie ueber feste Stundenversaetze.

export const STANDARD_ZEITZONE = 'Europe/Berlin'

export function istGueltigeZeitzone(tz: string | null | undefined): tz is string {
  if (!tz) return false
  try {
    new Intl.DateTimeFormat('de-DE', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

export interface Ortszeit {
  jahr: number
  monat: number
  tag: number
  stunde: number
  minute: number
  sekunde: number
}

/** Wanduhr-Zeit eines Zeitpunkts in der angegebenen Zeitzone (ungueltige Zone -> Europe/Berlin). */
export function ortszeit(date: Date, tz: string): Ortszeit {
  const zone = istGueltigeZeitzone(tz) ? tz : STANDARD_ZEITZONE
  const teile = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date)
  const w = (typ: string) => Number(teile.find((t) => t.type === typ)?.value ?? '0')
  return { jahr: w('year'), monat: w('month'), tag: w('day'), stunde: w('hour') % 24, minute: w('minute'), sekunde: w('second') }
}

export function minutenSeitMitternacht(date: Date, tz: string): number {
  const o = ortszeit(date, tz)
  return o.stunde * 60 + o.minute
}

/** Abstand der Zeitzone zu UTC in Millisekunden zum angegebenen Zeitpunkt (inkl. Sommerzeit). */
export function zonenOffsetMs(date: Date, tz: string): number {
  const o = ortszeit(date, tz)
  const alsUtc = Date.UTC(o.jahr, o.monat - 1, o.tag, o.stunde, o.minute, o.sekunde)
  return alsUtc - Math.floor(date.getTime() / 1000) * 1000
}

const LOKAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/

/** Wert eines datetime-local-Feldes ("2026-10-25T08:30"), als Ortszeit in `tz` gemeint, -> UTC-ISO-Zeitpunkt. */
export function lokalZuIso(wert: string, tz: string): string | null {
  const m = LOKAL.exec(wert)
  if (!m) return null
  const zone = istGueltigeZeitzone(tz) ? tz : STANDARD_ZEITZONE
  const [j, mo, t, h, mi] = m.slice(1).map(Number)
  const raten = Date.UTC(j, mo - 1, t, h, mi)
  const offset1 = zonenOffsetMs(new Date(raten), zone)
  let ergebnis = raten - offset1
  const offset2 = zonenOffsetMs(new Date(ergebnis), zone)
  if (offset2 !== offset1) ergebnis = raten - offset2
  return new Date(ergebnis).toISOString()
}

/** UTC-ISO-Zeitpunkt -> Wert fuer ein datetime-local-Feld in der Zeitzone `tz`. */
export function isoZuLokal(iso: string | Date, tz: string): string {
  const o = ortszeit(typeof iso === 'string' ? new Date(iso) : iso, tz)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${String(o.jahr).padStart(4, '0')}-${p(o.monat)}-${p(o.tag)}T${p(o.stunde)}:${p(o.minute)}`
}

/** "Morgen um `stunde` Uhr" in der Zeitzone `tz` als Wert fuer ein datetime-local-Feld. */
export function morgenFrueh(jetzt: Date, tz: string, stunde = 9): string {
  const o = ortszeit(jetzt, tz)
  const t = new Date(Date.UTC(o.jahr, o.monat - 1, o.tag + 1, stunde, 0))
  const p = (n: number) => String(n).padStart(2, '0')
  return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())}T${p(t.getUTCHours())}:${p(t.getUTCMinutes())}`
}

/** "HH:MM" der Ortszeit in der Zeitzone. */
export function formatOrtszeit(date: Date, tz: string): string {
  const o = ortszeit(date, tz)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(o.stunde)}:${p(o.minute)}`
}

// ---------- Anzeige-Zeitzone des eingeloggten Nutzers ----------

let anzeigeZeitzone: string | undefined

/** Setzt die Zeitzone, in der alle Zeitstempel angezeigt werden (undefined = Zeitzone des Browsers). */
export function setAnzeigeZeitzone(tz: string | null | undefined): void {
  anzeigeZeitzone = istGueltigeZeitzone(tz) ? tz : undefined
}

export function getAnzeigeZeitzone(): string | undefined {
  return anzeigeZeitzone
}

/** Zeitzone fuer Eingabefelder: die gewaehlte Anzeige-Zeitzone, sonst die des Browsers. */
export function eingabeZeitzone(): string {
  return anzeigeZeitzone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? STANDARD_ZEITZONE
}

/** Auswahl fuer die Zeitzonen-Liste: Intl.supportedValuesOf, immer inkl. Europe/Berlin und Asia/Bangkok. */
export function zeitzonenListe(): string[] {
  let liste: string[] = []
  try {
    const f = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf
    if (f) liste = f('timeZone')
  } catch {
    liste = []
  }
  const menge = new Set(liste)
  for (const pflicht of ['Europe/Berlin', 'Asia/Bangkok', 'UTC']) menge.add(pflicht)
  return [...menge].filter(istGueltigeZeitzone).sort((a, b) => a.localeCompare(b))
}
