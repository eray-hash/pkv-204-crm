// Annahme-Adapter: macht aus dem, was ein Lieferant-System schickt (z. B. Facebook-Lead-Formular ueber ein Zusatzwerkzeug), das Format,
// das validate.ts erwartet. Ergaenzt pro API-Schluessel hinterlegte Standardwerte (Wortlaut, Quelle, SMS-Bestaetigung ...), die bei dem
// Lieferanten bei jedem Lead gleich sind, und versteht gaengige Feldnamen. Prueft NICHTS selbst: das macht danach validateLead.

export interface Standardwerte {
  einwilligung_text?: string | null
  einwilligung_quelle?: string | null
  kanal?: string | null
  begunstigter?: string | null
  rufnummer_verifiziert?: boolean | null
  gesellschaft?: string | null
  /** true: Zeitpunkt der Zustimmung = Zeitpunkt des Absendens (Facebook-Formular) */
  einwilligung_zeit_ist_eingang?: boolean | null
}

const ALIASE: Record<string, string[]> = {
  lead_id: ['lead_id', 'leadid', 'leadgen_id', 'id', 'external_id', 'externe_id'],
  name: ['name', 'full_name', 'fullname', 'vollstaendiger_name', 'vollständiger_name', 'contact_name'],
  vorname: ['first_name', 'firstname', 'vorname'],
  nachname: ['last_name', 'lastname', 'surname', 'nachname'],
  telefon: ['telefon', 'phone', 'phone_number', 'handynummer', 'handy', 'mobile', 'mobil', 'mobile_number', 'telefonnummer', 'tel'],
  email: ['email', 'e_mail', 'email_address', 'e_mail_adresse'],
  gesellschaft: ['gesellschaft', 'versicherung', 'versicherer', 'aktuelle_versicherung', 'krankenversicherung'],
  tarifbeitrag: ['tarifbeitrag', 'beitrag', 'monatsbeitrag', 'aktueller_beitrag', 'monatlicher_beitrag'],
  eingang_zeit: ['eingang_zeit', 'created_time', 'created_at', 'createdtime', 'timestamp', 'submitted_at', 'zeitpunkt'],
  einwilligung_zeit: ['einwilligung_zeit', 'consent_time', 'consent_at'],
  einwilligung_text: ['einwilligung_text', 'consent_text'],
  einwilligung_quelle: ['einwilligung_quelle', 'consent_source'],
  einwilligung_ip: ['einwilligung_ip', 'ip', 'ip_address', 'consent_ip'],
  einwilligung_version: ['einwilligung_version', 'consent_version'],
  kanal: ['kanal', 'channel'],
  begunstigter: ['begunstigter', 'beneficiary'],
  user_agent: ['user_agent', 'useragent'],
  rufnummer_verifiziert: ['rufnummer_verifiziert', 'phone_verified', 'telefon_verifiziert'],
  quelle: ['quelle', 'source', 'campaign', 'campaign_name', 'form_name', 'form_id'],
}

const schluessel = (k: string) => k.toLowerCase().replace(/[^a-z0-9äöüß]+/g, '_').replace(/^_+|_+$/g, '')

/** Macht aus Objekt, {field_data:[{name,values}]} (Facebook), {data|lead|fields:{...}} eine flache Zuordnung Name -> Wert. */
export function flacheFelder(body: unknown): Record<string, unknown> {
  const flach: Record<string, unknown> = {}
  const nimm = (o: unknown, tiefe: number): void => {
    if (!o || typeof o !== 'object' || Array.isArray(o) || tiefe > 2) return
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      if (k === 'field_data' && Array.isArray(v)) {
        for (const f of v) {
          if (f && typeof f === 'object' && typeof (f as { name?: unknown }).name === 'string') {
            const w = (f as { values?: unknown; value?: unknown }).values ?? (f as { value?: unknown }).value
            flach[schluessel((f as { name: string }).name)] = Array.isArray(w) ? w[0] : w
          }
        }
      } else if (v && typeof v === 'object' && !Array.isArray(v)) {
        nimm(v, tiefe + 1)
      } else if (!(schluessel(k) in flach)) {
        flach[schluessel(k)] = v
      }
    }
  }
  nimm(body, 0)
  return flach
}

function erster(flach: Record<string, unknown>, feld: keyof typeof ALIASE): unknown {
  for (const a of ALIASE[feld]) {
    const v = flach[schluessel(a)]
    if (v !== undefined && v !== null && v !== '') return v
  }
  return undefined
}

