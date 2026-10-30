import { useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CalendarCheck, Clock3, Info, Loader2, PartyPopper, Phone, PhoneOff, RefreshCw, Smartphone, ThumbsDown } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useLeads } from '../../context/LeadsContext'
import { useToast } from '../../components/ToastContext'
import NummerKopieren from '../../components/NummerKopieren'
import { Badge, Button, Card, ErrorBlock, LoadingBlock, SectionHeader, inputClass } from '../../components/ui'
import { addNotiz, fetchNotizen, logAnruf, type Notiz } from '../../lib/leadsApi'
import { anrufenSipgate, telefonieStatus as ladeTelefonieStatus } from '../../lib/telefonieApi'
import { sollAufTelFallen } from '../../lib/telefonie'
import {
  ageInDays,
  dialerPatch,
  telHref,
  type AnrufKanal,
  type DbLead,
  type DialerErgebnis,
} from '../../lib/leads'
import { formatDateTime, formatEuroExact } from '../../lib/utils'
import { eingabeZeitzone, lokalZuIso, morgenFrueh } from '../../lib/zeit'

const ABSCHLUSS_TEXT: Partial<Record<DialerErgebnis, string>> = {
  kein_interesse: 'Kein Interesse',
  verstorben: 'Verstorben',
  nicht_mehr_pkv: 'Nicht mehr PKV',
  schon_umgestellt: 'Schon umgestellt',
}

