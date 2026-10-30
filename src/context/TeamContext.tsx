import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { fetchTeam } from '../lib/profilesApi'
import type { Profile } from '../lib/profil'
import { useAuth } from './AuthContext'

interface TeamContextValue {
  /** Alle Teammitglieder (aus profiles, fuer alle eingeloggten Nutzer lesbar) */
  mitglieder: Profile[]
  loading: boolean
  error: string | null
  /** Name zu einer Nutzer-ID ("Frei" ohne ID, "Unbekannt" wenn nicht gefunden) */
  nameVon: (id: string | null) => string
  reload: () => Promise<void>
  /** Aktuelle Zeit, wird jede halbe Minute aktualisiert (fuer Erreichbarkeit und Ortszeit) */
  jetzt: Date
}

const TeamContext = createContext<TeamContextValue | null>(null)

const AKTUALISIERUNG_MS = 60_000

export function TeamProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth()
  const [mitglieder, setMitglieder] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [jetzt, setJetzt] = useState(() => new Date())

  const reload = useCallback(async () => {
    const res = await fetchTeam()
    if (res.data) {
      setMitglieder(res.data)
      setError(null)
    } else {
      setError(res.error)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void reload()
    // profiles ist nicht in der Realtime-Publikation: regelmaessig und beim Zurueckkehren in den Tab neu laden
    const timer = setInterval(() => void reload(), AKTUALISIERUNG_MS)
    const onFocus = () => void reload()
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [reload])

  useEffect(() => {
    const t = setInterval(() => setJetzt(new Date()), 30_000)
    return () => clearInterval(t)
  }, [])

  // Eigene Aenderungen (z. B. Online-Schalter) sofort in der Liste zeigen
  const eigenes = profile
  const angereichert = useMemo(() => {
    if (!eigenes) return mitglieder
    return mitglieder.some((m) => m.id === eigenes.id) ? mitglieder.map((m) => (m.id === eigenes.id ? eigenes : m)) : [...mitglieder, eigenes]
  }, [mitglieder, eigenes])

  const nameVon = useCallback(
    (id: string | null) => {
      if (!id) return 'Frei'
      return angereichert.find((m) => m.id === id)?.name ?? 'Unbekannt'
    },
    [angereichert],
  )

  const value = useMemo<TeamContextValue>(
    () => ({ mitglieder: angereichert, loading, error, nameVon, reload, jetzt }),
    [angereichert, loading, error, nameVon, reload, jetzt],
  )
  return <TeamContext.Provider value={value}>{children}</TeamContext.Provider>
}

export function useTeam(): TeamContextValue {
  const ctx = useContext(TeamContext)
  if (!ctx) throw new Error('useTeam muss innerhalb von TeamProvider verwendet werden')
  return ctx
}
