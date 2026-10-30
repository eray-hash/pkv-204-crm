import { useMemo, useState } from 'react'
import { AlertCircle, CheckCircle2, Clock, Loader2 } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useTeam } from '../../context/TeamContext'
import { useToast } from '../../components/ToastContext'
import { Badge, Button, Card, Field, inputClass } from '../../components/ui'
import { effektivOnline, istImAutoFenster } from '../../lib/praesenz'
import { pruefeErreichbarkeit } from '../../lib/profil'
import { formatOrtszeit, zeitzonenListe } from '../../lib/zeit'

export default function Erreichbarkeit() {
  const { profile, updateProfil } = useAuth()
  const { jetzt } = useTeam()
  const { showToast } = useToast()
  const zonen = useMemo(() => zeitzonenListe(), [])

  const [zeitzone, setZeitzone] = useState(profile?.zeitzone ?? 'Europe/Berlin')
  const [online, setOnline] = useState(profile?.online ?? false)
  const [autoOnline, setAutoOnline] = useState(profile?.auto_online ?? false)
  const [von, setVon] = useState(profile?.erreichbar_von ?? '')
  const [bis, setBis] = useState(profile?.erreichbar_bis ?? '')
  const [busy, setBusy] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  if (!profile) return null

  // Vorschau mit den (noch nicht gespeicherten) Eingaben
  const vorschau = { zeitzone, online, auto_online: autoOnline, erreichbar_von: von || null, erreichbar_bis: bis || null }
  const effektiv = effektivOnline(vorschau, jetzt)
  const imFenster = istImAutoFenster(vorschau, jetzt)

  async function speichern() {
    setFehler(null)
    const problem = pruefeErreichbarkeit({ zeitzone, online, auto_online: autoOnline, erreichbar_von: von, erreichbar_bis: bis })
    if (problem) {
      setFehler(problem)
      return
    }
    setBusy(true)
    const err = await updateProfil({ zeitzone, online, auto_online: autoOnline, erreichbar_von: von || null, erreichbar_bis: bis || null })
    setBusy(false)
    if (err) setFehler(err)
    else showToast('Einstellungen gespeichert')
  }

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-semibold text-ink-800">
            <Clock size={16} /> Zeitzone und Erreichbarkeit
          </h2>
          {effektiv ? <Badge tone="green">Aktuell online</Badge> : <Badge tone="ink">Aktuell offline</Badge>}
        </div>
        <p className="mt-2 text-sm text-ink-500">
          Neue Live-Leads melden wir nur, wenn Sie online sind. Alle Zeitangaben im CRM erscheinen in Ihrer Zeitzone. Das Team sieht Ihren Status und Ihre Ortszeit.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Zeitzone">
            <select className={inputClass} value={zeitzone} onChange={(e) => setZeitzone(e.target.value)}>
              {zonen.map((z) => (
                <option key={z} value={z}>
                  {z.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex items-end text-sm text-ink-500">
            <span>
              Ortszeit dort jetzt: <span className="font-semibold text-ink-800">{formatOrtszeit(jetzt, zeitzone)}</span> Uhr
            </span>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          <label className="flex items-center gap-2 text-sm text-ink-700">
            <input type="checkbox" checked={online} onChange={(e) => setOnline(e.target.checked)} className="h-4 w-4 rounded border-ink-300 text-brand-600" />
            Ich nehme Live-Leads an (manuell online)
          </label>
          <label className="flex items-center gap-2 text-sm text-ink-700">
            <input type="checkbox" checked={autoOnline} onChange={(e) => setAutoOnline(e.target.checked)} className="h-4 w-4 rounded border-ink-300 text-brand-600" />
            Automatisch online in meinem Zeitfenster
          </label>
          <div className="grid grid-cols-2 gap-3 sm:max-w-sm">
            <Field label="Erreichbar von (Ortszeit)">
              <input type="time" className={inputClass} value={von} onChange={(e) => setVon(e.target.value)} />
            </Field>
            <Field label="Erreichbar bis (Ortszeit)">
              <input type="time" className={inputClass} value={bis} onChange={(e) => setBis(e.target.value)} />
            </Field>
          </div>
          <p className="text-xs text-ink-400">
            Das Fenster kann über Mitternacht gehen (z. B. 20:00 bis 06:00).
            {autoOnline && (imFenster ? ' Sie sind gerade im Zeitfenster.' : ' Sie sind gerade außerhalb des Zeitfensters.')}
          </p>
        </div>

        {fehler && (
          <p className="mt-3 flex items-start gap-1.5 text-sm text-red-600" role="alert">
            <AlertCircle size={15} className="mt-0.5 shrink-0" /> {fehler}
          </p>
        )}
        <div className="mt-4 flex items-center gap-3">
          <Button onClick={() => void speichern()} disabled={busy}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />} Speichern
          </Button>
        </div>
      </Card>
    </div>
  )
}
