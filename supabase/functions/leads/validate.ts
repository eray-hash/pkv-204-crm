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
}

export type Ergebnis = { ok: true; value: LeadInput } | { ok: false; fehler: Fehler[] }

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const E164 = /^\+[1-9]\d{7,14}$/
const TOLERANZ_MS = 5 * 60 * 1000

export function normalizePhone(raw: string): string | null {
  let s = raw.trim().replace(/\(0\)/g, '').replace(/[\s\-/().]/g, '')
  if (s.startsWith('00')) s = '+' + s.slice(2)
  else if (s.startsWith('0')) s = '+49' + s.slice(1)
  return E164.test(s) ? s : null
}

function text(v: unknown): string | null {
  return typeof v === 'string' ? v.trim() : null
}

function zeit(v: unknown, jetzt: Date): string | null {
  const s = text(v)
  if (!s || !ISO.test(s)) return null
  const t = Date.parse(s)
  if (Number.isNaN(t) || t > jetzt.getTime() + TOLERANZ_MS) return null
  return new Date(t).toISOString()
}

export function validateLead(input: unknown, jetzt: Date = new Date()): Ergebnis {
  const fehler: Fehler[] = []
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>

  const externeId = text(o.lead_id)
  if (!externeId || externeId.length > 100) fehler.push({ feld: 'lead_id', meldung: 'Pflichtfeld, 1 bis 100 Zeichen' })

  const name = text(o.name)
  if (!name || name.length < 2 || name.length > 200) fehler.push({ feld: 'name', meldung: 'Pflichtfeld, 2 bis 200 Zeichen' })

  const telRaw = text(o.telefon)
  const telefon = telRaw ? normalizePhone(telRaw) : null
  if (!telefon) fehler.push({ feld: 'telefon', meldung: 'Pflichtfeld, gueltige Nummer, bevorzugt im Format +49...' })

  const email = text(o.email)
  if (!email || email.length > 254 || !EMAIL.test(email)) fehler.push({ feld: 'email', meldung: 'Pflichtfeld, gueltige E-Mail-Adresse' })

  const gesellschaft = text(o.gesellschaft)
  if (!gesellschaft || gesellschaft.length < 2 || gesellschaft.length > 100) fehler.push({ feld: 'gesellschaft', meldung: 'Pflichtfeld, 2 bis 100 Zeichen' })

  let beitrag: number | null = null
  if (typeof o.tarifbeitrag === 'number') beitrag = o.tarifbeitrag
  else if (typeof o.tarifbeitrag === 'string' && /^\d+(\.\d{1,2})?$/.test(o.tarifbeitrag.trim())) beitrag = Number(o.tarifbeitrag.trim())
  if (beitrag === null || !Number.isFinite(beitrag) || beitrag < 1 || beitrag > 10000) {
    fehler.push({ feld: 'tarifbeitrag', meldung: 'Pflichtfeld, Zahl in Euro zwischen 1 und 10000' })
  }

  const eingangZeit = zeit(o.eingang_zeit, jetzt)
  if (!eingangZeit) fehler.push({ feld: 'eingang_zeit', meldung: 'Pflichtfeld, ISO-8601 mit Zeitzone, nicht in der Zukunft' })

  const einwilligungZeit = zeit(o.einwilligung_zeit, jetzt)
  if (!einwilligungZeit) fehler.push({ feld: 'einwilligung_zeit', meldung: 'Pflichtfeld, ISO-8601 mit Zeitzone, nicht in der Zukunft' })

  const einwilligungText = text(o.einwilligung_text)
  if (!einwilligungText || einwilligungText.length < 20 || einwilligungText.length > 5000) {
    fehler.push({ feld: 'einwilligung_text', meldung: 'Pflichtfeld, genauer Wortlaut, 20 bis 5000 Zeichen' })
  }

  const einwilligungQuelle = text(o.einwilligung_quelle)
  if (!einwilligungQuelle || einwilligungQuelle.length > 500) fehler.push({ feld: 'einwilligung_quelle', meldung: 'Pflichtfeld, bis 500 Zeichen' })

  let einwilligungIp: string | null = null
  if (o.einwilligung_ip !== undefined && o.einwilligung_ip !== null) {
    const ip = text(o.einwilligung_ip)
    if (!ip || !/^[0-9a-fA-F:.]{3,45}$/.test(ip) || !/[.:]/.test(ip)) fehler.push({ feld: 'einwilligung_ip', meldung: 'Ungueltige IP-Adresse' })
    else einwilligungIp = ip
  }

  let quelle: string | null = null
  if (o.quelle !== undefined && o.quelle !== null) {
    const q = text(o.quelle)
    if (q === null || q.length > 100) fehler.push({ feld: 'quelle', meldung: 'Text bis 100 Zeichen' })
    else quelle = q || null
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
    },
  }
}
