import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, supabaseKonfiguriert } from '../lib/supabase'
import { mapAuthError } from '../lib/authErrors'

export type Rolle = 'mitarbeiter' | 'geschaeftsfuehrer'

export interface Profile {
  id: string
  name: string
  rolle: Rolle
  telefon_festnetz: string | null
  telefon_mobil: string | null
}

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
}

const AuthContext = createContext<AuthContextValue | null>(null)

function parseProfile(row: unknown): Profile | null {
  if (!row || typeof row !== 'object') return null
  const r = row as Record<string, unknown>
  if (typeof r.id !== 'string') return null
  const rolle: Rolle = r.rolle === 'geschaeftsfuehrer' ? 'geschaeftsfuehrer' : 'mitarbeiter'
  return {
    id: r.id,
    name: typeof r.name === 'string' && r.name ? r.name : 'Unbekannt',
    rolle,
    telefon_festnetz: typeof r.telefon_festnetz === 'string' ? r.telefon_festnetz : null,
    telefon_mobil: typeof r.telefon_mobil === 'string' ? r.telefon_mobil : null,
  }
}

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
    supabase
      .from('profiles')
      .select('id, name, rolle, telefon_festnetz, telefon_mobil')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!aktiv) return
        if (error) {
          setProfile(null)
          setProfileError('Das Profil konnte nicht geladen werden. Bitte später erneut versuchen.')
        } else {
          const p = parseProfile(data)
          setProfile(p)
          if (!p) setProfileError('Für dieses Konto ist noch kein Profil angelegt. Bitte beim Administrator melden.')
        }
      })
    return () => {
      aktiv = false
    }
  }, [userId])

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
    }),
    [session, profile, sessionChecked, userId, profileError, recovery, signIn, signOut, sendPasswordReset, updatePassword],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth muss innerhalb von AuthProvider verwendet werden')
  return ctx
}
