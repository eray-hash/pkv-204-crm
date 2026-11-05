// HTTP-Hilfen fuer die Edge Functions (nur Web-Standard-APIs, ohne Deno, per `node --test` pruefbar).

/** Liest das Token aus "Authorization: Bearer <token>"; das Schema ist laut RFC 7235 nicht von Gross-/Kleinschreibung abhaengig. */
export function bearerToken(header: string | null | undefined): string {
  const m = /^bearer[ \t]+(\S.*)$/i.exec((header ?? '').trim())
  return m ? m[1].trim() : ''
}

export type BodyErgebnis = { ok: true; text: string } | { ok: false; status: 413 | 400 }

/**
 * Liest den Body mit Groessenlimit. Ein zu grosses Content-Length wird abgelehnt, BEVOR gelesen wird;
 * ohne oder mit falschem Content-Length (z. B. chunked) wird beim Lesen abgebrochen, sobald das Limit ueberschritten ist.
 */
export async function leseBegrenzterBody(req: Request, maxBytes: number): Promise<BodyErgebnis> {
  const laenge = req.headers.get('content-length')
  if (laenge !== null) {
    const n = Number(laenge)
    if (!Number.isFinite(n) || n < 0) return { ok: false, status: 400 }
    if (n > maxBytes) return { ok: false, status: 413 }
  }
  if (!req.body) return { ok: true, text: '' }
  const reader = req.body.getReader()
  const teile: Uint8Array[] = []
  let gesamt = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    gesamt += value.byteLength
    if (gesamt > maxBytes) {
      await reader.cancel().catch(() => undefined)
      return { ok: false, status: 413 }
    }
    teile.push(value)
  }
  const alles = new Uint8Array(gesamt)
  let pos = 0
  for (const t of teile) {
    alles.set(t, pos)
    pos += t.byteLength
  }
  return { ok: true, text: new TextDecoder().decode(alles) }
}

export type JsonErgebnis = { ok: true; body: unknown } | { ok: false; status: 413 | 400 }

/** Body lesen und als JSON parsen. Ungueltiges JSON liefert body = undefined (die Handler melden dann 400), zu gross 413. */
export async function leseJsonBegrenzt(req: Request, maxBytes: number): Promise<JsonErgebnis> {
  const r = await leseBegrenzterBody(req, maxBytes)
  if (!r.ok) return r
  try {
    return { ok: true, body: JSON.parse(r.text) }
  } catch {
    return { ok: true, body: undefined }
  }
}

export interface GetUserErgebnis {
  data: { user: { id: string } | null } | null
  error: { status?: number; name?: string } | null
}

export type NutzerErgebnis =
  | { ok: true; userId: string }
  | { ok: false; status: 401 | 502; body: { ok: false; code: string; fehler: string } }

/**
 * Prueft das Nutzer-JWT. Ein ungueltiges oder fehlendes Token liefert 401, ein nicht erreichbarer Auth-Dienst (Netzwerkfehler,
 * Timeout, 5xx) liefert 502 statt eines unbehandelten Fehlers.
 */
export async function pruefeNutzerToken(authHeader: string | null | undefined, getUser: (token: string) => Promise<GetUserErgebnis>): Promise<NutzerErgebnis> {
  const nichtAngemeldet: NutzerErgebnis = { ok: false, status: 401, body: { ok: false, code: 'nicht_angemeldet', fehler: 'Bitte erneut anmelden.' } }
  const token = bearerToken(authHeader)
  if (!token) return nichtAngemeldet
  try {
    const { data, error } = await getUser(token)
    if (error) {
      const technisch = error.name === 'AuthRetryableFetchError' || (typeof error.status === 'number' && (error.status === 0 || error.status >= 500))
      if (technisch) throw new Error('auth nicht erreichbar')
      return nichtAngemeldet
    }
    if (!data?.user) return nichtAngemeldet
    return { ok: true, userId: data.user.id }
  } catch {
    return {
      ok: false,
      status: 502,
      body: { ok: false, code: 'auth_nicht_erreichbar', fehler: 'Die Anmeldung kann gerade nicht geprüft werden. Bitte später erneut versuchen.' },
    }
  }
}
