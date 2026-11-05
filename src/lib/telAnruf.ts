// Gemeinsamer Ablauf fuer Anrufe ueber die Telefon-App (tel:) im Power Dialer und im Lead-Detail (reine Logik, per `node --test` pruefbar):
// freien Lead uebernehmen, Anruf protokollieren, erst danach wird gewaehlt. Wird eine Stufe abgelehnt, wird NICHT gewaehlt.
import type { AnrufKanal, DbLead } from './leads.ts'

export interface TelAnrufDeps {
  meId: string | null
  /** Atomare Uebernahme (rpc lead_uebernehmen): ok=false = vergeben/nicht uebernehmbar, fehler = technische/deutsche Fehlermeldung */
  uebernehmen: (leadId: string) => Promise<{ ok: boolean; fehler: string | null }>
  refreshLead: (leadId: string) => Promise<DbLead | null>
  /** Protokolliert den Anruf; liefert eine deutsche Fehlermeldung, wenn die Datenbank ablehnt */
  logAnruf: (leadId: string, userId: string, kanal: AnrufKanal) => Promise<string | null>
}

export type TelAnrufErgebnis = { ok: true; uebernommen: boolean } | { ok: false; meldung: string }

export async function bereiteTelAnrufVor(lead: Pick<DbLead, 'id' | 'zugewiesen_an'>, kanal: AnrufKanal, deps: TelAnrufDeps): Promise<TelAnrufErgebnis> {
  if (!deps.meId) return { ok: false, meldung: 'Bitte erneut anmelden.' }
  let uebernommen = false
  if (lead.zugewiesen_an !== deps.meId) {
    if (lead.zugewiesen_an !== null) return { ok: false, meldung: 'Dieser Lead wird bereits von jemand anderem bearbeitet.' }
    const res = await deps.uebernehmen(lead.id)
    if (res.fehler) return { ok: false, meldung: res.fehler }
    if (res.ok) uebernommen = true
    else {
      // ok=false: vergeben oder (selten) schon mein Lead
      const neu = await deps.refreshLead(lead.id)
      if (!neu || neu.zugewiesen_an !== deps.meId) {
        return { ok: false, meldung: 'Dieser Lead wurde inzwischen von jemand anderem übernommen oder kann nicht übernommen werden.' }
      }
    }
  }
  const err = await deps.logAnruf(lead.id, deps.meId, kanal)
  if (err) return { ok: false, meldung: err }
  return { ok: true, uebernommen }
}
