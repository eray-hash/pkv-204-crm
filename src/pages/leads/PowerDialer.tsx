import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CalendarCheck, Clock3, Info, PartyPopper, Phone, PhoneOff, RefreshCw, Smartphone, ThumbsDown } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useLeads } from '../../context/LeadsContext'
import { useToast } from '../../components/ToastContext'
import { Badge, Button, Card, ErrorBlock, LoadingBlock, SectionHeader, inputClass } from '../../components/ui'
import { addNotiz, fetchNotizen, logAnruf, type Notiz } from '../../lib/leadsApi'
import {
  ageInDays,
  dialerPatch,
  telHref,
  type AnrufKanal,
  type DbLead,
  type DialerErgebnis,
} from '../../lib/leads'
import { formatDateTime, formatEuroExact } from '../../lib/utils'

const ABSCHLUSS_TEXT: Partial<Record<DialerErgebnis, string>> = {
  kein_interesse: 'Kein Interesse',
  verstorben: 'Verstorben',
  nicht_mehr_pkv: 'Nicht mehr PKV',
  schon_umgestellt: 'Schon umgestellt',
}

function lokalesDatumsfeld(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

function morgenFrueh(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(9, 0, 0, 0)
  return lokalesDatumsfeld(d)
}

export default function PowerDialer() {
  const { session } = useAuth()
  const { queue, loading, queueError, reload, updateLead } = useLeads()
  const { showToast } = useToast()
  const navigate = useNavigate()

  // Die Liste wird beim Start eingefroren, damit der aktuelle Lead nicht verschwindet, wenn waehrenddessen neue Leads eingehen.
  const [liste, setListe] = useState<DbLead[] | null>(null)
  const [index, setIndex] = useState(0)
  const [bearbeitet, setBearbeitet] = useState<Set<string>>(new Set())

  const [notiz, setNotiz] = useState('')
  const [vorherige, setVorherige] = useState<Notiz[]>([])
  const [angerufen, setAngerufen] = useState<{ kanal: AnrufKanal; zeit: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [spaeterOffen, setSpaeterOffen] = useState(false)
  const [spaeterWert, setSpaeterWert] = useState(morgenFrueh)
  const [bestaetige, setBestaetige] = useState<DialerErgebnis | null>(null)

  useEffect(() => {
    if (liste === null && !loading && !queueError) setListe(queue)
  }, [liste, loading, queueError, queue])

  const aktuell = liste?.[index] ?? null
  const aktuellId = aktuell?.id ?? null

  // Notizen des aktuellen Leads laden und Eingabefelder zuruecksetzen
  useEffect(() => {
    setNotiz('')
    setAngerufen(null)
    setSpaeterOffen(false)
    setBestaetige(null)
    setVorherige([])
    if (!aktuellId) return
    let aktiv = true
    void fetchNotizen(aktuellId).then((res) => {
      if (aktiv && res.data) setVorherige(res.data)
    })
    return () => {
      aktiv = false
    }
  }, [aktuellId])

  const neuVerfuegbar = useMemo(() => {
    if (!liste) return 0
    const ids = new Set(liste.map((l) => l.id))
    return queue.filter((l) => !ids.has(l.id) && !bearbeitet.has(l.id)).length
  }, [liste, queue, bearbeitet])

  const neuLaden = useCallback(() => {
    setListe(queue)
    setIndex(0)
    setBearbeitet(new Set())
  }, [queue])

  async function anrufen(kanal: AnrufKanal) {
    if (!aktuell || !session) return
    const err = await logAnruf(aktuell.id, session.user.id, kanal)
    if (err) showToast(`${err} Der Anruf wird trotzdem gestartet.`, 'info')
    else setAngerufen({ kanal, zeit: new Date().toISOString() })
  }

  async function notizSpeichern(): Promise<boolean> {
    if (!aktuell || !session || !notiz.trim()) return true
    const err = await addNotiz(aktuell.id, session.user.id, notiz)
    if (err) {
      showToast(err, 'info')
      return false
    }
    setNotiz('')
    const n = await fetchNotizen(aktuell.id)
    if (n.data) setVorherige(n.data)
    return true
  }

  async function nurNotiz() {
    setBusy(true)
    const ok = await notizSpeichern()
    setBusy(false)
    if (ok && notiz.trim()) showToast('Notiz gespeichert')
  }

  async function ergebnis(e: DialerErgebnis, spaeterAb?: string) {
    if (!aktuell) return
    let patch
    try {
      patch = dialerPatch(e, new Date(), spaeterAb)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Ungültige Eingabe.', 'info')
      return
    }
    if (e === 'spaeter' && patch.naechster_anruf_ab && Date.parse(patch.naechster_anruf_ab) <= Date.now()) {
      showToast('Der Zeitpunkt muss in der Zukunft liegen.', 'info')
      return
    }
    setBusy(true)
    const notizOk = await notizSpeichern()
    if (!notizOk) {
      setBusy(false)
      return
    }
    const err = await updateLead(aktuell.id, patch)
    setBusy(false)
    if (err) {
      showToast(err, 'info')
      return
    }
    showToast(erfolgsText(e, aktuell.name))
    setBearbeitet((prev) => new Set(prev).add(aktuell.id))
    setIndex((i) => i + 1)
  }

  if (loading && liste === null) return <LoadingBlock text="Anrufliste wird geladen …" />

  const kopf = <SectionHeader title="Power Dialer" subtitle="Anrufbare Leads (mit Einwilligungsnachweis), neueste zuerst" />

  if (queueError && liste === null) {
    return (
      <div>
        {kopf}
        <ErrorBlock message={queueError} onRetry={() => void reload()} />
      </div>
    )
  }

  if (!liste || liste.length === 0) {
    return (
      <div>
        {kopf}
        <Card className="p-8 text-center text-sm text-ink-500">
          Aktuell gibt es keine anrufbaren Leads. Neue Leads erscheinen hier automatisch, sobald sie eingehen.
          <div className="mt-4 flex justify-center">
            <Button variant="secondary" onClick={() => void reload()}>
              <RefreshCw size={15} /> Aktualisieren
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  if (!aktuell) {
    return (
      <div>
        {kopf}
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <PartyPopper size={36} className="text-brand-500" />
          <h2 className="text-lg font-semibold text-ink-800">Liste abgeschlossen</h2>
          <p className="text-sm text-ink-500">Alle {liste.length} Leads dieser Runde wurden bearbeitet.</p>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            <Button onClick={neuLaden}>
              <RefreshCw size={15} /> Anrufliste neu laden{queue.length > 0 ? ` (${queue.length})` : ''}
            </Button>
            <Button variant="secondary" onClick={() => navigate('/leads')}>
              Zur Leadübersicht
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div>
      {kopf}

      {neuVerfuegbar > 0 && (
        <button
          onClick={neuLaden}
          className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-50 px-4 py-2.5 text-sm font-medium text-brand-700 hover:bg-brand-100"
        >
          <RefreshCw size={15} /> {neuVerfuegbar} neue{neuVerfuegbar === 1 ? 'r' : ''} Lead{neuVerfuegbar === 1 ? '' : 's'} verfügbar – Liste neu laden
        </button>
      )}

      <div className="mb-4 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink-100">
          <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${((index + 1) / liste.length) * 100}%` }} />
        </div>
        <span className="whitespace-nowrap text-sm font-medium text-ink-500">
          Lead {index + 1} von {liste.length}
        </span>
      </div>

      <Card className="mx-auto max-w-xl p-5 sm:p-8">
        <div className="flex flex-wrap items-center justify-center gap-2 text-center">
          <Badge tone={aktuell.status === 'nicht_erreicht' ? 'amber' : aktuell.status === 'kontaktiert' ? 'brand' : 'ink'}>
            {aktuell.status === 'nicht_erreicht' ? 'Nicht erreicht' : aktuell.status === 'kontaktiert' ? 'Kontaktiert' : 'Neu'}
          </Badge>
          {aktuell.moegliches_duplikat_von && (
            <Link to={`/leads/${aktuell.moegliches_duplikat_von}`}>
              <Badge tone="amber">Mögliches Duplikat – ursprünglichen Lead öffnen</Badge>
            </Link>
          )}
        </div>
        <h2 className="mt-3 text-center text-2xl font-semibold text-ink-900">
          <Link to={`/leads/${aktuell.id}`} className="hover:text-brand-700">
            {aktuell.name}
          </Link>
        </h2>
        <p className="mt-1 text-center text-ink-500">{aktuell.telefon}</p>
        <p className="break-all text-center text-sm text-ink-400">{aktuell.email}</p>

        <div className="mt-5 grid grid-cols-2 gap-3 rounded-xl bg-ink-50 p-4 text-left text-sm">
          <div>
            <p className="text-xs text-ink-400">Gesellschaft</p>
            <p className="font-medium text-ink-700">{aktuell.gesellschaft}</p>
          </div>
          <div>
            <p className="text-xs text-ink-400">Tarifbeitrag</p>
            <p className="font-medium text-ink-700">{formatEuroExact(aktuell.tarifbeitrag)} / Monat</p>
          </div>
          <div>
            <p className="text-xs text-ink-400">Eingang</p>
            <p className="font-medium text-ink-700">
              {formatDateTime(aktuell.eingang_zeit)} <span className="text-ink-400">({ageInDays(aktuell.eingang_zeit)} T.)</span>
            </p>
          </div>
          {aktuell.quelle && (
            <div>
              <p className="text-xs text-ink-400">Quelle</p>
              <p className="font-medium text-ink-700">{aktuell.quelle}</p>
            </div>
          )}
        </div>

        <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <a
            href={telHref(aktuell.telefon)}
            onClick={() => void anrufen('festnetz')}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-3.5 py-3 text-sm font-medium text-white shadow-sm hover:bg-brand-700"
          >
            <Phone size={17} /> Festnetz (Webex)
          </a>
          <a
            href={telHref(aktuell.telefon)}
            onClick={() => void anrufen('mobil')}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-3.5 py-3 text-sm font-medium text-white shadow-sm hover:bg-brand-700"
          >
            <Smartphone size={17} /> Mobil (Satellite)
          </a>
        </div>
        <p className="mt-2 flex items-start gap-1.5 text-xs text-ink-400">
          <Info size={13} className="mt-0.5 shrink-0" />
          Die echte Webex- bzw. Satellite-Anbindung folgt noch. Bis dahin öffnet der Button die Telefon-Anwendung des Geräts (tel:) und protokolliert den Anruf.
        </p>
        {angerufen && (
          <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700" role="status">
            Anruf über {angerufen.kanal === 'mobil' ? 'Mobil (Satellite)' : 'Festnetz (Webex)'} protokolliert ({formatDateTime(angerufen.zeit)}).
          </p>
        )}

        <div className="mt-5">
          <label className="mb-1 block text-xs font-medium text-ink-500" htmlFor="dialer-notiz">
            Notiz zum Gespräch
          </label>
          <textarea
            id="dialer-notiz"
            className={`${inputClass} min-h-[80px]`}
            value={notiz}
            onChange={(e) => setNotiz(e.target.value)}
            maxLength={10000}
            placeholder="Wird beim Speichern oder mit dem Ergebnis abgelegt …"
          />
          <div className="mt-2 flex justify-end">
            <Button variant="secondary" onClick={() => void nurNotiz()} disabled={busy || !notiz.trim()}>
              Notiz speichern
            </Button>
          </div>
          {vorherige.length > 0 && (
            <details className="mt-2 rounded-lg bg-ink-50 px-3 py-2 text-sm">
              <summary className="cursor-pointer text-xs font-medium text-ink-500">Frühere Notizen ({vorherige.length})</summary>
              <div className="mt-2 space-y-2">
                {vorherige.slice(0, 5).map((n) => (
                  <div key={n.id}>
                    <p className="whitespace-pre-line text-ink-700">{n.text}</p>
                    <p className="text-xs text-ink-400">
                      {n.autor} · {formatDateTime(n.created_at)}
                    </p>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>

        <div className="mt-5 border-t border-ink-100 pt-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-400">Ergebnis des Anrufs</p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" disabled={busy} onClick={() => void ergebnis('nicht_erreicht')}>
              <PhoneOff size={16} /> Nicht erreicht
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => setSpaeterOffen((v) => !v)}>
              <Clock3 size={16} /> Später
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => void ergebnis('termin_vereinbart')}>
              <CalendarCheck size={16} /> Termin vereinbart
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => setBestaetige('kein_interesse')}>
              <ThumbsDown size={16} /> Kein Interesse
            </Button>
          </div>
          <p className="mb-1.5 mt-3 text-xs text-ink-400">Schließt den Lead ab (er wird nie wieder angerufen):</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Button variant="ghost" className="justify-center border border-ink-200" disabled={busy} onClick={() => setBestaetige('verstorben')}>
              Verstorben
            </Button>
            <Button variant="ghost" className="justify-center border border-ink-200" disabled={busy} onClick={() => setBestaetige('nicht_mehr_pkv')}>
              Nicht mehr PKV
            </Button>
            <Button variant="ghost" className="justify-center border border-ink-200" disabled={busy} onClick={() => setBestaetige('schon_umgestellt')}>
              Schon umgestellt
            </Button>
          </div>

          {spaeterOffen && (
            <div className="mt-3 rounded-xl bg-ink-50 p-3">
              <label className="mb-1 block text-xs font-medium text-ink-500" htmlFor="dialer-spaeter">
                Erneut anrufen ab
              </label>
              <input id="dialer-spaeter" type="datetime-local" className={inputClass} value={spaeterWert} onChange={(e) => setSpaeterWert(e.target.value)} />
              <div className="mt-2 flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setSpaeterOffen(false)}>
                  Abbrechen
                </Button>
                <Button disabled={busy || !spaeterWert} onClick={() => void ergebnis('spaeter', spaeterWert)}>
                  Später speichern
                </Button>
              </div>
            </div>
          )}

          {bestaetige && (
            <div className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alertdialog" aria-label="Abschluss bestätigen">
              Lead als „{ABSCHLUSS_TEXT[bestaetige]}“ abschließen? Er wird danach nie wieder angerufen.
              <div className="mt-2 flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setBestaetige(null)}>
                  Abbrechen
                </Button>
                <Button variant="danger" disabled={busy} onClick={() => void ergebnis(bestaetige)}>
                  Ja, abschließen
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}

function erfolgsText(e: DialerErgebnis, name: string): string {
  switch (e) {
    case 'nicht_erreicht':
      return `${name}: nicht erreicht, erneuter Versuch in 2 Stunden`
    case 'spaeter':
      return `${name}: Rückruf vorgemerkt`
    case 'termin_vereinbart':
      return `${name}: Termin vereinbart`
    default:
      return `${name}: abgeschlossen (${ABSCHLUSS_TEXT[e] ?? e})`
  }
}
