// Gemeinsame Bausteine fuer die Edge Functions "telefonie-verbinden" und "anrufen".
// Bewusst ohne Deno-APIs (nur WebCrypto und fetch), damit alles mit `node --test` pruefbar ist.
//
// Sicherheitsregeln:
// - Das sipgate-Token verlaesst diesen Code nie in Richtung Browser, Log oder Fehlermeldung.
// - Fehlermeldungen sind feste deutsche Texte; Antworttexte von sipgate werden nicht weitergereicht.

export const SIPGATE_BASE = 'https://api.sipgate.com/v2'
export const ANBIETER_CLASSIC = 'sipgate_classic'
export const ANBIETER_NEO = 'sipgate_neo'
export type Anbieter = typeof ANBIETER_CLASSIC | typeof ANBIETER_NEO

export const SIPGATE_TIMEOUT_MS = 10_000
export const MIN_ABSTAND_ANRUFE_MS = 3_000

export type FehlerCode =
  | 'ungueltige_eingabe'
  | 'nicht_angemeldet'
  | 'token_ungueltig'
  | 'rechte_fehlen'
  | 'guthaben'
  | 'nummer_ungueltig'
  | 'geraet_unbekannt'
  | 'zu_viele_anfragen'
  | 'anbieter_nicht_erreichbar'
  | 'anbieter_fehler'
  | 'nicht_unterstuetzt'
  | 'nicht_verbunden'
  | 'token_unlesbar'
  | 'lead_nicht_gefunden'
  | 'lead_gesperrt'
  | 'keine_einwilligung'
  | 'keine_geraete'
  | 'konfiguration'
  | 'intern'

export class TelefonieFehler extends Error {
  code: FehlerCode
  status: number
  constructor(code: FehlerCode, meldung: string, status: number) {
    super(meldung)
    this.name = 'TelefonieFehler'
    this.code = code
    this.status = status
  }
}

// ---------- Verschluesselung (AES-GCM) ----------

const enc = new TextEncoder()
const dec = new TextDecoder()

export function bytesToBase64(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}

export function base64ToBytes(b64: string): Uint8Array {
  const normalized = b64.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  const s = atob(padded)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

function keyKonfigFehler(): TelefonieFehler {
  return new TelefonieFehler(
    'konfiguration',
    'Die Telefonie ist serverseitig nicht korrekt eingerichtet (Schlüssel fehlt oder ist ungültig). Bitte den Administrator informieren.',
    500,
  )
}

/** Liest den Schluessel aus dem Secret TELEFONIE_KEY: 32 Byte als Hex (64 Zeichen) oder Base64/Base64url. */
export async function parseSchluessel(secret: string | undefined | null): Promise<CryptoKey> {
  const s = (secret ?? '').trim()
  if (!s) throw keyKonfigFehler()
  let bytes: Uint8Array
  try {
    bytes = /^[0-9a-fA-F]{64}$/.test(s) ? hexToBytes(s) : base64ToBytes(s)
  } catch {
    throw keyKonfigFehler()
  }
  if (bytes.length !== 32) throw keyKonfigFehler()
  return await crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

/**
 * Verschluesselt einen Text. `aad` (z. B. die Nutzer-ID) wird mit authentifiziert: Ein Datensatz kann nicht
 * unbemerkt einem anderen Nutzer zugeschoben werden. Format: v1.<iv base64>.<ciphertext+tag base64>
 */
export async function verschluessele(klartext: string, schluessel: CryptoKey, aad: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(aad) }, schluessel, enc.encode(klartext))
  return `v1.${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(ct))}`
}

export async function entschluessele(blob: string, schluessel: CryptoKey, aad: string): Promise<string> {
  const unlesbar = () =>
    new TelefonieFehler(
      'token_unlesbar',
      'Das gespeicherte sipgate-Token kann nicht gelesen werden. Bitte unter Mein Profil → Telefonie neu verbinden.',
      409,
    )
  const teile = blob.split('.')
  if (teile.length !== 3 || teile[0] !== 'v1') throw unlesbar()
  try {
    const iv = base64ToBytes(teile[1])
    const ct = base64ToBytes(teile[2])
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(aad) }, schluessel, ct)
    return dec.decode(pt)
  } catch {
    throw unlesbar()
  }
}

