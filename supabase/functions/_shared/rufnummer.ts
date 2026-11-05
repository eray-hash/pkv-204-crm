// Rufnummern-Pruefung fuer Lead-Webhook, Anruffunktion und Telefonie-Einstellungen (ohne Deno-APIs, per `node --test` pruefbar).
//
// Regeln (Allowlist): Es werden ausschliesslich deutsche Rufnummern (+49) akzeptiert,
//  - Mobil: 015x, 016x, 017x
//  - Ortsnetz: 02x bis 09x
// Gesperrt sind Mehrwert-/Sondernummern (0900, 0137, 0180, 0700, 0118, 032, 0190, 0800 ...) und jede andere Landesvorwahl.
// Ergebnis ist immer E.164 im Format +49<Nummer ohne fuehrende 0>.

/** Laengen der nationalen Nummer (ohne Landesvorwahl und ohne Trunk-Null) in Ziffern. */
export const MOBIL_LAENGE = { min: 10, max: 11 } as const
export const ORTSNETZ_LAENGE = { min: 7, max: 12 } as const

/** Nationale Praefixe (ohne Trunk-Null) im Bereich 2-9, die gesperrt sind: 032, 0700, 0800, 0900. */
const GESPERRTE_PRAEFIXE = ['32', '700', '800', '900']

export type Rufnummerntyp = 'mobil' | 'ortsnetz'

/** Teil nach "+49" (ohne Trunk-Null) oder null, wenn die Nummer nicht erlaubt ist. */
function nationalerTeil(raw: string): string | null {
  if (/[\u0000-\u001f\u007f]/.test(raw)) return null
  // Zeichen, die in Rufnummern vorkommen duerfen; alles andere (Buchstaben, Steuerzeichen, ...) fuehrt zur Ablehnung
  if (/[^\d\s+\-/().]/.test(raw)) return null
  let s = raw.trim().replace(/\(0\)/g, '').replace(/[\s\-/().]/g, '')
  if (s.startsWith('00')) s = '+' + s.slice(2)
  let national: string
  if (s.startsWith('+')) {
    // Plus darf nur ganz vorne stehen
    if (s.indexOf('+', 1) !== -1) return null
    if (!s.startsWith('+49')) return null
    national = s.slice(3)
    // Trunk-Null nach der Landesvorwahl entfernen (+49 0151 -> +49151)
    if (national.startsWith('0')) national = national.slice(1)
  } else if (s.startsWith('0')) {
    national = s.slice(1)
  } else {
    return null
  }
  if (!/^\d+$/.test(national)) return null
  return national
}

/** Rufnummerntyp einer nationalen Nummer (ohne Trunk-Null) oder null, wenn sie nicht erlaubt ist. */
export function klassifiziere(national: string): Rufnummerntyp | null {
  if (!/^[1-9]\d*$/.test(national)) return null
  if (/^1[567]/.test(national)) {
    return national.length >= MOBIL_LAENGE.min && national.length <= MOBIL_LAENGE.max ? 'mobil' : null
  }
  if (/^[2-9]/.test(national)) {
    if (GESPERRTE_PRAEFIXE.some((p) => national.startsWith(p))) return null
    return national.length >= ORTSNETZ_LAENGE.min && national.length <= ORTSNETZ_LAENGE.max ? 'ortsnetz' : null
  }
  // 01x ausser 015/016/017 (u. a. 0137, 0180, 0190, 0118, 010xx Call-by-Call) und 0 gesperrt
  return null
}

/** Normalisiert zu +49... und prueft die Allowlist. Gibt null zurueck, wenn die Nummer nicht erlaubt ist. */
export function normalisiereDeutscheRufnummer(raw: string): string | null {
  const national = nationalerTeil(raw)
  if (national === null || klassifiziere(national) === null) return null
  return `+49${national}`
}

/** Prueft eine bereits gespeicherte Nummer (Altdaten): muss exakt im Format +49... stehen und die Allowlist bestehen. */
export function istErlaubteRufnummer(nummer: string): boolean {
  if (typeof nummer !== 'string' || !/^\+49[1-9]\d+$/.test(nummer)) return false
  return klassifiziere(nummer.slice(3)) !== null
}