export default function PowerDialer() {
  const { session } = useAuth()
  const { leads, queue, loading, queueError, reload, updateLead, uebernehmen, refreshLead } = useLeads()
  const meId = session?.user.id ?? null
  const { showToast } = useToast()
  const navigate = useNavigate()

  // Die Liste wird beim Start eingefroren, damit der aktuelle Lead nicht verschwindet, wenn waehrenddessen neue Leads eingehen.
  const [liste, setListe] = useState<DbLead[] | null>(null)
  const [index, setIndex] = useState(0)
  const [bearbeitet, setBearbeitet] = useState<Set<string>>(new Set())

  const [notiz, setNotiz] = useState('')
  const [vorherige, setVorherige] = useState<Notiz[]>([])
  const [angerufen, setAngerufen] = useState<{ kanal: AnrufKanal; zeit: string; sipgate?: boolean } | null>(null)
  // sipgate-Telefonie: 'laden' bis der Status bekannt ist; bei Fehlern/ohne Verbindung faellt "Mobil" auf tel: zurueck
  const [telefonie, setTelefonie] = useState<'laden' | 'verbunden' | 'nicht_verbunden'>('laden')
  const [mobilBusy, setMobilBusy] = useState(false)
  const [mobilFehler, setMobilFehler] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [spaeterOffen, setSpaeterOffen] = useState(false)
  const [spaeterWert, setSpaeterWert] = useState(() => morgenFrueh(new Date(), eingabeZeitzone()))
  const [bestaetige, setBestaetige] = useState<DialerErgebnis | null>(null)

  useEffect(() => {
    if (liste === null && !loading && !queueError) setListe(queue)
  }, [liste, loading, queueError, queue])

  // Ist sipgate verbunden? (schnelle Abfrage ohne Live-Pruefung bei sipgate)
  useEffect(() => {
    let aktiv = true
    void ladeTelefonieStatus(false).then((res) => {
      if (aktiv) setTelefonie(res.data?.verbunden ? 'verbunden' : 'nicht_verbunden')
    })
    return () => {
      aktiv = false
    }
  }, [])

  // Aktueller Stand der Zuweisung: aus der (live aktualisierten) Lead-Liste, sonst aus dem eingefrorenen Stand
  const frischer = useCallback((l: DbLead): DbLead => leads.find((x) => x.id === l.id) ?? l, [leads])
  const istFremd = useCallback(
    (l: DbLead) => {
      const a = frischer(l).zugewiesen_an
      return a !== null && a !== meId
    },
    [frischer, meId],
  )

  // Inzwischen von jemand anderem uebernommene Leads werden sauber uebersprungen (die Liste springt sonst nicht um)
  const aktuellIndex = useMemo(() => {
    if (!liste) return 0
    let i = index
    while (i < liste.length && istFremd(liste[i])) i++
    return i
  }, [liste, index, istFremd])
  const uebersprungen = useMemo(() => (liste ? liste.slice(index, aktuellIndex) : []), [liste, index, aktuellIndex])

  const aktuell = liste && aktuellIndex < liste.length ? frischer(liste[aktuellIndex]) : null
  const aktuellId = aktuell?.id ?? null
  const aktuellFrei = aktuell !== null && aktuell.zugewiesen_an === null

  // Notizen des aktuellen Leads laden und Eingabefelder zuruecksetzen
  useEffect(() => {
    setNotiz('')
    setAngerufen(null)
    setMobilFehler(null)
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

  // Neue Leads seit dem Start der Runde (live per Realtime): freie zuerst, neueste zuerst
  const neueLeads = useMemo(() => {
    if (!liste) return []
    const ids = new Set(liste.map((l) => l.id))
    return queue.filter((l) => !ids.has(l.id) && !bearbeitet.has(l.id))
  }, [liste, queue, bearbeitet])
  const neuVerfuegbar = neueLeads.length

  const neuLaden = useCallback(() => {
    setListe(queue)
    setIndex(0)
    setBearbeitet(new Set())
  }, [queue])

  // Freien Lead uebernehmen (atomar). Gibt true zurueck, wenn der Lead jetzt mir gehoert.
  async function sichereUebernahme(lead: DbLead, still = false): Promise<boolean> {
    if (lead.zugewiesen_an === meId) return true
    const res = await uebernehmen(lead.id)
    if (res.fehler) {
      showToast(res.fehler, 'info')
      return false
    }
    if (res.ok) {
      if (!still) showToast(`${lead.name} übernommen`)
      return true
    }
    // ok=false: entweder schon vergeben oder (selten) schon mein Lead
    const neu = await refreshLead(lead.id)
    if (neu && neu.zugewiesen_an === meId) return true
    showToast('Dieser Lead wurde inzwischen von jemand anderem übernommen.', 'info')
    return false
  }

  async function anrufen(kanal: AnrufKanal) {
    if (!aktuell || !session) return
    const err = await logAnruf(aktuell.id, session.user.id, kanal)
    if (err) showToast(`${err} Der Anruf wird trotzdem gestartet.`, 'info')
    else setAngerufen({ kanal, zeit: new Date().toISOString() })
  }

  // tel:-Link: Ein freier Lead wird VOR dem Waehlen uebernommen (Navigation erst danach), eigene Leads wie bisher direkt.
  async function telKlick(e: MouseEvent<HTMLAnchorElement>, kanal: AnrufKanal) {
    if (!aktuell) return
    if (aktuellFrei) {
      e.preventDefault()
      const href = e.currentTarget.href
      if (!(await sichereUebernahme(aktuell, true))) return
      await anrufen(kanal)
      window.location.href = href
      return
    }
    void anrufen(kanal)
  }

  // Mobil (Satellite) ueber sipgate: Es wird nur die Lead-ID gesendet; die Funktion laedt die Nummer selbst, uebernimmt einen freien Lead
  // vor dem Anruf und protokolliert den Anruf.
  async function mobilUeberSipgate() {
    if (!aktuell || mobilBusy) return
    setMobilBusy(true)
    setMobilFehler(null)
    setAngerufen(null)
    const res = await anrufenSipgate(aktuell.id)
    setMobilBusy(false)
    if (res.error) {
      if (res.code === 'lead_vergeben') {
        showToast(res.error, 'info')
        void refreshLead(aktuell.id)
      } else if (sollAufTelFallen(res.code)) {
        setTelefonie('nicht_verbunden')
        showToast('Telefonie nicht verbunden (Mein Profil → Telefonie). „Mobil“ nutzt jetzt die Telefon-Anwendung.', 'info')
      } else {
        setMobilFehler(res.error)
      }
      return
    }
    setAngerufen({ kanal: 'mobil', zeit: new Date().toISOString(), sipgate: true })
    showToast('Dein Telefon klingelt gleich.')
    if (aktuellFrei) void refreshLead(aktuell.id) // der Lead gehoert jetzt mir
  }

  async function neuenLeadUebernehmen(lead: DbLead) {
    const res = await uebernehmen(lead.id)
    if (res.fehler) {
      showToast(res.fehler, 'info')
      return
    }
    if (!res.ok) {
      showToast('Dieser Lead wurde bereits von jemand anderem übernommen.', 'info')
      return
    }
    showToast(`${lead.name} übernommen – er steht als nächster Lead bereit`)
    // direkt nach dem aktuellen Lead einreihen
    setListe((prev) => {
      if (!prev || prev.some((l) => l.id === lead.id)) return prev
      const kopie = [...prev]
      kopie.splice(Math.min(aktuellIndex + 1, kopie.length), 0, lead)
      return kopie
    })
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
    // Ein freier Lead wird zuerst uebernommen (Datenbankregel: nur eigene Leads duerfen geaendert werden)
    if (aktuellFrei && !(await sichereUebernahme(aktuell, true))) {
      setBusy(false)
      return
    }
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
    setIndex(aktuellIndex + 1)
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

      {uebersprungen.length > 0 && (
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800" role="status">
          Übersprungen (inzwischen von jemand anderem übernommen): {uebersprungen.map((l) => l.name).join(', ')}
        </p>
      )}

      {neuVerfuegbar > 0 && (
        <div className="mb-4 rounded-xl border border-brand-100 bg-brand-50/60 p-3" aria-live="polite">
          <p className="mb-2 text-sm font-semibold text-brand-800">
            {neuVerfuegbar} neue{neuVerfuegbar === 1 ? 'r' : ''} Lead{neuVerfuegbar === 1 ? '' : 's'} eingegangen
          </p>
          <ul className="space-y-2">
            {neueLeads.slice(0, 5).map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm shadow-sm">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-ink-800">{l.name}</span>
                  <span className="block text-xs text-ink-400">
                    {l.gesellschaft} · {formatEuroExact(l.tarifbeitrag)} · {formatDateTime(l.eingang_zeit)}
                  </span>
                </span>
                {l.zugewiesen_an === null ? (
                  <>
                    <Badge tone="green">Neu, frei</Badge>
                    <Button onClick={() => void neuenLeadUebernehmen(l)}>Übernehmen</Button>
                  </>
                ) : (
                  <Badge tone="brand">Meiner</Badge>
                )}
              </li>
            ))}
          </ul>
          {neuVerfuegbar > 5 && <p className="mt-2 text-xs text-ink-500">… und {neuVerfuegbar - 5} weitere.</p>}
          <button onClick={neuLaden} className="mt-2 flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline">
            <RefreshCw size={14} /> Liste mit allen neuen Leads neu laden
          </button>
        </div>
      )}

      <div className="mb-4 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink-100">
          <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${((aktuellIndex + 1) / liste.length) * 100}%` }} />
        </div>
        <span className="whitespace-nowrap text-sm font-medium text-ink-500">
          Lead {aktuellIndex + 1} von {liste.length}
        </span>
      </div>

      <Card className="mx-auto max-w-xl p-5 sm:p-8">
        <div className="flex flex-wrap items-center justify-center gap-2 text-center">
          <Badge tone={aktuell.status === 'nicht_erreicht' ? 'amber' : aktuell.status === 'kontaktiert' ? 'brand' : 'ink'}>
            {aktuell.status === 'nicht_erreicht' ? 'Nicht erreicht' : aktuell.status === 'kontaktiert' ? 'Kontaktiert' : 'Neu'}
          </Badge>
          {aktuellFrei ? <Badge tone="green">Neu, frei</Badge> : <Badge tone="brand">Mein Lead</Badge>}
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
        <p className="mt-1 flex flex-wrap items-center justify-center gap-2 text-ink-500">
          {aktuell.telefon}
          <NummerKopieren nummer={aktuell.telefon} />
        </p>
        {aktuellFrei && (
          <div className="mt-3 flex justify-center">
            <Button
              variant="secondary"
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                await sichereUebernahme(aktuell)
                setBusy(false)
              }}
            >
              Übernehmen
            </Button>
          </div>
        )}
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
            onClick={(e) => void telKlick(e, 'festnetz')}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-3.5 py-3 text-sm font-medium text-white shadow-sm hover:bg-brand-700"
          >
            <Phone size={17} /> Festnetz (Webex)
          </a>
          {telefonie === 'nicht_verbunden' ? (
            <a
              href={telHref(aktuell.telefon)}
              onClick={(e) => void telKlick(e, 'mobil')}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-3.5 py-3 text-sm font-medium text-white shadow-sm hover:bg-brand-700"
            >
              <Smartphone size={17} /> Mobil (Satellite)
            </a>
          ) : (
            <button
              type="button"
              disabled={telefonie === 'laden' || mobilBusy}
              onClick={() => void mobilUeberSipgate()}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-3.5 py-3 text-sm font-medium text-white shadow-sm hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {telefonie === 'laden' || mobilBusy ? <Loader2 size={17} className="animate-spin" /> : <Smartphone size={17} />}
              {mobilBusy ? 'Verbindung wird aufgebaut …' : 'Mobil (Satellite)'}
            </button>
          )}
        </div>
        <p className="mt-2 flex items-start gap-1.5 text-xs text-ink-400">
          <Info size={13} className="mt-0.5 shrink-0" />
          {telefonie === 'verbunden' ? (
            <span>
              „Mobil (Satellite)“ löst den Anruf über sipgate aus: Zuerst klingelt Ihr Gerät, danach wird der Lead verbunden. „Festnetz (Webex)“ öffnet die
              Telefon-Anwendung (tel:); die Webex-Anbindung folgt noch.
            </span>
          ) : telefonie === 'nicht_verbunden' ? (
            <span>
              Telefonie nicht verbunden (<Link to="/profil" className="font-medium text-brand-700 hover:underline">Mein Profil → Telefonie</Link>). „Mobil“ öffnet bis dahin die
              Telefon-Anwendung des Geräts (tel:) und protokolliert den Anruf. Die Webex-Anbindung folgt noch.
            </span>
          ) : (
            <span>Telefonie-Status wird geprüft …</span>
          )}
        </p>
        {mobilFehler && (
          <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {mobilFehler}{' '}
            <a href={telHref(aktuell.telefon)} onClick={(e) => void telKlick(e, 'mobil')} className="font-medium underline">
              Stattdessen mit der Telefon-Anwendung anrufen
            </a>
          </p>
        )}
        {angerufen && (
          <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700" role="status">
            {angerufen.sipgate
              ? `Anruf über sipgate ausgelöst (${formatDateTime(angerufen.zeit)}) – Ihr Telefon klingelt gleich.`
              : `Anruf über ${angerufen.kanal === 'mobil' ? 'Mobil (Satellite)' : 'Festnetz (Webex)'} protokolliert (${formatDateTime(angerufen.zeit)}).`}
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
                <Button disabled={busy || !spaeterWert} onClick={() => void ergebnis('spaeter', lokalZuIso(spaeterWert, eingabeZeitzone()) ?? undefined)}>
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
