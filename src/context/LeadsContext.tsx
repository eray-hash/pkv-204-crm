import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import {
  fetchLead,
  fetchLeads,
  fetchQueue,
  MAX_LEADS,
  rpcEntsperren,
  rpcFreigeben,
  rpcSperren,
  rpcUebernehmen,
  rpcZuweisen,
  updateLeadRow,
  type VerteilungsErgebnis,
} from '../lib/leadsApi'
import { dialerReihenfolge, fuehreZusammen, mapLeadRow, queueFuerNutzer, upsertLead, type DbLead, type LeadPatch } from '../lib/leads'
import { effektivOnline } from '../lib/praesenz'
import { spieleBenachrichtigungston } from '../lib/ton'
import { useToast } from '../components/ToastContext'
import { useAuth } from './AuthContext'

interface LeadsContextValue {
  /** Alle echten Leads (ohne Testleads), neueste zuerst. Mitarbeiter sehen nur freie und eigene Leads, der Geschaeftsfuehrer alle. */
  leads: DbLead[]
  /** Anrufbare Leads (Ansicht anrufbare_leads) in Dialer-Reihenfolge: faellige Rueckrufe zuerst, dann neue nach Eingang */
  queue: DbLead[]
  loading: boolean
  error: string | null
  /** Fehler nur beim Laden der Anrufliste (Leads-Listen funktionieren dann weiter) */
  queueError: string | null
  /** true, wenn die Live-Verbindung (Realtime) ausgefallen ist; die Daten werden dann haeufiger per Abfrage aktualisiert */
  liveFehler: boolean
  /** Hinweis, wenn nicht alle Leads geladen wurden (Obergrenze) */
  ladeHinweis: string | null
  reload: () => Promise<void>
  /** Aendert einen Lead in der Datenbank. Gibt eine Fehlermeldung oder null zurueck. */
  updateLead: (id: string, patch: LeadPatch) => Promise<string | null>
  /** Uebernimmt einen bereits gespeicherten Lead in die lokalen Listen */
  applyLead: (lead: DbLead) => void
  /** Laedt einen Lead neu aus der Datenbank (z. B. nach einer Verteilungs-Aktion) und uebernimmt ihn in die Listen */
  refreshLead: (id: string) => Promise<DbLead | null>
  /** Lead uebernehmen (atomar, wer zuerst kommt). ok=false ohne Fehler bedeutet: bereits vergeben bzw. nicht uebernehmbar. */
  uebernehmen: (id: string) => Promise<VerteilungsErgebnis>
  freigeben: (id: string) => Promise<VerteilungsErgebnis>
  /** Nur Geschaeftsfuehrer */
  zuweisen: (id: string, userId: string) => Promise<VerteilungsErgebnis>
  /** Widerruf / nicht mehr anrufen (Besitzer oder Geschaeftsfuehrer) */
  sperren: (id: string, grund: string) => Promise<VerteilungsErgebnis>
  /** Nur Geschaeftsfuehrer */
  entsperren: (id: string) => Promise<VerteilungsErgebnis>
}

const LeadsContext = createContext<LeadsContextValue | null>(null)

/** Auch ohne Live-Ereignis regelmaessig nachladen: ein Lead, der jemand anderem zugewiesen wird, wird per Realtime nicht mehr gemeldet. */
const AKTUALISIERUNG_MS = 60_000
const AKTUALISIERUNG_OHNE_LIVE_MS = 30_000
/** Mindestabstand zwischen zwei Komplett-Ladungen durch Fokus/Online-Ereignisse */
const MIN_ABSTAND_MS = 5_000