// ---------- Rufnummern und Eingaben ----------

const E164 = /^\+[1-9]\d{7,14}$/

/** Wie beim Lead-Webhook: fuehrende 0 -> +49, 00 -> +. Ergebnis immer im Format +49... (E.164) oder null. */
export function normalisiereRufnummer(raw: string): string | null {
  let s = raw.trim().replace(/\(0\)/g, '').replace(/[\s\-/().]/g, '')
  if (s.startsWith('00')) s = '+' + s.slice(2)
  else if (s.startsWith('0')) s = '+49' + s.slice(1)
  return E164.test(s) ? s : null
}

export type Parse<T> = { ok: true; value: T } | { ok: false; meldung: string }

export type VerbindenAnfrage =
  | { aktion: 'status'; live: boolean }
  | { aktion: 'verbinden'; tokenId: string; token: string }
  | { aktion: 'geraete' }
  | { aktion: 'geraet_waehlen'; geraetId: string; rufnummerCaller: string | null; rufnummerAnzeige: string | null }
  | { aktion: 'trennen' }

const SICHERES_ZEICHEN = /^[\x21-\x7e]+$/ // druckbares ASCII ohne Leerzeichen

function textfeld(v: unknown): string | null {
  return typeof v === 'string' ? v.trim() : null
}

function optionaleRufnummer(v: unknown, label: string): Parse<string | null> {
  if (v === undefined || v === null) return { ok: true, value: null }
  const s = textfeld(v)
  if (s === null) return { ok: false, meldung: `${label}: ungültiger Wert.` }
  if (s === '') return { ok: true, value: null }
  const n = normalisiereRufnummer(s)
  if (!n) return { ok: false, meldung: `${label}: bitte eine gültige Rufnummer eingeben (z. B. +49 151 12345678).` }
  return { ok: true, value: n }
}