export function normalisiereTelefon(v: unknown): unknown {
  if (typeof v !== 'string') return v
  let t = v.trim().replace(/^p:/i, '').trim()
  if (/^49\d{9,12}$/.test(t.replace(/[\s()/.-]/g, ''))) t = `+${t.replace(/[\s()/.-]/g, '')}`
  return t
}

export function normalisiereZeit(v: unknown): unknown {
  if (typeof v === 'number' && Number.isFinite(v)) return new Date(v < 1e11 ? v * 1000 : v).toISOString()
  if (typeof v !== 'string') return v
  let t = v.trim()
  if (/^\d{9,13}$/.test(t)) return new Date(Number(t) < 1e11 ? Number(t) * 1000 : Number(t)).toISOString()
  t = t.replace(/^(\d{4}-\d{2}-\d{2}) (\d{2}:)/, '$1T$2')
  t = t.replace(/([+-]\d{2})(\d{2})$/, '$1:$2') // Facebook: +0100 -> +01:00
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(t)) t += 'Z'
  return t
}

export function normalisiereBetrag(v: unknown): unknown {
  if (typeof v !== 'string') return v
  const roh = v.replace(/[^\d.,]/g, '')
  if (!roh) return v
  const t = roh.includes(',') ? roh.replace(/\./g, '').replace(',', '.') : roh
  return Number.isFinite(Number(t)) ? t : v
}

function bool(v: unknown): unknown {
  if (typeof v === 'string') {
    if (/^(true|ja|yes|1)$/i.test(v.trim())) return true
    if (/^(false|nein|no|0)$/i.test(v.trim())) return false
  }
  return v
}

async function kurzHash(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return Array.from(new Uint8Array(buf).slice(0, 8), (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Liefert das Objekt fuer validateLead. Nicht-Objekte (Arrays, Text) bleiben unveraendert, damit validateLead sie wie bisher ablehnt.
 * Fehlt die Lead-Nummer, wird sie aus Telefon, E-Mail und Eingangszeit abgeleitet (gleicher Lead -> gleiche Nummer -> keine Doppelungen).
 */
export async function normalisiereEingang(body: unknown, standard: Standardwerte | null | undefined, jetzt: Date): Promise<unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return body
  const flach = flacheFelder(body)
  const s = standard ?? {}
  const aus: Record<string, unknown> = {}

  const setze = (feld: string, wert: unknown) => {
    if (wert !== undefined && wert !== null && wert !== '') aus[feld] = wert
  }

  const vor = erster(flach, 'vorname')
  const nach = erster(flach, 'nachname')
  setze('name', erster(flach, 'name') ?? ([vor, nach].filter((x) => typeof x === 'string' && x).join(' ') || undefined))
  setze('telefon', normalisiereTelefon(erster(flach, 'telefon')))
  setze('email', erster(flach, 'email'))
  setze('gesellschaft', erster(flach, 'gesellschaft') ?? s.gesellschaft)
  setze('tarifbeitrag', normalisiereBetrag(erster(flach, 'tarifbeitrag')))
  const eingang = normalisiereZeit(erster(flach, 'eingang_zeit') ?? jetzt.toISOString())
  setze('eingang_zeit', eingang)
  setze('einwilligung_zeit', normalisiereZeit(erster(flach, 'einwilligung_zeit')) ?? (s.einwilligung_zeit_ist_eingang ? eingang : undefined))
  setze('einwilligung_text', erster(flach, 'einwilligung_text') ?? s.einwilligung_text)
  setze('einwilligung_quelle', erster(flach, 'einwilligung_quelle') ?? s.einwilligung_quelle)
  setze('einwilligung_ip', erster(flach, 'einwilligung_ip'))
  setze('einwilligung_version', erster(flach, 'einwilligung_version'))
  setze('kanal', erster(flach, 'kanal') ?? s.kanal)
  setze('begunstigter', erster(flach, 'begunstigter') ?? s.begunstigter)
  setze('user_agent', erster(flach, 'user_agent'))
  const verif = erster(flach, 'rufnummer_verifiziert')
  setze('rufnummer_verifiziert', verif !== undefined ? bool(verif) : s.rufnummer_verifiziert)
  setze('quelle', erster(flach, 'quelle'))

  const id = erster(flach, 'lead_id')
  if (id !== undefined && id !== null && id !== '') aus.lead_id = typeof id === 'number' ? String(id) : id
  else if (typeof aus.telefon === 'string' && typeof aus.email === 'string') {
    aus.lead_id = `auto-${await kurzHash(`${aus.telefon}|${aus.email}|${String(aus.eingang_zeit)}`)}`
  }
  return aus
}
