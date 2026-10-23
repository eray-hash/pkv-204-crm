import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { fetchLeads, fetchQueue, updateLeadRow } from '../lib/leadsApi'
import { mapLeadRow, type DbLead, type LeadPatch } from '../lib/leads'
import { useToast } from '../components/ToastContext'

interface LeadsContextValue {
  /** Alle echten Leads (ohne Testleads), neueste zuerst */
  leads: DbLead[]
  /** Anrufbare Leads aus der Datenbank-Ansicht anrufbare_leads, neueste zuerst */
  queue: DbLead[]
  loading: boolean
  error: string | null
  /** Fehler nur beim Laden der Anrufliste (Leads-Listen funktionieren dann weiter) */
  queueError: string | null
  reload: () => Promise<void>
  /** Aendert einen Lead in der Datenbank. Gibt eine Fehlermeldung oder null zurueck. */
  updateLead: (id: string, patch: LeadPatch) => Promise<string | null>
  /** Uebernimmt einen bereits gespeicherten Lead in die lokalen Listen */
  applyLead: (lead: DbLead) => void
}

const LeadsContext = createContext<LeadsContextValue | null>(null)

const QUEUE_REFRESH_MS = 60_000

export function LeadsProvider({ children }: { children: ReactNode }) {
  const { showToast } = useToast()
  const [leads, setLeads] = useState<DbLead[]>([])
  const [queue, setQueue] = useState<DbLead[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [queueError, setQueueError] = useState<string | null>(null)

  const toastRef = useRef(showToast)
  toastRef.current = showToast

  const loadAll = useCallback(async () => {
    const [l, q] = await Promise.all([fetchLeads(), fetchQueue()])
    if (l.error || !l.data) {
      setError(l.error ?? 'Die Leads konnten nicht geladen werden.')
    } else {
      setLeads(l.data)
      setError(null)
    }
    if (q.data) {
      setQueue(q.data)
      setQueueError(null)
    } else {
      setQueueError(q.error ?? 'Die Anrufliste konnte nicht geladen werden.')
    }
    setLoading(false)
  }, [])

  const loadQueue = useCallback(async () => {
    const q = await fetchQueue()
    if (q.data) {
      setQueue(q.data)
      setQueueError(null)
    }
  }, [])

  const reload = useCallback(async () => {
    setLoading(true)
    await loadAll()
  }, [loadAll])

  // Erste Ladung
  useEffect(() => {
    void loadAll()
  }, [loadAll])

  // Anrufliste regelmaessig aktualisieren (Wiedervorlagezeiten wie "in 2 Stunden" werden mit der Zeit faellig)
  useEffect(() => {
    const timer = setInterval(() => void loadQueue(), QUEUE_REFRESH_MS)
    const onFocus = () => void loadQueue()
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [loadQueue])

  // Live-Eingang: neue Leads (und Aenderungen anderer Nutzer) per Supabase Realtime
  useEffect(() => {
    let debounce: ReturnType<typeof setTimeout> | undefined
    const planeNeuladen = () => {
      clearTimeout(debounce)
      debounce = setTimeout(() => void loadAll(), 400)
    }
    const channel = supabase
      .channel('leads-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          const neu = mapLeadRow(payload.new)
          if (neu && neu.ist_test) return
          if (neu && neu.ist_live) toastRef.current(`Neuer Live-Lead: ${neu.name} (${neu.gesellschaft})`)
        }
        planeNeuladen()
      })
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('Realtime-Verbindung für Leads fehlgeschlagen:', status)
        }
      })
    return () => {
      clearTimeout(debounce)
      void supabase.removeChannel(channel)
    }
  }, [loadAll])

  const applyLead = useCallback(
    (lead: DbLead) => {
      setLeads((prev) => prev.map((l) => (l.id === lead.id ? lead : l)))
      void loadQueue()
    },
    [loadQueue],
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

  const value = useMemo<LeadsContextValue>(
    () => ({ leads, queue, loading, error, queueError, reload, updateLead, applyLead }),
    [leads, queue, loading, error, queueError, reload, updateLead, applyLead],
  )

  return <LeadsContext.Provider value={value}>{children}</LeadsContext.Provider>
}

export function useLeads(): LeadsContextValue {
  const ctx = useContext(LeadsContext)
  if (!ctx) throw new Error('useLeads muss innerhalb von LeadsProvider verwendet werden')
  return ctx
}
