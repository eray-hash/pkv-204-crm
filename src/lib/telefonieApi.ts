// Aufrufe der Edge Functions "telefonie-verbinden" und "anrufen".
// Das sipgate-Token wird nur ueber `telefonieVerbinden` einmalig gesendet und weder gespeichert noch geloggt.
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabase'
import {
  fehlerAusAntwort,
  parseGeraete,
  parseStatus,
  type TelefonieAnbieter,
  type TelefonieGeraet,
  type TelefonieStatus,
} from './telefonie'

export interface ApiErgebnis<T> {
  data: T | null
  error: string | null
  code: string | null
}

async function aufrufen(funktion: string, body: Record<string, unknown>): Promise<{ json: unknown; fehler: { meldung: string; code: string | null } | null }> {
  const { data, error } = await supabase.functions.invoke(funktion, { body })
  if (!error) return { json: data, fehler: null }
  if (error instanceof FunctionsHttpError) {
    let json: unknown = null
    try {
      json = await error.context.json()
    } catch {
      // Antwort ohne JSON (z. B. Gateway-Fehler)
    }
    return { json, fehler: fehlerAusAntwort(error.context.status, json) }
  }
  return { json: null, fehler: fehlerAusAntwort(null, null) }
}

async function verbinden<T>(body: Record<string, unknown>, lesen: (json: unknown) => T | null): Promise<ApiErgebnis<T>> {
  const { json, fehler } = await aufrufen('telefonie-verbinden', body)
  if (fehler) return { data: null, error: fehler.meldung, code: fehler.code }
  const data = lesen(json)
  if (data === null) return { data: null, error: 'Unerwartete Antwort vom Telefonie-Dienst.', code: null }
  return { data, error: null, code: null }
}

/** live=false: schnelle Abfrage ohne Pruefung bei sipgate (z. B. fuer den Power Dialer). */
export const telefonieStatus = (live = true) => verbinden<TelefonieStatus>({ aktion: 'status', live }, parseStatus)

export const telefonieVerbinden = (tokenId: string, token: string, anbieter: TelefonieAnbieter) =>
  verbinden<TelefonieGeraet[]>({ aktion: 'verbinden', anbieter, tokenId, token }, (j) => {
    const g = parseGeraete(j)
    return g.length > 0 ? g : null
  })

export const telefonieGeraete = () =>
  verbinden<TelefonieGeraet[]>({ aktion: 'geraete' }, (j) => {
    const g = parseGeraete(j)
    return g.length > 0 ? g : null
  })

export const telefonieGeraetWaehlen = (geraetId: string, rufnummerCaller: string, rufnummerAnzeige: string) =>
  verbinden<true>({ aktion: 'geraet_waehlen', geraetId, rufnummerCaller, rufnummerAnzeige }, (j) =>
    j && typeof j === 'object' && (j as { ok?: unknown }).ok === true ? true : null,
  )

export const telefonieTrennen = () =>
  verbinden<true>({ aktion: 'trennen' }, (j) => (j && typeof j === 'object' && (j as { ok?: unknown }).ok === true ? true : null))

/** Loest den Anruf bei sipgate aus. Gesendet wird nur die Lead-ID, nie eine Rufnummer. */
export async function anrufenSipgate(leadId: string): Promise<ApiErgebnis<true>> {
  const { json, fehler } = await aufrufen('anrufen', { lead_id: leadId })
  if (fehler) return { data: null, error: fehler.meldung, code: fehler.code }
  if (json && typeof json === 'object' && (json as { ok?: unknown }).ok === true) return { data: true, error: null, code: null }
  return { data: null, error: 'Unerwartete Antwort vom Telefonie-Dienst.', code: null }
}