export function parseVerbindenBody(raw: unknown): Parse<VerbindenAnfrage> {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  switch (o.aktion) {
    case 'status':
      // live: false ueberspringt die Pruefung bei sipgate (schnell, z. B. fuer den Power Dialer)
      return { ok: true, value: { aktion: 'status', live: o.live !== false } }
    case 'geraete':
    case 'trennen':
      return { ok: true, value: { aktion: o.aktion } }
    case 'verbinden': {
      const tokenId = textfeld(o.tokenId)
      const token = textfeld(o.token)
      if (!tokenId || !SICHERES_ZEICHEN.test(tokenId) || tokenId.includes(':') || tokenId.length > 100) {
        return { ok: false, meldung: 'Bitte die Token-ID eingeben (ohne Leerzeichen).' }
      }
      if (!token || !SICHERES_ZEICHEN.test(token) || token.length > 200) {
        return { ok: false, meldung: 'Bitte das Token eingeben (ohne Leerzeichen).' }
      }
      return { ok: true, value: { aktion: 'verbinden', tokenId, token } }
    }
    case 'geraet_waehlen': {
      const geraetId = textfeld(o.geraetId)
      if (!geraetId || !/^[A-Za-z0-9_-]{1,50}$/.test(geraetId)) return { ok: false, meldung: 'Bitte ein Gerät auswählen.' }
      const caller = optionaleRufnummer(o.rufnummerCaller, 'Eigene Rufnummer')
      if (!caller.ok) return caller
      const anzeige = optionaleRufnummer(o.rufnummerAnzeige, 'Angezeigte Rufnummer')
      if (!anzeige.ok) return anzeige
      return { ok: true, value: { aktion: 'geraet_waehlen', geraetId, rufnummerCaller: caller.value, rufnummerAnzeige: anzeige.value } }
    }
    default:
      return { ok: false, meldung: 'Unbekannte Aktion.' }
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Die Funktion "anrufen" bekommt ausschliesslich eine Lead-ID, nie eine Telefonnummer vom Client. */
export function parseAnrufenBody(raw: unknown): Parse<{ leadId: string }> {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const leadId = textfeld(o.lead_id ?? o.leadId)
  if (!leadId || !UUID.test(leadId)) return { ok: false, meldung: 'Ungültige Lead-ID.' }
  return { ok: true, value: { leadId: leadId.toLowerCase() } }
}

// ---------- Regeln fuer Anrufe ----------

/** Mit diesen Status wird ein Lead nicht (mehr) angerufen. */
export const GESCHLOSSENE_STATUS = ['verstorben', 'nicht_mehr_pkv', 'kein_interesse', 'schon_umgestellt', 'verloren', 'gewonnen']

export interface LeadFuerAnruf {
  id: string
  telefon: string
  status: string
  ist_test: boolean
}

/** Prueft, ob der Lead angerufen werden darf, und gibt die Rufnummer (E.164) zurueck. */
export function pruefeLeadAnrufbar(lead: LeadFuerAnruf | null, hatEinwilligung: boolean): string {
  if (!lead) throw new TelefonieFehler('lead_nicht_gefunden', 'Dieser Lead wurde nicht gefunden.', 404)
  if (lead.ist_test) throw new TelefonieFehler('lead_gesperrt', 'Testleads dürfen nicht angerufen werden.', 403)
  if (GESCHLOSSENE_STATUS.includes(lead.status)) {
    throw new TelefonieFehler('lead_gesperrt', 'Dieser Lead ist abgeschlossen und darf nicht mehr angerufen werden.', 403)
  }
  if (!hatEinwilligung) {
    throw new TelefonieFehler('keine_einwilligung', 'Für diesen Lead liegt kein Einwilligungsnachweis vor. Er darf nicht angerufen werden.', 403)
  }
  const nummer = typeof lead.telefon === 'string' ? lead.telefon.trim() : ''
  if (!E164.test(nummer)) {
    throw new TelefonieFehler('nummer_ungueltig', 'Die Rufnummer dieses Leads ist ungültig und kann nicht gewählt werden.', 422)
  }
  return nummer
}

/** Einfaches Rate-Limit: hoechstens ein Anruf je `mindestAbstandMs` und Nutzer (Grundlage: anrufe.gestartet_am). */
export function pruefeRateLimit(letzterAnrufIso: string | null | undefined, jetzt: Date, mindestAbstandMs = MIN_ABSTAND_ANRUFE_MS): void {
  if (!letzterAnrufIso) return
  const t = Date.parse(letzterAnrufIso)
  if (Number.isNaN(t)) return
  if (jetzt.getTime() - t < mindestAbstandMs) {
    throw new TelefonieFehler('zu_viele_anfragen', 'Bitte einen Moment warten, bevor der nächste Anruf gestartet wird.', 429)
  }
}

// ---------- sipgate (Classic) ----------

export interface Zugangsdaten {
  tokenId: string
  token: string
}

export interface Geraet {
  id: string
  name: string
  typ: string
  online: boolean
}

export interface AnrufZiel {
  /** Geraet, das zuerst klingelt (Rueckruf-Prinzip) */
  geraetId: string
  /** Optional: eigene Rufnummer, die statt des Geraets klingelt (dann wird geraetId als deviceId mitgesendet) */
  rufnummerCaller: string | null
  /** Optional: Rufnummer, die beim Lead angezeigt wird (callerId) */
  rufnummerAnzeige: string | null
  /** Rufnummer des Leads (E.164) */
  callee: string
}

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>

export interface TelefonieAdapter {
  readonly anbieter: Anbieter
  /** Prueft das Token (userinfo) und liest die Geraete des Nutzers (devices:read). */
  geraete(z: Zugangsdaten, f?: FetchLike): Promise<Geraet[]>
  /** Loest den Anruf aus (Rueckruf: erst klingelt das Geraet, dann wird der Lead verbunden). */
  anrufen(z: Zugangsdaten, ziel: AnrufZiel, f?: FetchLike): Promise<{ anrufId: string | null }>
}

type Kontext = 'zugang' | 'geraete' | 'anruf'

/** Bildet HTTP-Status von sipgate auf feste, verstaendliche deutsche Meldungen ab (ohne Details oder Tokenteile). */
export function fehlerAusSipgateStatus(status: number, kontext: Kontext): TelefonieFehler {
  if (status === 401) {
    return new TelefonieFehler(
      'token_ungueltig',
      'Das sipgate-Token ist ungültig oder abgelaufen. Bitte unter app.sipgate.com/personal-access-token ein neues Token anlegen und neu verbinden.',
      422,
    )
  }
  if (status === 403) {
    return kontext === 'anruf'
      ? new TelefonieFehler(
          'rechte_fehlen',
          'sipgate erlaubt diesen Anruf nicht. Bitte prüfen, ob das Token das Recht „sessions:calls:write“ hat und das gewählte Gerät zu Ihrem Konto gehört.',
          422,
        )
      : new TelefonieFehler(
          'rechte_fehlen',
          'Dem sipgate-Token fehlen Rechte. Es werden „devices:read“ und „sessions:calls:write“ benötigt.',
          422,
        )
  }
  if (status === 402) {
    return new TelefonieFehler('guthaben', 'Das sipgate-Guthaben reicht für diesen Anruf nicht aus.', 422)
  }
  if (status === 404) {
    return new TelefonieFehler(
      'geraet_unbekannt',
      'Das gewählte Gerät wurde bei sipgate nicht gefunden. Bitte unter Mein Profil → Telefonie ein Gerät neu auswählen.',
      422,
    )
  }
  if (status === 400) {
    return kontext === 'anruf'
      ? new TelefonieFehler(
          'nummer_ungueltig',
          'sipgate hat die Rufnummer oder das Gerät abgelehnt. Bitte die Rufnummer des Leads und die Auswahl unter Mein Profil → Telefonie prüfen.',
          422,
        )
      : new TelefonieFehler('anbieter_fehler', 'sipgate hat die Anfrage abgelehnt. Bitte später erneut versuchen.', 502)
  }
  if (status === 429) {
    return new TelefonieFehler('zu_viele_anfragen', 'sipgate meldet zu viele Anfragen. Bitte einen Moment warten und erneut versuchen.', 429)
  }
  if (status >= 500) {
    return new TelefonieFehler('anbieter_nicht_erreichbar', 'sipgate ist gerade nicht erreichbar. Bitte später erneut versuchen.', 502)
  }
  return new TelefonieFehler('anbieter_fehler', 'sipgate hat die Anfrage nicht angenommen. Bitte später erneut versuchen.', 502)
}

function nichtErreichbar(): TelefonieFehler {
  return new TelefonieFehler('anbieter_nicht_erreichbar', 'sipgate ist gerade nicht erreichbar. Bitte später erneut versuchen.', 502)
}

function nichtUnterstuetzt(): TelefonieFehler {
  return new TelefonieFehler(
    'nicht_unterstuetzt',
    'sipgate-Neo-Konten werden noch nicht unterstützt. Aktuell funktioniert die Anbindung nur mit sipgate-Classic-Konten.',
    422,
  )
}

function basicAuth(z: Zugangsdaten): string {
  return `Basic ${btoa(`${z.tokenId}:${z.token}`)}`
}

async function sipgateAnfrage(
  z: Zugangsdaten,
  pfad: string,
  kontext: Kontext,
  f: FetchLike,
  init: { method: 'GET' | 'POST'; body?: unknown },
): Promise<unknown> {
  let res: Response
  try {
    res = await f(`${SIPGATE_BASE}${pfad}`, {
      method: init.method,
      headers: {
        Authorization: basicAuth(z),
        Accept: 'application/json',
        ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(SIPGATE_TIMEOUT_MS),
    })
  } catch {
    throw nichtErreichbar()
  }
  if (!res.ok) throw fehlerAusSipgateStatus(res.status, kontext)
  try {
    return await res.json()
  } catch {
    return null
  }
}

/** Request-Body fuer POST /sessions/calls (Classic). Reiner Aufbau, damit er ohne Netzwerk testbar ist. */
export function baueAnrufBody(ziel: AnrufZiel): Record<string, string> {
  const body: Record<string, string> = ziel.rufnummerCaller
    ? // Eigene Rufnummer klingelt zuerst; dann ist deviceId Pflicht (siehe sipgate-Doku)
      { deviceId: ziel.geraetId, caller: ziel.rufnummerCaller, callee: ziel.callee }
    : // Das Geraet selbst klingelt zuerst (caller = Geraete-ID, z. B. "m0")
      { caller: ziel.geraetId, callee: ziel.callee }
  if (ziel.rufnummerAnzeige) body.callerId = ziel.rufnummerAnzeige
  return body
}

export const sipgateClassic: TelefonieAdapter = {
  anbieter: ANBIETER_CLASSIC,

  async geraete(z, f = fetch) {
    const info = await sipgateAnfrage(z, '/authorization/userinfo', 'zugang', f, { method: 'GET' })
    const o = (info && typeof info === 'object' ? info : {}) as Record<string, unknown>
    if (typeof o.sub !== 'string' || !o.sub) {
      throw new TelefonieFehler('anbieter_fehler', 'sipgate hat keine Nutzerkennung geliefert. Bitte später erneut versuchen.', 502)
    }
    // Annahme: Neo-Konten sind an einer "neo"-Domain in userinfo erkennbar (Classic: z. B. "sipgate.de")
    if (typeof o.domain === 'string' && /neo/i.test(o.domain)) throw nichtUnterstuetzt()

    const data = await sipgateAnfrage(z, `/${encodeURIComponent(o.sub)}/devices`, 'geraete', f, { method: 'GET' })
    const items = (data && typeof data === 'object' ? (data as { items?: unknown }).items : null) ?? []
    if (!Array.isArray(items)) return []
    const geraete: Geraet[] = []
    for (const item of items) {
      if (!item || typeof item !== 'object') continue
      const d = item as Record<string, unknown>
      if (typeof d.id !== 'string' || !d.id) continue
      geraete.push({
        id: d.id,
        name: typeof d.alias === 'string' && d.alias.trim() ? d.alias.trim() : d.id,
        typ: typeof d.type === 'string' ? d.type.toLowerCase() : 'unbekannt',
        online: d.online === true,
      })
    }
    return geraete
  },

  async anrufen(z, ziel, f = fetch) {
    const res = await sipgateAnfrage(z, '/sessions/calls', 'anruf', f, { method: 'POST', body: baueAnrufBody(ziel) })
    const sessionId = res && typeof res === 'object' ? (res as { sessionId?: unknown }).sessionId : null
    return { anrufId: typeof sessionId === 'string' && sessionId ? sessionId : null }
  },
}

// Neo ist bewusst noch nicht umgesetzt (dort heisst der Aufruf POST /calls mit anderen Feldern).
export const sipgateNeo: TelefonieAdapter = {
  anbieter: ANBIETER_NEO,
  geraete() {
    return Promise.reject(nichtUnterstuetzt())
  },
  anrufen() {
    return Promise.reject(nichtUnterstuetzt())
  },
}

export function adapterFuer(anbieter: string): TelefonieAdapter {
  if (anbieter === ANBIETER_CLASSIC) return sipgateClassic
  if (anbieter === ANBIETER_NEO) return sipgateNeo
  throw nichtUnterstuetzt()
}
