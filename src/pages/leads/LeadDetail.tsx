import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useApp } from '../../context/AppContext'
import { useToast } from '../../components/ToastContext'
import { Card, Button, Field, inputClass, StatusBadge, Badge } from '../../components/ui'
import { formatDateTime, formatEuro, formatDate, uid, isoDaysAgo } from '../../lib/utils'
import { LEAD_STATUS_PIPELINE, type LeadStatus } from '../../types'
import { ArrowLeft, Phone, Mail, Check, X as XIcon, Clock, MessageSquare, PhoneCall, CalendarPlus } from 'lucide-react'

const TYP_ICON: Record<string, ReactNode> = {
  anruf: <PhoneCall size={14} />,
  email: <Mail size={14} />,
  notiz: <MessageSquare size={14} />,
  status: <Check size={14} />,
  termin: <CalendarPlus size={14} />,
}

export default function LeadDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { state, dispatch } = useApp()
  const { showToast } = useToast()

  const lead = useMemo(() => state.leads.find((l) => l.id === id), [state.leads, id])

  const [notiz, setNotiz] = useState(lead?.notizen ?? '')
  const [wvDatum, setWvDatum] = useState(lead?.wiedervorlage ? lead.wiedervorlage.datum.slice(0, 16) : '')
  const [wvNotiz, setWvNotiz] = useState(lead?.wiedervorlage?.notiz ?? '')

  if (!lead) {
    return (
      <div>
        <Button variant="ghost" onClick={() => navigate('/leads')}>
          <ArrowLeft size={16} /> Zurück
        </Button>
        <p className="mt-4 text-sm text-ink-500">Lead wurde nicht gefunden.</p>
      </div>
    )
  }

  const currentIndex = LEAD_STATUS_PIPELINE.indexOf(lead.status)

  function setStatus(status: LeadStatus) {
    if (!lead) return
    dispatch({ type: 'SET_LEAD_STATUS', id: lead.id, status })
    showToast(`Status auf „${status}“ gesetzt`)
  }

  function saveNotiz() {
    if (!lead) return
    dispatch({ type: 'UPDATE_LEAD', id: lead.id, patch: { notizen: notiz } })
    dispatch({ type: 'ADD_AKTIVITAET', leadId: lead.id, aktivitaet: { id: uid('akt'), datum: isoDaysAgo(0), typ: 'notiz', text: 'Notiz aktualisiert' } })
    showToast('Notiz gespeichert')
  }

  function saveWiedervorlage() {
    if (!lead) return
    if (!wvDatum) {
      dispatch({ type: 'SET_WIEDERVORLAGE', leadId: lead.id, wiedervorlage: undefined })
      showToast('Wiedervorlage entfernt')
      return
    }
    dispatch({ type: 'SET_WIEDERVORLAGE', leadId: lead.id, wiedervorlage: { datum: new Date(wvDatum).toISOString(), notiz: wvNotiz } })
    showToast('Wiedervorlage gespeichert')
  }

  function simulateCall() {
    if (!lead) return
    dispatch({ type: 'ADD_AKTIVITAET', leadId: lead.id, aktivitaet: { id: uid('akt'), datum: isoDaysAgo(0), typ: 'anruf', text: 'Anruf simuliert (Power Dialer / manuell)' } })
    showToast(`Anruf mit ${lead.name} wird simuliert…`)
  }

  return (
    <div>
      <Button variant="ghost" onClick={() => navigate(-1)}>
        <ArrowLeft size={16} /> Zurück
      </Button>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-ink-900">{lead.name}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-sm text-ink-500">
            <span className="flex items-center gap-1.5">
              <Phone size={14} /> {lead.telefon}
            </span>
            <span className="flex items-center gap-1.5">
              <Mail size={14} /> {lead.email}
            </span>
            <StatusBadge status={lead.status} />
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={simulateCall}>
            <Phone size={16} /> Anrufen
          </Button>
          {lead.status !== 'Verloren' && lead.status !== 'Gewonnen' && (
            <Button variant="danger" onClick={() => setStatus('Verloren')}>
              <XIcon size={16} /> Als verloren markieren
            </Button>
          )}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card className="p-5">
            <h2 className="mb-4 font-semibold text-ink-800">Status-Pipeline</h2>
            <div className="flex flex-wrap items-center gap-2">
              {LEAD_STATUS_PIPELINE.map((status, i) => {
                const reached = lead.status !== 'Verloren' && i <= currentIndex
                const isCurrent = status === lead.status
                return (
                  <button
                    key={status}
                    onClick={() => setStatus(status)}
                    className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                      isCurrent
                        ? 'border-brand-500 bg-brand-600 text-white'
                        : reached
                          ? 'border-brand-200 bg-brand-50 text-brand-700'
                          : 'border-ink-200 bg-white text-ink-400 hover:border-brand-200'
                    }`}
                  >
                    {reached && !isCurrent && <Check size={13} />}
                    {status}
                  </button>
                )
              })}
              {lead.status === 'Verloren' && <Badge tone="red">Verloren</Badge>}
            </div>

            <div className="mt-5 grid grid-cols-2 gap-4 border-t border-ink-100 pt-4 sm:grid-cols-4">
              <div>
                <p className="text-xs text-ink-400">Versicherer</p>
                <p className="font-medium text-ink-700">{lead.versicherer}</p>
              </div>
              <div>
                <p className="text-xs text-ink-400">Tarif</p>
                <p className="font-medium text-ink-700">{lead.tarif}</p>
              </div>
              <div>
                <p className="text-xs text-ink-400">Beitrag alt</p>
                <p className="font-medium text-ink-700">{formatEuro(lead.beitragAlt)}</p>
              </div>
              <div>
                <p className="text-xs text-ink-400">Ersparnis</p>
                <p className="font-medium text-brand-600">{lead.ersparnis ? `${formatEuro(lead.ersparnis)}/Monat` : '–'}</p>
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 font-semibold text-ink-800">Notizen</h2>
            <textarea className={`${inputClass} min-h-[100px]`} value={notiz} onChange={(e) => setNotiz(e.target.value)} />
            <div className="mt-2 flex justify-end">
              <Button onClick={saveNotiz}>Notiz speichern</Button>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 font-semibold text-ink-800">Aktivitäten-Timeline</h2>
            <div className="space-y-4">
              {lead.aktivitaeten
                .slice()
                .sort((a, b) => new Date(b.datum).getTime() - new Date(a.datum).getTime())
                .map((a) => (
                  <div key={a.id} className="flex gap-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-600">
                      {TYP_ICON[a.typ]}
                    </div>
                    <div>
                      <p className="text-sm text-ink-700">{a.text}</p>
                      <p className="text-xs text-ink-400">{formatDateTime(a.datum)}</p>
                    </div>
                  </div>
                ))}
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="p-5">
            <h2 className="mb-3 flex items-center gap-2 font-semibold text-ink-800">
              <Clock size={16} /> Wiedervorlage
            </h2>
            {lead.wiedervorlage && (
              <p className="mb-2 text-xs text-ink-400">Aktuell: {formatDate(lead.wiedervorlage.datum)} – {lead.wiedervorlage.notiz}</p>
            )}
            <Field label="Datum & Uhrzeit">
              <input type="datetime-local" className={inputClass} value={wvDatum} onChange={(e) => setWvDatum(e.target.value)} />
            </Field>
            <div className="mt-3">
              <Field label="Notiz">
                <input className={inputClass} value={wvNotiz} onChange={(e) => setWvNotiz(e.target.value)} placeholder="z.B. Rückruf wegen Entscheidung" />
              </Field>
            </div>
            <div className="mt-3 flex justify-end">
              <Button onClick={saveWiedervorlage}>Speichern</Button>
            </div>
          </Card>

          {lead.verlorenGrund && (
            <Card className="p-5">
              <h2 className="mb-2 font-semibold text-ink-800">Verlustgrund</h2>
              <p className="text-sm text-ink-500">{lead.verlorenGrund}</p>
            </Card>
          )}

          <Card className="p-5">
            <h2 className="mb-2 font-semibold text-ink-800">Angelegt am</h2>
            <p className="text-sm text-ink-500">{formatDate(lead.erstelltAm)}</p>
          </Card>
        </div>
      </div>
    </div>
  )
}
