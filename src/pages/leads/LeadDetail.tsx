import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Ban, Check, Mail, MessageSquare, Phone, PhoneCall, ShieldCheck, ShieldAlert, Inbox, UserCheck } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useLeads } from '../../context/LeadsContext'
import { useTeam } from '../../context/TeamContext'
import NummerKopieren from '../../components/NummerKopieren'
import { useToast } from '../../components/ToastContext'
import { Badge, Button, Card, ErrorBlock as ErrorBoundaryFehler, LoadingBlock, inputClass } from '../../components/ui'
import { DbStatusBadge } from '../../components/LeadTable'
import SperrDialog from '../../components/SperrDialog'
import BestaetigenDialog from '../../components/BestaetigenDialog'
import {
  addNotiz,
  fetchAnrufe,
  fetchEinwilligung,
  fetchLead,
  fetchNotizen,
  logAnruf,
  updateLeadRow,
  type Anruf,
  type Einwilligung,
  type Notiz,
} from '../../lib/leadsApi'
import {
  ageInDays,
  anrufPruefung,
  CLOSING_STATUS,
  leadZugriff,
  PIPELINE_STATUS,
  STATUS_LABEL,
  telHref,
  type DbLead,
  type DbLeadStatus,
} from '../../lib/leads'
import { formatDateTime, formatEuroExact } from '../../lib/utils'
import { bereiteTelAnrufVor } from '../../lib/telAnruf'

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
  const location = useLocation()
  const { session, profile } = useAuth()
  const { leads, applyLead, uebernehmen, freigeben, zuweisen, sperren, entsperren, refreshLead } = useLeads()
  const { mitglieder, nameVon } = useTeam()
  const { showToast } = useToast()

  const [lead, setLead] = useState<DbLead | null>(null)
  const [laden, setLaden] = useState(true)
  const [ladeFehler, setLadeFehler] = useState<string | null>(null)
  const [zusatz, setZusatz] = useState<Zusatz>({ einwilligung: null, notizen: [], anrufe: [], fehler: null })
  const [notiz, setNotiz] = useState('')
  const [speichertNotiz, setSpeichertNotiz] = useState(false)
  const [statusBusy, setStatusBusy] = useState(false)
  const [abschluss, setAbschluss] = useState<DbLeadStatus | ''>('')
  const [zuweisenAn, setZuweisenAn] = useState('')
  const [verteilungBusy, setVerteilungBusy] = useState(false)
  const [zusatzGeladen, setZusatzGeladen] = useState(false)
  const [sperrDialog, setSperrDialog] = useState(false)
  const [rueckfrage, setRueckfrage] = useState<DbLeadStatus | null>(null)
  const [telBusy, setTelBusy] = useState(false)
  const [entsperrDialog, setEntsperrDialog] = useState(false)
  // Antworten zu einem frueheren Lead (schneller Leadwechsel) werden verworfen
  const ladeNr = useRef(0)

  // Aenderungen anderer Personen (Realtime) aus der Lead-Liste uebernehmen
  const ctxLead = leads.find((l) => l.id === id)
  useEffect(() => {
    // Nur uebernehmen, wenn es derselbe Lead ist und der Stand nicht aelter ist als der angezeigte (kein veralteter Wert wird zurueckgeschrieben)
    if (!ctxLead) return
    setLead((alt) => (alt && alt.id === ctxLead.id && Date.parse(alt.updated_at) > Date.parse(ctxLead.updated_at) ? alt : ctxLead))
  }, [ctxLead])

  const meId = session?.user.id ?? null
  const istGF = profile?.rolle === 'geschaeftsfuehrer'
  const zugriff = lead ? leadZugriff(lead, meId, istGF) : null

  const ladeZusatz = useCallback(async (leadId: string, nr: number) => {
    const [e, n, a] = await Promise.all([fetchEinwilligung(leadId), fetchNotizen(leadId), fetchAnrufe(leadId)])
    if (nr !== ladeNr.current) return // inzwischen anderer Lead
    setZusatz({
      einwilligung: e.data,
      notizen: n.data ?? [],
      anrufe: a.data ?? [],
      fehler: e.error ?? n.error ?? a.error,
    })
    setZusatzGeladen(true)
  }, [])

  const laden_ = useCallback(async () => {
    if (!id) return
    const nr = ++ladeNr.current
    setLaden(true)
    setLadeFehler(null)
    setLead(null)
    setZusatz({ einwilligung: null, notizen: [], anrufe: [], fehler: null })
    setZusatzGeladen(false)
    const res = await fetchLead(id)
    if (nr !== ladeNr.current) return
    if (res.error) {
      setLadeFehler(res.error)
      setLaden(false)
      return
    }
    setLead(res.data)
    setLaden(false)
    if (res.data) await ladeZusatz(res.data.id, nr)
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
      liste.push({ id: `a-${a.id}`, zeit: a.gestartet_am, text: `Anruf ${a.kanal === 'mobil' ? 'über Mobil (Satellite)' : 'über die Telefon-App'} – ${a.autor}`, icon: <PhoneCall size={14} /> })
    }
    for (const n of zusatz.notizen) {
      liste.push({ id: `n-${n.id}`, zeit: n.created_at, text: `Notiz von ${n.autor}`, icon: <MessageSquare size={14} /> })
    }
    return liste.sort((x, y) => Date.parse(y.zeit) - Date.parse(x.zeit))
  }, [lead, zusatz])

  // Abschliessende Status und "Gewonnen" erst nach Rueckfrage
  function bitteStatus(status: DbLeadStatus) {
    if (!lead || status === lead.status) return
    if (status === 'gewonnen' || CLOSING_STATUS.includes(status)) setRueckfrage(status)
    else void setzeStatus(status)
  }

  async function setzeStatus(status: DbLeadStatus) {
    if (!lead || status === lead.status) return
    setStatusBusy(true)
    // Ein Mitarbeiter muss einen freien Lead zuerst uebernehmen (Datenbankregel); das passiert hier automatisch.
    if (zugriff?.uebernahmeVorBearbeitung) {
      const u = await uebernehmen(lead.id)
      if (u.fehler || !u.ok) {
        setStatusBusy(false)
        showToast(u.fehler ?? 'Dieser Lead konnte nicht übernommen werden (bereits vergeben oder Status nicht übernehmbar).', 'info')
        return
      }
    }
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

  // "Zurueck" ohne Verlauf (z. B. direkt geoeffneter Link) fuehrt zur Leadliste
  const zurueck = () => (location.key === 'default' ? navigate('/leads') : navigate(-1))

  if (laden) return <LoadingBlock text="Lead wird geladen …" />
  if (ladeFehler) return <ErrorBoundaryFehler message={ladeFehler} onRetry={() => void laden_()} />
  if (!lead) {
    return (
      <div>
        <Button variant="ghost" onClick={zurueck}>
          <ArrowLeft size={16} /> Zurück
        </Button>
        <p className="mt-4 text-sm text-ink-500">Dieser Lead wurde nicht gefunden.</p>
      </div>
    )
  }
  // Mitarbeiter sehen nur freie und eigene Leads: wurde der Lead inzwischen jemand anderem zugewiesen, verschwindet er aus der Liste
  if (!istGF && leads.length > 0 && !ctxLead) {
    return (
      <div>
        <Button variant="ghost" onClick={zurueck}>
          <ArrowLeft size={16} /> Zurück
        </Button>
        <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800" role="status">
          Dieser Lead wird inzwischen von jemand anderem bearbeitet und ist für Sie nicht mehr sichtbar.
        </p>
      </div>
    )
  }

  const z = zugriff as NonNullable<typeof zugriff>
  const besitzerName = nameVon(lead.zugewiesen_an)
  const pipelineIndex = PIPELINE_STATUS.indexOf(lead.status)

  async function verteilungsAktion(aktion: () => Promise<{ ok: boolean; fehler: string | null }>, okText: string, nichtOkText: string) {
    setVerteilungBusy(true)
    const res = await aktion()
    setVerteilungBusy(false)
    if (res.fehler) showToast(res.fehler, 'info')
    else if (res.ok) showToast(okText)
    else showToast(nichtOkText, 'info')
  }
  const abgeschlossen = CLOSING_STATUS.includes(lead.status)
  // Gesperrte Leads kann nur der Geschaeftsfuehrer aendern (Statuswaechter in der Datenbank)
  const gesperrtBlockiert = Boolean(lead.gesperrt_am) && !istGF
  const kannBearbeiten = z.darfBearbeiten && !gesperrtBlockiert
  const anrufbar = anrufPruefung(lead, zusatzGeladen ? (zusatz.einwilligung?.einwilligung_zeit ?? null) : undefined, meId)

  // tel:-Link: freien Lead uebernehmen, Anruf protokollieren, erst dann waehlen (wie im Power Dialer). Bei Ablehnung wird nicht gewaehlt.
  async function telKlick(e: MouseEvent<HTMLAnchorElement>) {
    e.preventDefault()
    if (!lead || telBusy) return
    const href = e.currentTarget.href
    setTelBusy(true)
    const res = await bereiteTelAnrufVor(lead, 'festnetz', { meId, uebernehmen, refreshLead, logAnruf })
    setTelBusy(false)
    if (!res.ok) {
      showToast(res.meldung, 'info')
      return
    }
    if (res.uebernommen) showToast('Lead übernommen')
    void ladeZusatz(lead.id, ladeNr.current)
    window.location.href = href
  }

  async function sperreLead(grund: string) {
    if (!lead) return
    setVerteilungBusy(true)
    const res = await sperren(lead.id, grund)
    setVerteilungBusy(false)
    setSperrDialog(false)
    if (res.fehler) showToast(res.fehler, 'info')
    else if (res.ok) showToast('Lead gesperrt – er wird nie wieder angerufen')
    else showToast('Der Lead konnte nicht gesperrt werden.', 'info')
  }

  async function hebeSperreAuf() {
    if (!lead) return
    setVerteilungBusy(true)
    const res = await entsperren(lead.id)
    setVerteilungBusy(false)
    setEntsperrDialog(false)
    if (res.fehler) showToast(res.fehler, 'info')
    else if (res.ok) showToast('Sperre aufgehoben')
    else showToast('Die Sperre konnte nicht aufgehoben werden.', 'info')
  }

  return (
    <div>
      <Button variant="ghost" onClick={zurueck}>
        <ArrowLeft size={16} /> Zurück
      </Button>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-ink-900">{lead.name}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-ink-500">
            {anrufbar.ok ? (
              <>
                <a
                  href={telHref(lead.telefon)}
                  onClick={(e) => void telKlick(e)}
                  aria-disabled={telBusy}
                  className="flex items-center gap-1.5 hover:text-brand-700"
                >
                  <Phone size={14} /> {lead.telefon}
                </a>
                <NummerKopieren nummer={lead.telefon} />
              </>
            ) : (
              <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="flex items-center gap-1.5">
                  <Phone size={14} /> {lead.telefon}
                </span>
                {anrufbar.grund && <span className="text-xs text-amber-700">{anrufbar.grund}</span>}
              </span>
            )}
            <a href={`mailto:${lead.email}`} className="flex min-w-0 items-center gap-1.5 hover:text-brand-700">
              <Mail size={14} className="shrink-0" /> <span className="truncate">{lead.email}</span>
            </a>
            <DbStatusBadge status={lead.status} />
            {lead.gesperrt_am && <Badge tone="red">Gesperrt</Badge>}
            {lead.moegliches_duplikat_von && (
              <Link to={`/leads/${lead.moegliches_duplikat_von}`}>
                <Badge tone="amber">Mögliches Duplikat – ursprünglichen Lead öffnen</Badge>
              </Link>
            )}
          </div>
        </div>
      </div>

      {lead.gesperrt_am && (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="status">
          Gesperrt seit {formatDateTime(lead.gesperrt_am)}
          {lead.sperrgrund ? ` (${lead.sperrgrund})` : ''}. Dieser Lead wird nie angerufen.
          {gesperrtBlockiert ? ' Nur der Geschäftsführer kann die Sperre aufheben und den Status ändern.' : ''}
        </p>
      )}
      {z.bearbeiter === 'andere' && (
        <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800" role="status">
          Wird von {besitzerName} bearbeitet.{' '}
          {istGF ? 'Als Geschäftsführer können Sie den Lead dennoch bearbeiten, freigeben oder neu zuweisen.' : 'Status, Notizen und Anrufe sind für Sie deaktiviert.'}
        </p>
      )}
      {z.bearbeiter === 'frei' && !istGF && (
        <p className="mt-4 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800" role="status">
          Dieser Lead ist frei. Mit „Übernehmen“ (oder beim Ändern des Status) gehört er Ihnen.
        </p>
      )}

      <div className="mt-6 grid grid-cols-1 items-start gap-5 lg:grid-cols-3">
        {/* Zuständigkeit steht auf dem Handy ganz oben, am Desktop rechts oben */}
        <div className="lg:col-start-3 lg:row-start-1">
          <Card className="p-5">
            <h2 className="mb-3 flex items-center gap-2 font-semibold text-ink-800">
              <UserCheck size={16} /> Zuständigkeit
            </h2>
            <p className="text-sm text-ink-600">
              {z.bearbeiter === 'frei' ? (
                <Badge tone="green">Frei</Badge>
              ) : (
                <>
                  Bearbeiter: <span className="font-medium text-ink-800">{z.bearbeiter === 'ich' ? 'Sie' : besitzerName}</span>
                  {lead.uebernommen_am && <span className="block text-xs text-ink-400">seit {formatDateTime(lead.uebernommen_am)}</span>}
                </>
              )}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {z.darfUebernehmen && (
                <Button
                  disabled={verteilungBusy}
                  onClick={() =>
                    void verteilungsAktion(() => uebernehmen(lead.id), 'Lead übernommen', 'Dieser Lead ist bereits vergeben oder kann nicht übernommen werden.')
                  }
                >
                  Übernehmen
                </Button>
              )}
              {z.darfFreigeben && (
                <Button
                  variant="secondary"
                  disabled={verteilungBusy}
                  onClick={() => void verteilungsAktion(() => freigeben(lead.id), 'Lead freigegeben', 'Der Lead konnte nicht freigegeben werden.')}
                >
                  Freigeben
                </Button>
              )}
            </div>
            {z.bearbeiter === 'frei' && !z.darfUebernehmen && (
              <p className="mt-2 text-xs text-ink-400">Dieser Lead kann wegen seines Status nicht übernommen werden. Der Geschäftsführer kann ihn zuweisen.</p>
            )}
            <div className="mt-4 border-t border-ink-100 pt-3">
              {lead.gesperrt_am ? (
                istGF && (
                  <Button variant="secondary" disabled={verteilungBusy} onClick={() => setEntsperrDialog(true)}>
                    <Ban size={15} /> Sperre aufheben
                  </Button>
                )
              ) : (
                <Button
                  variant="danger"
                  disabled={verteilungBusy || (z.bearbeiter !== 'ich' && !istGF)}
                  title={z.bearbeiter !== 'ich' && !istGF ? 'Zum Sperren muss der Lead Ihnen gehören (zuerst übernehmen).' : undefined}
                  onClick={() => setSperrDialog(true)}
                >
                  <Ban size={15} /> Widerruf / nicht mehr anrufen
                </Button>
              )}
              {!lead.gesperrt_am && z.bearbeiter !== 'ich' && !istGF && (
                <p className="mt-1.5 text-xs text-ink-400">Zum Sperren muss der Lead Ihnen gehören (zuerst übernehmen).</p>
              )}
            </div>
            {z.darfZuweisen && (
              <div className="mt-4 border-t border-ink-100 pt-3">
                <label className="mb-1 block text-xs font-medium text-ink-500" htmlFor="zuweisen-an">
                  Zuweisen an …
                </label>
                <div className="flex gap-2">
                  <select id="zuweisen-an" className={inputClass} value={zuweisenAn} onChange={(e) => setZuweisenAn(e.target.value)}>
                    <option value="">Person wählen …</option>
                    {mitglieder.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                  <Button
                    disabled={!zuweisenAn || verteilungBusy}
                    onClick={() =>
                      void verteilungsAktion(
                        () => zuweisen(lead.id, zuweisenAn),
                        `Lead an ${nameVon(zuweisenAn)} zugewiesen`,
                        'Der Lead konnte nicht zugewiesen werden.',
                      ).then(() => setZuweisenAn(''))
                    }
                  >
                    Zuweisen
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-5 lg:col-span-2 lg:col-start-1 lg:row-span-2 lg:row-start-1">
          <Card className="p-5">
            <h2 className="mb-4 font-semibold text-ink-800">Status</h2>
            <div className="flex flex-wrap items-center gap-2">
              {PIPELINE_STATUS.map((status, i) => {
                const aktuell = status === lead.status
                const erreicht = !abgeschlossen && pipelineIndex >= 0 && i <= pipelineIndex
                return (
                  <button
                    key={status}
                    disabled={statusBusy || !kannBearbeiten}
                    onClick={() => bitteStatus(status)}
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
                disabled={!kannBearbeiten}
              >
                <option value="">Status wählen …</option>
                {CLOSING_STATUS.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
              <Button variant="danger" disabled={!abschluss || statusBusy || !kannBearbeiten} onClick={() => abschluss && bitteStatus(abschluss)}>
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
              disabled={!z.darfBearbeiten}
            />
            <div className="mt-2 flex justify-end">
              <Button onClick={() => void speichereNotiz()} disabled={speichertNotiz || !notiz.trim() || !z.darfBearbeiten}>
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

        <div className="space-y-5 lg:col-start-3 lg:row-start-2">
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

      {sperrDialog && <SperrDialog leadName={lead.name} busy={verteilungBusy} onBestaetigen={(g) => void sperreLead(g)} onClose={() => setSperrDialog(false)} />}
      {entsperrDialog && (
        <BestaetigenDialog
          titel="Sperre aufheben"
          text={`Die Sperre für „${lead.name}“ und die Rufnummer auf der Sperrliste wird aufgehoben. Der Status bleibt unverändert und kann danach geändert werden.`}
          bestaetigenText="Sperre aufheben"
          busy={verteilungBusy}
          onBestaetigen={() => void hebeSperreAuf()}
          onClose={() => setEntsperrDialog(false)}
        />
      )}
      {rueckfrage && (
        <BestaetigenDialog
          titel={rueckfrage === 'gewonnen' ? 'Als gewonnen markieren?' : 'Lead abschließen?'}
          text={
            rueckfrage === 'gewonnen'
              ? `„${lead.name}“ wird als „Gewonnen“ markiert.`
              : `„${lead.name}“ wird als „${STATUS_LABEL[rueckfrage]}“ abgeschlossen und danach nicht mehr angerufen. Nur der Geschäftsführer kann das später ändern.`
          }
          bestaetigenText={rueckfrage === 'gewonnen' ? 'Gewonnen setzen' : 'Abschließen'}
          gefaehrlich={rueckfrage !== 'gewonnen'}
          busy={statusBusy}
          onBestaetigen={() => {
            const st = rueckfrage
            setRueckfrage(null)
            void setzeStatus(st)
          }}
          onClose={() => setRueckfrage(null)}
        />
      )}
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
