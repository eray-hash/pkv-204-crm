import { normalisiereDeutscheRufnummer } from '../_shared/rufnummer.ts'

export type Fehler = { feld: string; meldung: string }

export type LeadInput = {
  externeId: string
  name: string
  telefon: string
  email: string
  gesellschaft: string
  tarifbeitrag: number
  quelle: string | null
  eingangZeit: string
  einwilligungZeit: string
  einwilligungText: string
  einwilligungQuelle: string
  einwilligungIp: string | null
  /** Optionale Zusatzangaben zum Einwilligungsnachweis (alle mit Laengengrenze) */
  einwilligungVersion: string | null
  kanal: string | null
  begunstigter: string | null
  userAgent: string | null
  rufnummerVerifiziert: boolean | null
}

export type Ergebnis = { ok: true; value: LeadInput } | { ok: false; fehler: Fehler[] }

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const STEUERZEICHEN = /[\u0000-\u001f\u007f]/
/** Im Wortlaut der Einwilligung sind Zeilenumbrueche und Tabs erlaubt (echte Texte haben oft Absaetze), alle anderen Steuerzeichen nicht. */
const STEUERZEICHEN_OHNE_UMBRUCH = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/
const UMBRUCH_ERLAUBT = new Set(['einwilligung_text'])
const hatUnzulaessigeZeichen = (key: string, v: string) => (UMBRUCH_ERLAUBT.has(key) ? STEUERZEICHEN_OHNE_UMBRUCH : STEUERZEICHEN).test(v)
const ISO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(Z|[+-]\d{2}:\d{2})$/

const TOLERANZ_MS = 5 * 60 * 1000
/** Ein Lead darf beim Eingang hoechstens so alt sein (Schutz gegen nachgereichte Altbestaende). */
export const MAX_ALTER_EINGANG_MS = 30 * 24 * 60 * 60 * 1000
export const MIN_JAHR = 2000

/** Normalisiert zu +49... und akzeptiert nur deutsche Rufnummern (siehe _shared/rufnummer.ts). */
export function normalizePhone(raw: string): string | null {
  return normalisiereDeutscheRufnummer(raw)
}

function tageImMonat(jahr: number, monat: number): number {
  return new Date(Date.UTC(jahr, monat, 0)).getUTCDate()
}

/** Strenge ISO-8601-Auswertung mit Zeitzone: Roundtrip-Pruefung (kein 31. Februar), Jahr ab 2000. Gibt ms seit 1970 oder null zurueck. */
export function parseIsoZeit(s: string): number | null {
  const m = ISO.exec(s)
  if (!m) return null
  const [jahr, monat, tag, std, min] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5])]
  const sek = m[6] === undefined ? 0 : Number(m[6])
  if (jahr < MIN_JAHR || monat < 1 || monat > 12) return null
  if (tag < 1 || tag > tageImMonat(jahr, monat)) return null
  if (std > 23 || min > 59 || sek > 59) return null
  let offsetMin = 0
  if (m[8] !== 'Z') {
    const oh = Number(m[8].slice(1, 3))
    const om = Number(m[8].slice(4, 6))
    if (oh > 23 || om > 59) return null
    offsetMin = (m[8][0] === '-' ? -1 : 1) * (oh * 60 + om)
  }
  const ms = m[7] ? Math.floor(Number(`0.${m[7]}`) * 1000) : 0
  return Date.UTC(jahr, monat - 1, tag, std, min, sek, ms) - offsetMin * 60_000
}

