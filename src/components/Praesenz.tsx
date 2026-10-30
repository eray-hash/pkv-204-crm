import { useEffect, useRef, useState } from 'react'
import { Users } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useTeam } from '../context/TeamContext'
import { useToast } from './ToastContext'
import { effektivOnline } from '../lib/praesenz'
import { formatOrtszeit } from '../lib/zeit'

/** Schalter "Ich nehme Live-Leads an" (setzt profiles.online). */
export function LiveSwitch({ langesLabel = false }: { langesLabel?: boolean }) {
  const { profile, updateProfil } = useAuth()
  const { jetzt } = useTeam()
  const { showToast } = useToast()
  const [busy, setBusy] = useState(false)
  if (!profile) return null

  const effektiv = effektivOnline(profile, jetzt)
  const automatisch = effektiv && !profile.online

  async function umschalten() {
    if (!profile) return
    setBusy(true)
    const err = await updateProfil({ online: !profile.online })
    setBusy(false)
    if (err) showToast(err, 'info')
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={profile.online}
      disabled={busy}
      onClick={() => void umschalten()}
      title={automatisch ? 'Ich nehme Live-Leads an (derzeit automatisch online durch Ihr Zeitfenster)' : 'Ich nehme Live-Leads an'}
      className="flex items-center gap-2 rounded-lg border border-ink-200 bg-white px-2 py-1.5 text-xs font-semibold text-ink-600 hover:bg-ink-50 disabled:opacity-60"
    >
      <span className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors ${effektiv ? 'bg-brand-600' : 'bg-ink-300'}`}>
        <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${profile.online ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
      </span>
      <span className="whitespace-nowrap">
        {langesLabel ? 'Ich nehme Live-Leads an' : 'Live-Leads'}
        {automatisch && <span className="ml-1 font-normal text-brand-700">(auto)</span>}
      </span>
    </button>
  )
}

/** Liste des Teams: Name, online/offline, Ortszeit der Person. */
export function PraesenzListe() {
  const { mitglieder, jetzt, loading, error } = useTeam()
  if (loading && mitglieder.length === 0) return <p className="px-3 py-2 text-sm text-ink-400">Team wird geladen …</p>
  if (error && mitglieder.length === 0) return <p className="px-3 py-2 text-sm text-red-600">{error}</p>
  return (
    <ul className="space-y-0.5">
      {mitglieder.map((m) => {
        const online = effektivOnline(m, jetzt)
        return (
          <li key={m.id} className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${online ? 'bg-emerald-500' : 'bg-ink-300'}`} aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-ink-800">{m.name}</span>
              <span className="block text-xs text-ink-400">
                {online ? 'online' : 'offline'} · {m.rolle === 'geschaeftsfuehrer' ? 'Geschäftsführer' : 'Mitarbeiter'}
              </span>
            </span>
            <span className="text-right text-xs text-ink-500">
              <span className="block font-medium text-ink-700">{formatOrtszeit(jetzt, m.zeitzone)}</span>
              <span className="block">{m.zeitzone.split('/').pop()?.replace(/_/g, ' ')}</span>
            </span>
          </li>
        )
      })}
    </ul>
  )
}

/** Kopfzeilen-Popover mit der Team-Praesenz. */
export function PraesenzMenu() {
  const { mitglieder, jetzt } = useTeam()
  const [offen, setOffen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOffen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const onlineAnzahl = mitglieder.filter((m) => effektivOnline(m, jetzt)).length

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOffen((v) => !v)}
        title="Team-Präsenz"
        aria-haspopup="true"
        aria-expanded={offen}
        className="relative flex items-center gap-1 rounded-lg p-2 text-ink-500 hover:bg-ink-100"
      >
        <Users size={19} />
        <span className="text-xs font-semibold">
          {onlineAnzahl}/{mitglieder.length}
        </span>
      </button>
      {offen && (
        <div className="absolute right-0 z-40 mt-2 w-[85vw] max-w-xs rounded-xl border border-ink-100 bg-white p-2 shadow-lg">
          <p className="px-3 py-1 text-sm font-semibold text-ink-800">Team-Präsenz</p>
          <PraesenzListe />
          <p className="px-3 pb-1 pt-2 text-xs text-ink-400">Ortszeit der jeweiligen Person. Die Liste aktualisiert sich jede Minute.</p>
        </div>
      )}
    </div>
  )
}
