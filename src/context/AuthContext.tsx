import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, supabaseKonfiguriert } from '../lib/supabase'
import { mapAuthError } from '../lib/authErrors'
import { fetchProfil, updateErreichbarkeit, type ErreichbarkeitPatch } from '../lib/profilesApi'
import type { Profile, Rolle } from '../lib/profil'
import { setAnzeigeZeitzone } from '../lib/zeit'

export type { Rolle, Profile }

interface AuthContextValue {
  session: Session | null
  profile: Profile | null
  /** true, solange die gespeicherte Sitzung geprueft bzw. das Profil geladen wird */
  loading: boolean
  /** Fehler beim Laden des Profils (z. B. kein Profil vorhanden) */
  profileError: string | null
  /** true, wenn der Nutzer ueber einen Link zum Zuruecksetzen des Passworts gekommen ist */
  recovery: boolean
  signIn: (email: string, password: string) => Promise<string | null>
  signOut: () => Promise<void>
  sendPasswordReset: (email: string) => Promise<string | null>
  updatePassword: (password: string) => Promise<string | null>
  /** Speichert Zeitzone/Erreichbarkeit des eigenen Profils. Gibt eine Fehlermeldung oder null zurueck. */
  updateProfil: (patch: ErreichbarkeitPatch) => Promise<string | null>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [sessionChecked, setSessionChecked] = useState(!supabaseKonfiguriert)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [recovery, setRecovery] = useState(false)

  // Sitzung wiederherstellen und auf Aenderungen hoeren (Login, Logout, Token-Erneuerung)
  useEffect(() => {
    if (!supabaseKonfiguriert) return
    let aktiv = true
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!aktiv) return
        setSession(data.session)
        setSessionChecked(true)
      })
      .catch(() => {
        if (!aktiv) return
        setSessionChecked(true)
      })
    // Kein weiterer Supabase-Aufruf direkt im Callback (Deadlock-Gefahr), nur State setzen.
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next)
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
      if (event === 'SIGNED_OUT') setRecovery(false)
    })
    return () => {
      aktiv = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const userId = session?.user.id ?? null

  // Profil (Name, Rolle) zum angemeldeten Nutzer laden
  useEffect(() => {
    if (!userId) {
      setProfile(null)
      setProfileError(null)
      return
    }
    let aktiv = true
    setProfile(null)
    setProfileError(null)
    void fetchProfil(userId).then((res) => {
      if (!aktiv) return
      if (res.error) {
        setProfile(null)
        setProfileError(`${res.error} Bitte später erneut versuchen.`)
      } else {
        setProfile(res.data)
        if (!res.data) setProfileError('Für dieses Konto ist noch kein Profil angelegt. Bitte beim Administrator melden.')
      }
    })
    return () => {
      aktiv = false
    }
  }, [userId])

  // Alle Zeitstempel werden in der Zeitzone des eingeloggten Nutzers angezeigt (sonst Browser-Zeitzone).
  const zeitzone = profile?.zeitzone ?? null
  useEffect(() => {
    setAnzeigeZeitzone(zeitzone)
  }, [zeitzone])

  const updateProfil = useCallback(
    async (patch: ErreichbarkeitPatch) => {
      if (!userId) return 'Bitte erneut anmelden.'
      const res = await updateErreichbarkeit(userId, patch)
      if (res.error || !res.data) return res.error ?? 'Die Einstellungen konnten nicht gespeichert werden.'
      setProfile(res.data)
      return null
    },
    [userId],
  )

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    return error ? mapAuthError(error) : null
  }, [])

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut()
    // Bei Netzwerkproblemen die lokale Sitzung trotzdem beenden, damit man nicht "festhaengt".
    if (error) await supabase.auth.signOut({ scope: 'local' })
    setRecovery(false)
  }, [])

  const sendPasswordReset = useCallback(async (email: string) => {
    const redirectTo = `${window.location.origin}${window.location.pathname}`
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo })
    return error ? mapAuthError(error) : null
  }, [])

  const updatePassword = useCallback(async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password })
    if (error) return mapAuthError(error)
    setRecovery(false)
    return null
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      profile,
      loading: !sessionChecked || (Boolean(userId) && !profile && !profileError),
      profileError,
      recovery,
      signIn,
      signOut,
      sendPasswordReset,
      updatePassword,
      updateProfil,
    }),
    [session, profile, sessionChecked, userId, profileError, recovery, signIn, signOut, sendPasswordReset, updatePassword, updateProfil],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth muss innerhalb von AuthProvider verwendet werden')
  return ctx
}
