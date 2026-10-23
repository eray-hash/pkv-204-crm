import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Check, Mail, MessageSquare, Phone, PhoneCall, ShieldCheck, ShieldAlert, Inbox } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useLeads } from '../../context/LeadsContext'
import { useToast } from '../../components/ToastContext'
import { Badge, Button, Card, ErrorBlock, LoadingBlock, inputClass } from '../../components/ui'
import { DbStatusBadge } from '../../components/LeadTable'
import {
  addNotiz,
  fetchAnrufe,
  fetchEinwilligung,
  fetchLead,
  fetchNotizen,
  updateLeadRow,
  type Anruf,
  type Einwilligung,
  type Notiz,
} from '../../lib/leadsApi'
import {
  ageInDays,
  CLOSING_STATUS,
  PIPELINE_STATUS,
  STATUS_LABEL,
  telHref,
  type DbLead,
  type DbLeadStatus,
} from '../../lib/leads'
import { formatDateTime, formatEuroExact } from '../../lib/utils'

interface Zusatz {
  einwilligung: Einwilligung | null
  notizen: Notiz[]
  anrufe: Anruf[]
  fehler: string | null
}

type Ereignis = { id: string; zeit: string; text: string; icon: ReactNode }

export default function LeadDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { session } = useAuth()
  const { applyLead } = useLeads()
  const { showToast } = useToast()

  const [lead, setLead] = useState<DbLead | null>(null)
  const [laden, setLaden] = useState(true)
  const [ladeFehler, setLadeFehler] = useState<string | null>(null)
  const [zusatz, setZusatz] = useState<Zusatz>({ einwilligung: null, notizen: [], anrufe: [], fehler: null })
  const [notiz, setNotiz] = useState('')
  const [speichertNotiz, setSpeichertNotiz] = useState(false)
  const [statusBusy, setStatusBusy] = useState(false)
  const [abschluss, setAbschluss] = useState<DbLeadStatus | ''>('')

  const ladeZusatz = useCallback(async (leadId: string) => {
    const [e, n, a] = await Promise.all([fetchEinwilligung(leadId), fetchNotizen(leadId), fetchAnrufe(leadId)])
    setZusatz({
      einwilligung: e.data,
      notizen: n.data ?? [],
      anrufe: a.data ?? [],
      fehler: e.error ?? n.error ?? a.error,
    })
  }, [])

  const laden_ = useCallback(async () => {
    if (!id) return
    setLaden(true)
    setLadeFehler(null)
    const res = await fetchLead(id)
    if (res.error) {
      setLadeFehler(res.error)
      setLaden(false)
      return
    }
    setLead(res.data)
    setLaden(false)
    if (res.data) await ladeZusatz(res.data.id)
  }, [id, ladeZusatz])

  useEffect(() => {
    void laden_()
  }, [laden_])

  const ereignisse = useMemo<Ereignis[]>(() => {
    if (!lead) return []
    const liste: Ereignis[] = [{ id: 'eingang', zeit: lead.eingang_zeit, text: `Lead eingegangen${lead.quelle ? ` (Quelle: ${lead.quelle})` : ''}`, icon: <Inbox size={14} /> }]
    if (zusatz.einwilligung) {
      liste.push({ id: 'consent', zeit: zusatz.einwilligung.einwilligung_zeit, text: 'Einwilligung erteilt', icon: <ShieldCheck size={14} /> })
    }
    for (const a of zusatz.anrufe) {
      liste.push({ id: `a-${a.id}`, zeit: a.gestartet_am, text: `Anruf über ${a.kanal === 'mobil' ? 'Mobil (Satellite)' : 'Festnetz (Webex)'} – ${a.autor}`, icon: <PhoneCall size={14} /> })
    }
    for (const n of zusatz.notizen) {
      liste.push({ id: `n-${n.id}`, zeit: n.created_at, text: `Notiz von ${n.autor}`, icon: <MessageSquare size={14} /> })
    }
    return liste.sort((x, y) => Date.parse(y.zeit) - Date.parse(x.zeit))
  }, [lead, zusatz])

  async function setzeStatus(status: DbLeadStatus) {
    if (!lead || status === lead.status) return
    setStatusBusy(true)
    const res = await updateLeadRow(lead.id, { status })
    setStatusBusy(false)
    if (res.error || !res.data) {
      showToast(res.error ?? 'Der Status konnte nicht geändert werden.', 'info')
      return
    }
    setLead(res.data)
    applyLead(res.data)
    setAbschluss('')
    showToast(`Status auf „${STATUS_LABEL[status]}“ gesetzt`)
  }

  async function speichereNotiz() {
    if (!lead || !session) return
    setSpeichertNotiz(true)
    const err = await addNotiz(lead.id, session.user.id, notiz)
    setSpeichertNotiz(false)
    if (err) {
      showToast(err, 'info')
      return
    }
    setNotiz('')
    showToast('Notiz gespeichert')
    const n = await fetchNotizen(lead.id)
    if (n.data) setZusatz((z) => ({ ...z, notizen: n.data ?? [] }))
  }

  if (laden) return <LoadingBlock text="Lead wird geladen …" />
  if (ladeFehler) return <ErrorBlock message={ladeFehler} onRetry={() => void laden_()} />
  if (!lead) {
    return (
      <div>
        <Button variant="ghost" onClick={() => navigate('/leads')}>
          <ArrowLeft size={16} /> Zurück
        </Button>
        <p className="mt-4 text-sm text-ink-500">Dieser Lead wurde nicht gefunden.</p>
      </div>
    )
  }

  const pipelineIndex = PIPELINE_STATUS.indexOf(lead.status)
  const abgeschlossen = CLOSING_STATUS.includes(lead.status)

  return (
    <div>
      <Button variant="ghost" onClick={() => navigate(-1)}>
        <ArrowLeft size={16} /> Zurück
      </Button>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-ink-900">{lead.name}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-ink-500">
            <a href={telHref(lead.telefon)} className="flex items-center gap-1.5 hover:text-brand-700">
              <Phone size={14} /> {lead.telefon}
            </a>
            <a href={`mailto:${lead.email}`} className="flex min-w-0 items-center gap-1.5 hover:text-brand-700">
              <Mail size={14} className="shrink-0" /> <span className="truncate">{lead.email}</span>
            </a>
            <DbStatusBadge status={lead.status} />
            {lead.moegliches_duplikat_von && (
              <Link to={`/leads/${lead.moegliches_duplikat_von}`}>
                <Badge tone="amber">Mögliches Duplikat – ursprünglichen Lead öffnen</Badge>
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card className="p-5">
            <h2 className="mb-4 font-semibold text-ink-800">Status</h2>
            <div className="flex flex-wrap items-center gap-2">
              {PIPELINE_STATUS.map((status, i) => {
                const aktuell = status === lead.status
                const erreicht = !abgeschlossen && pipelineIndex >= 0 && i <= pipelineIndex
                return (
                  <button
                    key={status}
                    disabled={statusBusy}
                    onClick={() => void setzeStatus(status)}
                    className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors disabled:opacity-60 ${
                      aktuell
                        ? 'border-brand-500 bg-brand-600 text-white'
                        : erreicht
                          ? 'border-brand-200 bg-brand-50 text-brand-700'
                          : 'border-ink-200 bg-white text-ink-400 hover:border-brand-200'
                    }`}
                  >
                    {erreicht && !aktuell && <Check size={13} />}
                    {STATUS_LABEL[status]}
                  </button>
                )
              })}
            </div>

            <div className="mt-4 flex flex-col gap-2 border-t border-ink-100 pt-4 sm:flex-row sm:items-center">
              <span className="text-sm text-ink-500">Lead abschließen:</span>
              <select
                className={`${inputClass} sm:max-w-[14rem]`}
                value={abschluss}
                onChange={(e) => setAbschluss(e.target.value as DbLeadStatus | '')}
                aria-label="Abschluss-Status wählen"
              >
                <option value="">Status wählen …</option>
                {CLOSING_STATUS.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
              <Button variant="danger" disabled={!abschluss || statusBusy} onClick={() => abschluss && void setzeStatus(abschluss)}>
                Abschließen
              </Button>
            </div>
            {abgeschlossen && <p className="mt-2 text-xs text-ink-400">Dieser Lead ist abgeschlossen und wird nicht mehr angerufen.</p>}

            <div className="mt-5 grid grid-cols-2 gap-4 border-t border-ink-100 pt-4 sm:grid-cols-4">
              <Info label="Gesellschaft" wert={lead.gesellschaft} />
              <Info label="Tarifbeitrag" wert={`${formatEuroExact(lead.tarifbeitrag)} / Monat`} />
              <Info label="Eingang" wert={formatDateTime(lead.eingang_zeit)} />
              <Info label="Alter" wert={`${ageInDays(lead.eingang_zeit)} Tage`} />
              {lead.quelle && <Info label="Quelle" wert={lead.quelle} />}
              {lead.naechster_anruf_ab && Date.parse(lead.naechster_anruf_ab) > Date.now() && (
                <Info label="Nächster Anruf ab" wert={formatDateTime(lead.naechster_anruf_ab)} />
              )}
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 font-semibold text-ink-800">Notizen</h2>
            <textarea
              className={`${inputClass} min-h-[90px]`}
              value={notiz}
              onChange={(e) => setNotiz(e.target.value)}
              placeholder="Neue Notiz zum Gespräch …"
              maxLength={10000}
              aria-label="Neue Notiz"
            />
            <div className="mt-2 flex justify-end">
              <Button onClick={() => void speichereNotiz()} disabled={speichertNotiz || !notiz.trim()}>
                {speichertNotiz ? 'Speichern …' : 'Notiz speichern'}
              </Button>
            </div>
            <div className="mt-4 space-y-3">
              {zusatz.notizen.length === 0 && <p className="text-sm text-ink-400">Noch keine Notizen vorhanden.</p>}
              {zusatz.notizen.map((n) => (
                <div key={n.id} className="rounded-xl bg-ink-50 px-3 py-2.5">
                  <p className="whitespace-pre-line text-sm text-ink-700">{n.text}</p>
                  <p className="mt-1 text-xs text-ink-400">
                    {n.autor} · {formatDateTime(n.created_at)}
                  </p>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 font-semibold text-ink-800">Aktivitäten-Timeline</h2>
            <div className="space-y-4">
              {ereignisse.map((e) => (
                <div key={e.id} className="flex gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-600">{e.icon}</div>
                  <div>
                    <p className="text-sm text-ink-700">{e.text}</p>
                    <p className="text-xs text-ink-400">{formatDateTime(e.zeit)}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="p-5">
            <h2 className="mb-3 flex items-center gap-2 font-semibold text-ink-800">
              {zusatz.einwilligung ? <ShieldCheck size={16} className="text-emerald-600" /> : <ShieldAlert size={16} className="text-red-500" />}
              Einwilligungsnachweis
            </h2>
            {zusatz.einwilligung ? (
              <div className="space-y-3 text-sm">
                <Info label="Zeitpunkt" wert={formatDateTime(zusatz.einwilligung.einwilligung_zeit)} />
                <Info label="Quelle" wert={zusatz.einwilligung.einwilligung_quelle} />
                <div>
                  <p className="text-xs text-ink-400">Wortlaut</p>
                  <blockquote className="mt-1 whitespace-pre-line rounded-lg border-l-4 border-brand-200 bg-ink-50 px-3 py-2 text-ink-600">
                    {zusatz.einwilligung.einwilligung_text}
                  </blockquote>
                </div>
              </div>
            ) : (
              <p className="text-sm text-red-600">{zusatz.fehler ?? 'Für diesen Lead liegt kein Einwilligungsnachweis vor. Er wird nicht im Power Dialer angeboten.'}</p>
            )}
          </Card>
        </div>
      </div>
      {zusatz.fehler && zusatz.einwilligung && <p className="mt-4 text-xs text-red-600">{zusatz.fehler}</p>}
    </div>
  )
}

function Info({ label, wert }: { label: string; wert: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-ink-400">{label}</p>
      <p className="break-words font-medium text-ink-700">{wert}</p>
    </div>
  )
}