export function LeadsProvider({ children }: { children: ReactNode }) {
  const { showToast } = useToast()
  const { session, profile } = useAuth()
  const meId = session?.user.id ?? null
  const [leads, setLeads] = useState<DbLead[]>([])
  const [rohQueue, setQueue] = useState<DbLead[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [queueError, setQueueError] = useState<string | null>(null)
  const [liveFehler, setLiveFehler] = useState(false)
  const [ladeHinweis, setLadeHinweis] = useState<string | null>(null)

  // Aktuelle Werte fuer die Realtime-Callbacks (werden nach jedem Rendern nachgefuehrt, nicht waehrend des Renderns)
  const toastRef = useRef(showToast)
  const profilRef = useRef(profile)
  const meRef = useRef(meId)
  useEffect(() => {
    toastRef.current = showToast
    profilRef.current = profile
    meRef.current = meId
  })

  // Reihenfolgezaehler: nur die Antwort der NEUESTEN Abfrage wird uebernommen
  const leadsSeq = useRef(0)
  const queueSeq = useRef(0)
  // Wann wurde ein Lead lokal zuletzt gesetzt (applyLead/Realtime)? Eine aeltere Server-Antwort darf ihn nicht ueberschreiben.
  const lokalGeaendert = useRef(new Map<string, number>())
  const letzteLadung = useRef(0)

  const queue = useMemo(() => dialerReihenfolge(queueFuerNutzer(rohQueue, meId)), [rohQueue, meId])

  const ladeQueue = useCallback(async () => {
    const mein = ++queueSeq.current
    const q = await fetchQueue()
    if (mein !== queueSeq.current) return
    if (q.data) {
      setQueue(q.data)
      setQueueError(null)
    } else {
      setQueueError(q.error ?? 'Die Anrufliste konnte nicht geladen werden.')
    }
  }, [])

  const loadAll = useCallback(async () => {
    const mein = ++leadsSeq.current
    const start = Date.now()
    letzteLadung.current = start
    const [l] = await Promise.all([fetchLeads(), ladeQueue()])
    if (mein !== leadsSeq.current) return
    if (l.error || !l.data) {
      setError(l.error ?? 'Die Leads konnten nicht geladen werden.')
    } else {
      const neu = l.data
      setLeads((prev) => fuehreZusammen(neu, prev, lokalGeaendert.current, start))
      setError(null)
      setLadeHinweis(l.abgeschnitten ? `Es werden nur die neuesten ${MAX_LEADS.toLocaleString('de-DE')} Leads geladen. Ältere Leads fehlen in den Listen.` : null)
    }
    setLoading(false)
  }, [ladeQueue])

  const reload = useCallback(async () => {
    setLoading(true)
    await loadAll()
  }, [loadAll])

  // Erste Ladung
  useEffect(() => {
    void loadAll()
  }, [loadAll])

  // Regelmaessig, beim Zurueckkehren in den Tab und bei wiederkehrender Verbindung komplett nachladen
  useEffect(() => {
    const timer = setInterval(() => void loadAll(), liveFehler ? AKTUALISIERUNG_OHNE_LIVE_MS : AKTUALISIERUNG_MS)
    const nachladen = () => {
      if (Date.now() - letzteLadung.current >= MIN_ABSTAND_MS) void loadAll()
    }
    window.addEventListener('focus', nachladen)
    window.addEventListener('online', nachladen)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', nachladen)
      window.removeEventListener('online', nachladen)
    }
  }, [loadAll, liveFehler])

  // Live-Eingang per Supabase Realtime: Ereignisse werden gezielt eingearbeitet (kein Komplett-Neuladen je Ereignis)
  useEffect(() => {
    let debounce: ReturnType<typeof setTimeout> | undefined
    const planeQueue = () => {
      clearTimeout(debounce)
      debounce = setTimeout(() => void ladeQueue(), 400)
    }
    let warFehler = false
    const channel = supabase
      .channel('leads-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, (payload) => {
        if (payload.eventType === 'DELETE') {
          const id = (payload.old as { id?: string } | null)?.id
          if (id) setLeads((prev) => prev.filter((l) => l.id !== id))
          planeQueue()
          return
        }
        const lead = mapLeadRow(payload.new)
        if (!lead || lead.ist_test) return
        const ich = profilRef.current
        const istGF = ich?.rolle === 'geschaeftsfuehrer'
        // Mitarbeiter sehen nur freie und eigene Leads: gehoert der Lead jetzt jemand anderem, verschwindet er aus der Sicht
        if (!istGF && lead.zugewiesen_an !== null && lead.zugewiesen_an !== meRef.current) {
          setLeads((prev) => prev.filter((l) => l.id !== lead.id))
          planeQueue()
          return
        }
        lokalGeaendert.current.set(lead.id, Date.now())
        setLeads((prev) => upsertLead(prev, lead))
        // Hinweis (Toast und Ton) nur bei neuen, freien Live-Leads und wenn ich effektiv online bin
        if (payload.eventType === 'INSERT' && lead.ist_live && lead.zugewiesen_an === null && ich && effektivOnline(ich, new Date())) {
          toastRef.current(`Neuer Live-Lead: ${lead.name} (${lead.gesellschaft})`)
          spieleBenachrichtigungston()
        }
        planeQueue()
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setLiveFehler(false)
          // nach einem Ausfall verpasste Ereignisse nachholen
          if (warFehler) void loadAll()
          warFehler = false
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          warFehler = true
          setLiveFehler(true)
          console.error('Realtime-Verbindung für Leads gestört:', status)
        }
      })
    return () => {
      clearTimeout(debounce)
      void supabase.removeChannel(channel)
    }
  }, [loadAll, ladeQueue])

  const applyLead = useCallback(
    (lead: DbLead) => {
      lokalGeaendert.current.set(lead.id, Date.now())
      setLeads((prev) => (prev.some((l) => l.id === lead.id) ? prev.map((l) => (l.id === lead.id ? lead : l)) : [lead, ...prev]))
      void ladeQueue()
    },
    [ladeQueue],
  )

  const updateLead = useCallback(
    async (id: string, patch: LeadPatch) => {
      const res = await updateLeadRow(id, patch)
      if (res.error || !res.data) return res.error ?? 'Die Änderung konnte nicht gespeichert werden.'
      applyLead(res.data)
      return null
    },
    [applyLead],
  )

  const refreshLead = useCallback(
    async (id: string) => {
      const res = await fetchLead(id)
      if (res.data) applyLead(res.data)
      else if (!res.error) {
        // nicht mehr sichtbar (z. B. jemand anderem zugewiesen): aus den Listen nehmen
        lokalGeaendert.current.set(id, Date.now())
        setLeads((prev) => prev.filter((l) => l.id !== id))
        void ladeQueue()
      }
      return res.data
    },
    [applyLead, ladeQueue],
  )

  const verteilung = useCallback(
    async (aktion: () => Promise<VerteilungsErgebnis>, id: string) => {
      const res = await aktion()
      // Auch bei ok=false neu laden: so sieht man sofort, wem der Lead jetzt gehoert
      if (!res.fehler) await refreshLead(id)
      return res
    },
    [refreshLead],
  )
  const uebernehmen = useCallback((id: string) => verteilung(() => rpcUebernehmen(id), id), [verteilung])
  const freigeben = useCallback((id: string) => verteilung(() => rpcFreigeben(id), id), [verteilung])
  const zuweisen = useCallback((id: string, userId: string) => verteilung(() => rpcZuweisen(id, userId), id), [verteilung])
  const sperren = useCallback((id: string, grund: string) => verteilung(() => rpcSperren(id, grund), id), [verteilung])
  const entsperren = useCallback((id: string) => verteilung(() => rpcEntsperren(id), id), [verteilung])

  const value = useMemo<LeadsContextValue>(
    () => ({
      leads,
      queue,
      loading,
      error,
      queueError,
      liveFehler,
      ladeHinweis,
      reload,
      updateLead,
      applyLead,
      refreshLead,
      uebernehmen,
      freigeben,
      zuweisen,
      sperren,
      entsperren,
    }),
    [leads, queue, loading, error, queueError, liveFehler, ladeHinweis, reload, updateLead, applyLead, refreshLead, uebernehmen, freigeben, zuweisen, sperren, entsperren],
  )

  return <LeadsContext.Provider value={value}>{children}</LeadsContext.Provider>
}

export function useLeads(): LeadsContextValue {
  const ctx = useContext(LeadsContext)
  if (!ctx) throw new Error('useLeads muss innerhalb von LeadsProvider verwendet werden')
  return ctx
}
