import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../../context/AppContext'
import { useToast } from '../../components/ToastContext'
import { Card, Button, SectionHeader, Badge } from '../../components/ui'
import { uid, isoDaysAgo, isoDaysFromNow, formatEuro } from '../../lib/utils'
import { Phone, ThumbsDown, CalendarCheck, Clock3, PhoneOff, PartyPopper } from 'lucide-react'

export default function PowerDialer() {
  const { state, dispatch } = useApp()
  const { showToast } = useToast()
  const navigate = useNavigate()

  const queue = useMemo(
    () => state.leads.filter((l) => l.liste === 'aktiv' && l.status !== 'Gewonnen' && l.status !== 'Verloren'),
    [state.leads],
  )

  const [index, setIndex] = useState(0)
  const [calling, setCalling] = useState(false)
  const [finished, setFinished] = useState(false)

  const currentLead = queue[index]

  function log(text: string, typ: 'anruf' | 'status' = 'anruf') {
    if (!currentLead) return
    dispatch({ type: 'ADD_AKTIVITAET', leadId: currentLead.id, aktivitaet: { id: uid('akt'), datum: isoDaysAgo(0), typ, text } })
  }

  function next() {
    setCalling(false)
    if (index + 1 >= queue.length) {
      setFinished(true)
    } else {
      setIndex((i) => i + 1)
    }
  }

  function handleAnrufen() {
    setCalling(true)
    log('Anruf über Power Dialer gestartet')
    setTimeout(() => {
      showToast(`Verbindung mit ${currentLead.name} simuliert`)
    }, 600)
  }

  function handleKeinInteresse() {
    if (!currentLead) return
    dispatch({ type: 'SET_LEAD_STATUS', id: currentLead.id, status: 'Verloren' })
    dispatch({ type: 'UPDATE_LEAD', id: currentLead.id, patch: { verlorenGrund: 'Kein Interesse (Power Dialer)' } })
    showToast(`${currentLead.name}: kein Interesse vermerkt`)
    next()
  }

  function handleTerminVereinbart() {
    if (!currentLead) return
    dispatch({ type: 'SET_LEAD_STATUS', id: currentLead.id, status: 'Termin vereinbart' })
    log('Termin über Power Dialer vereinbart', 'status')
    showToast(`Termin mit ${currentLead.name} vereinbart`)
    next()
  }

  function handleSpaeter() {
    if (!currentLead) return
    dispatch({ type: 'SET_WIEDERVORLAGE', leadId: currentLead.id, wiedervorlage: { datum: isoDaysFromNow(2, 10), notiz: 'Wiedervorlage aus Power Dialer' } })
    showToast(`${currentLead.name} auf Wiedervorlage gelegt`)
    next()
  }

  if (queue.length === 0) {
    return (
      <div>
        <SectionHeader title="Power Dialer" subtitle="Automatische Anwahl der aktiven Leadliste" />
        <Card className="p-8 text-center text-sm text-ink-400">Keine offenen Leads für den Power Dialer verfügbar.</Card>
      </div>
    )
  }

  if (finished || !currentLead) {
    return (
      <div>
        <SectionHeader title="Power Dialer" subtitle="Automatische Anwahl der aktiven Leadliste" />
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <PartyPopper size={36} className="text-brand-500" />
          <h2 className="text-lg font-semibold text-ink-800">Liste abgeschlossen</h2>
          <p className="text-sm text-ink-500">Alle {queue.length} Leads wurden bearbeitet.</p>
          <div className="mt-2 flex gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setIndex(0)
                setFinished(false)
              }}
            >
              Neu starten
            </Button>
            <Button onClick={() => navigate('/leads')}>Zur Leadübersicht</Button>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div>
      <SectionHeader title="Power Dialer" subtitle="Automatische Anwahl der aktiven Leadliste" />

      <div className="mb-4 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink-100">
          <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${((index + 1) / queue.length) * 100}%` }} />
        </div>
        <span className="whitespace-nowrap text-sm font-medium text-ink-500">
          Lead {index + 1} von {queue.length}
        </span>
      </div>

      <Card className="mx-auto max-w-xl p-8 text-center">
        <Badge tone="brand">{currentLead.status}</Badge>
        <h2 className="mt-3 text-2xl font-semibold text-ink-900">{currentLead.name}</h2>
        <p className="mt-1 text-ink-500">{currentLead.telefon}</p>
        <p className="text-sm text-ink-400">{currentLead.email}</p>

        <div className="mt-5 grid grid-cols-2 gap-3 rounded-xl bg-ink-50 p-4 text-left text-sm">
          <div>
            <p className="text-xs text-ink-400">Versicherer / Tarif</p>
            <p className="font-medium text-ink-700">
              {currentLead.versicherer} · {currentLead.tarif}
            </p>
          </div>
          <div>
            <p className="text-xs text-ink-400">Aktueller Beitrag</p>
            <p className="font-medium text-ink-700">{formatEuro(currentLead.beitragAlt)}</p>
          </div>
          <div className="col-span-2">
            <p className="text-xs text-ink-400">Notizen</p>
            <p className="text-ink-600">{currentLead.notizen || 'Keine Notizen vorhanden.'}</p>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-2">
          <Button className="w-full justify-center py-3 text-base" onClick={handleAnrufen}>
            <Phone size={18} /> Anrufen
          </Button>
          {calling && <div className="rounded-xl bg-brand-50 py-2.5 text-sm font-medium text-brand-700">Verbunden mit {currentLead.name}…</div>}
          <div className="grid grid-cols-3 gap-2">
            <Button variant="secondary" onClick={handleKeinInteresse}>
              <ThumbsDown size={16} /> Kein Interesse
            </Button>
            <Button variant="secondary" onClick={handleTerminVereinbart}>
              <CalendarCheck size={16} /> Termin vereinbart
            </Button>
            <Button variant="secondary" onClick={handleSpaeter}>
              <Clock3 size={16} /> Später
            </Button>
          </div>
          {calling && (
            <Button variant="ghost" onClick={() => setCalling(false)}>
              <PhoneOff size={15} /> Auflegen
            </Button>
          )}
        </div>
      </Card>
    </div>
  )
}