const IPV4 = /^(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/

export function istIPv4(s: string): boolean {
  return IPV4.test(s)
}

export function istIPv6(s: string): boolean {
  if (!/^[0-9a-fA-F:.]+$/.test(s) || !s.includes(':') || s.includes(':::')) return false
  let rest = s
  // eingebettetes IPv4 am Ende (::ffff:1.2.3.4) zaehlt als zwei Gruppen
  if (s.includes('.')) {
    const letzter = s.lastIndexOf(':')
    if (!istIPv4(s.slice(letzter + 1))) return false
    rest = `${s.slice(0, letzter + 1)}0:0`
  }
  const teile = rest.split('::')
  if (teile.length > 2) return false
  const gruppen = (t: string) => (t === '' ? [] : t.split(':'))
  const links = gruppen(teile[0])
  const rechts = teile.length === 2 ? gruppen(teile[1]) : []
  const alle = [...links, ...rechts]
  if (!alle.every((g) => /^[0-9a-fA-F]{1,4}$/.test(g))) return false
  return teile.length === 2 ? alle.length <= 7 : alle.length === 8
}

export function istIp(s: string): boolean {
  return istIPv4(s) || istIPv6(s)
}

export function validateLead(input: unknown, jetzt: Date = new Date()): Ergebnis {
  const fehler: Fehler[] = []
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>

  /**
   * Liest ein Textfeld: Steuerzeichen (auch Zeilenumbrueche/Tabs) sind in allen Textfeldern unzulaessig.
   * Gibt den getrimmten Text zurueck, null bei falschem Typ oder Steuerzeichen (dann wurde bereits ein Fehler gemeldet, falls `melde`).
   */
  const text = (key: string, melde = true): string | null => {
    const v = o[key]
    if (typeof v !== 'string') return null
    if (hatUnzulaessigeZeichen(key, v)) {
      if (melde) fehler.push({ feld: key, meldung: 'Enthaelt unzulaessige Steuerzeichen' })
      return null
    }
    return v.trim()
  }
  const hatSteuerzeichen = (key: string) => typeof o[key] === 'string' && hatUnzulaessigeZeichen(key, o[key] as string)
  const pflicht = (key: string, meldung: string, ok: (t: string) => boolean): string | null => {
    const t = text(key)
    if (t === null) {
      if (!hatSteuerzeichen(key)) fehler.push({ feld: key, meldung })
      return null
    }
    if (!ok(t)) {
      fehler.push({ feld: key, meldung })
      return null
    }
    return t
  }
  const optional = (key: string, max: number): string | null => {
    const v = o[key]
    if (v === undefined || v === null) return null
    const t = text(key)
    if (t === null) {
      if (!hatSteuerzeichen(key)) fehler.push({ feld: key, meldung: `Text bis ${max} Zeichen` })
      return null
    }
    if (t.length > max) {
      fehler.push({ feld: key, meldung: `Text bis ${max} Zeichen` })
      return null
    }
    return t || null
  }

  const externeId = pflicht('lead_id', 'Pflichtfeld, 1 bis 100 Zeichen', (t) => t.length >= 1 && t.length <= 100)
  const name = pflicht('name', 'Pflichtfeld, 2 bis 200 Zeichen', (t) => t.length >= 2 && t.length <= 200)

  const telRaw = text('telefon')
  const telefon = telRaw ? normalizePhone(telRaw) : null
  if (!telefon && !hatSteuerzeichen('telefon')) {
    fehler.push({ feld: 'telefon', meldung: 'Pflichtfeld, deutsche Rufnummer (+49 ...); Sonder-, Premium- und Auslandsnummern sind nicht zulaessig' })
  }

  const email = pflicht('email', 'Pflichtfeld, gueltige E-Mail-Adresse', (t) => t.length <= 254 && EMAIL.test(t))
  const gesellschaft = pflicht('gesellschaft', 'Pflichtfeld, 2 bis 100 Zeichen', (t) => t.length >= 2 && t.length <= 100)

  let beitrag: number | null = null
  if (typeof o.tarifbeitrag === 'number') beitrag = o.tarifbeitrag
  else if (typeof o.tarifbeitrag === 'string' && /^\d+(\.\d{1,2})?$/.test(o.tarifbeitrag.trim())) beitrag = Number(o.tarifbeitrag.trim())
  if (beitrag === null || !Number.isFinite(beitrag) || beitrag < 1 || beitrag > 10000) {
    fehler.push({ feld: 'tarifbeitrag', meldung: 'Pflichtfeld, Zahl in Euro zwischen 1 und 10000' })
  }

  // Zeitstempel: eingang_zeit nicht aelter als 30 Tage und nicht in der Zukunft (5 Minuten Toleranz);
  // einwilligung_zeit nicht in der Zukunft und hoechstens 5 Minuten nach eingang_zeit.
  const zeitMs = (key: string): number | null => {
    const t = text(key)
    if (t === null) return null
    return parseIsoZeit(t)
  }
  const eingangMs = zeitMs('eingang_zeit')
  let eingangZeit: string | null = null
  if (eingangMs === null) {
    if (!hatSteuerzeichen('eingang_zeit')) fehler.push({ feld: 'eingang_zeit', meldung: 'Pflichtfeld, gueltiger Zeitpunkt (ISO-8601 mit Zeitzone), ab Jahr 2000' })
  } else if (eingangMs > jetzt.getTime() + TOLERANZ_MS) {
    fehler.push({ feld: 'eingang_zeit', meldung: 'Der Zeitpunkt liegt in der Zukunft' })
  } else if (eingangMs < jetzt.getTime() - MAX_ALTER_EINGANG_MS) {
    fehler.push({ feld: 'eingang_zeit', meldung: 'Der Zeitpunkt ist aelter als 30 Tage' })
  } else {
    eingangZeit = new Date(eingangMs).toISOString()
  }

  const einwMs = zeitMs('einwilligung_zeit')
  let einwilligungZeit: string | null = null
  if (einwMs === null) {
    if (!hatSteuerzeichen('einwilligung_zeit')) fehler.push({ feld: 'einwilligung_zeit', meldung: 'Pflichtfeld, gueltiger Zeitpunkt (ISO-8601 mit Zeitzone), ab Jahr 2000' })
  } else if (einwMs > jetzt.getTime() + TOLERANZ_MS) {
    fehler.push({ feld: 'einwilligung_zeit', meldung: 'Der Zeitpunkt liegt in der Zukunft' })
  } else if (eingangMs !== null && einwMs > eingangMs + TOLERANZ_MS) {
    fehler.push({ feld: 'einwilligung_zeit', meldung: 'Die Einwilligung darf nicht nach dem Eingang des Leads liegen' })
  } else {
    einwilligungZeit = new Date(einwMs).toISOString()
  }

  const einwilligungText = pflicht('einwilligung_text', 'Pflichtfeld, genauer Wortlaut, 20 bis 5000 Zeichen', (t) => t.length >= 20 && t.length <= 5000)
  if (einwilligungText && new Set(einwilligungText.replace(/\s/g, '')).size < 5) {
    fehler.push({ feld: 'einwilligung_text', meldung: 'Der Wortlaut wirkt nicht echt (zu wenige verschiedene Zeichen)' })
  }

  const einwilligungQuelle = pflicht('einwilligung_quelle', 'Pflichtfeld, bis 500 Zeichen', (t) => t.length >= 1 && t.length <= 500)

  let einwilligungIp: string | null = null
  if (o.einwilligung_ip !== undefined && o.einwilligung_ip !== null) {
    const ip = text('einwilligung_ip')
    if (ip === null) {
      if (!hatSteuerzeichen('einwilligung_ip')) fehler.push({ feld: 'einwilligung_ip', meldung: 'Ungueltige IP-Adresse' })
    } else if (!istIp(ip)) fehler.push({ feld: 'einwilligung_ip', meldung: 'Ungueltige IP-Adresse (IPv4 oder IPv6)' })
    else einwilligungIp = ip
  }

  const quelle = optional('quelle', 100)
  const einwilligungVersion = optional('einwilligung_version', 100)
  const kanal = optional('kanal', 100)
  const begunstigter = optional('begunstigter', 200)
  const userAgent = optional('user_agent', 500)

  let rufnummerVerifiziert: boolean | null = null
  if (o.rufnummer_verifiziert !== undefined && o.rufnummer_verifiziert !== null) {
    if (typeof o.rufnummer_verifiziert === 'boolean') rufnummerVerifiziert = o.rufnummer_verifiziert
    else fehler.push({ feld: 'rufnummer_verifiziert', meldung: 'true oder false' })
  }

  if (fehler.length > 0) return { ok: false, fehler }

  return {
    ok: true,
    value: {
      externeId: externeId!,
      name: name!,
      telefon: telefon!,
      email: email!,
      gesellschaft: gesellschaft!,
      tarifbeitrag: beitrag!,
      quelle,
      eingangZeit: eingangZeit!,
      einwilligungZeit: einwilligungZeit!,
      einwilligungText: einwilligungText!,
      einwilligungQuelle: einwilligungQuelle!,
      einwilligungIp,
      einwilligungVersion,
      kanal,
      begunstigter,
      userAgent,
      rufnummerVerifiziert,
    },
  }
}
