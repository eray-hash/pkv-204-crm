// Umschaltlogik fuer das Auge-Symbol an Passwortfeldern (ohne React, per `node --test` pruefbar).
export const STANDARD_SICHTBAR = false

export function umschalten(sichtbar: boolean): boolean {
  return !sichtbar
}

export function eingabeTyp(sichtbar: boolean): 'text' | 'password' {
  return sichtbar ? 'text' : 'password'
}

export function buttonLabel(sichtbar: boolean): 'Passwort verbergen' | 'Passwort anzeigen' {
  return sichtbar ? 'Passwort verbergen' : 'Passwort anzeigen'
}
