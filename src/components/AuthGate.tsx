import type { ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabaseKonfiguriert } from '../lib/supabase'
import Login from '../pages/Login'

function Vollbild({ children }: { children: ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center bg-ink-50 px-4">{children}</div>
}

/** Zeigt die App nur nach erfolgreicher Anmeldung. Ohne Sitzung erscheint (auf jeder Adresse) die Login-Seite. */
export default function AuthGate({ children }: { children: ReactNode }) {
  const { session, profile, loading, profileError, recovery, linkFehler, signOut } = useAuth()

  if (!supabaseKonfiguriert) {
    return (
      <Vollbild>
        <p className="max-w-sm text-center text-sm text-red-700" role="alert">
          Die Verbindung zur Datenbank ist nicht konfiguriert (VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY fehlen).
        </p>
      </Vollbild>
    )
  }

  if (loading) {
    return (
      <Vollbild>
        <div className="flex items-center gap-2 text-sm text-ink-500" role="status">
          <Loader2 size={18} className="animate-spin text-brand-500" /> Anmeldung wird geprüft …
        </div>
      </Vollbild>
    )
  }

  if (session && recovery) return <Login key="recovery" start="neuesPasswort" />
  if (!session) return <Login key="login" startFehler={linkFehler} />

  if (!profile) {
    return (
      <Vollbild>
        <div className="w-full max-w-sm rounded-2xl border border-ink-100 bg-white p-6 text-center shadow-sm">
          <p className="text-sm text-red-700" role="alert">
            {profileError ?? 'Das Profil konnte nicht geladen werden.'}
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <button onClick={() => window.location.reload()} className="rounded-lg bg-white px-3.5 py-2 text-sm font-medium text-ink-700 ring-1 ring-ink-200 hover:bg-ink-50">
              Neu laden
            </button>
            <button onClick={() => void signOut()} className="rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-700">
              Abmelden
            </button>
          </div>
        </div>
      </Vollbild>
    )
  }

  return <>{children}</>
}
