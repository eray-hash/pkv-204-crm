import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { AlertCircle, CheckCircle2, ExternalLink, KeyRound, Loader2, PhoneCall, ShieldCheck } from 'lucide-react'
import { useToast } from '../../components/ToastContext'
import PasswortFeld from '../../components/PasswortFeld'
import { Badge, Button, Card, ErrorBlock, Field, LoadingBlock, inputClass } from '../../components/ui'
import {
  telefonieGeraete,
  telefonieGeraetWaehlen,
  telefonieStatus,
  telefonieTrennen,
  telefonieVerbinden,
} from '../../lib/telefonieApi'
import { ANBIETER_LABEL, ERFORDERLICHE_RECHTE, geraetTypLabel, type TelefonieAnbieter, type TelefonieGeraet, type TelefonieStatus } from '../../lib/telefonie'

type Modus = 'uebersicht' | 'verbinden' | 'geraetewahl'

export default function Telefonie() {
  const { showToast } = useToast()
  const [status, setStatus] = useState<TelefonieStatus | null>(null)
  const [laden, setLaden] = useState(true)
  const [ladeFehler, setLadeFehler] = useState<string | null>(null)
  const [modus, setModus] = useState<Modus>('verbinden')

  const [anbieter, setAnbieter] = useState<TelefonieAnbieter>('sipgate_classic')
  const [tokenId, setTokenId] = useState('')
  const [token, setToken] = useState('')
  const [geraete, setGeraete] = useState<TelefonieGeraet[]>([])
  const [auswahl, setAuswahl] = useState('')
  const [caller, setCaller] = useState('')
  const [anzeige, setAnzeige] = useState('')

  const [busy, setBusy] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const [trennenFrage, setTrennenFrage] = useState(false)

  const zeigeGeraeteWahl = useCallback((liste: TelefonieGeraet[], vorauswahl: string | null) => {
    setGeraete(liste)
    setAuswahl(vorauswahl && liste.some((g) => g.id === vorauswahl) ? vorauswahl : (liste[0]?.id ?? ''))
    setModus('geraetewahl')
  }, [])

  const ladeStatus = useCallback(async () => {
    setLaden(true)
    setLadeFehler(null)
    const res = await telefonieStatus(true)
    if (res.error || !res.data) {
      setLadeFehler(res.error ?? 'Der Status konnte nicht geladen werden.')
      setLaden(false)
      return
    }
    setStatus(res.data)
    setCaller(res.data.rufnummerCaller ?? '')
    setAnzeige(res.data.rufnummerAnzeige ?? '')
    if (res.data.anbieter) setAnbieter(res.data.anbieter)
    if (!res.data.tokenGespeichert) {
      setModus('verbinden')
    } else if (!res.data.verbunden) {
      const g = await telefonieGeraete()
      if (g.data) zeigeGeraeteWahl(g.data, null)
      else {
        setFehler(g.error)
        setModus('verbinden')
      }
    } else {
      setModus('uebersicht')
    }
    setLaden(false)
  }, [zeigeGeraeteWahl])

  useEffect(() => {
    void ladeStatus()
  }, [ladeStatus])

  async function verbinden(e: FormEvent) {
    e.preventDefault()
    setFehler(null)
    if (!tokenId.trim() || !token.trim()) {
      setFehler('Bitte Token-ID und Token eingeben.')
      return
    }
    setBusy(true)
    const res = await telefonieVerbinden(tokenId.trim(), token.trim(), anbieter)
    setBusy(false)
    if (res.error || !res.data) {
      setFehler(res.error ?? 'Die Verbindung konnte nicht hergestellt werden.')
      return
    }
    // Das Token wird sofort aus dem Browser-Speicher entfernt; es liegt nur noch verschluesselt auf dem Server.
    setToken('')
    setTokenId('')
    showToast('sipgate-Token geprüft – bitte jetzt ein Gerät auswählen')
    zeigeGeraeteWahl(res.data, status?.geraetId ?? null)
    setStatus((s) => (s ? { ...s, anbieter, tokenGespeichert: true, verbunden: false } : s))
  }

  async function geraetSpeichern() {
    setFehler(null)
    if (!auswahl) {
      setFehler('Bitte ein Gerät auswählen.')
      return
    }
    setBusy(true)
    const res = await telefonieGeraetWaehlen(auswahl, caller.trim(), anzeige.trim())
    setBusy(false)
    if (res.error) {
      setFehler(res.error)
      return
    }
    showToast('Telefonie ist verbunden')
    await ladeStatus()
  }

  async function geraetAendern() {
    setFehler(null)
    setBusy(true)
    const res = await telefonieGeraete()
    setBusy(false)
    if (res.data) zeigeGeraeteWahl(res.data, status?.geraetId ?? null)
    else setFehler(res.error ?? 'Die Geräte konnten nicht geladen werden.')
  }

  async function trennen() {
    setBusy(true)
    const res = await telefonieTrennen()
    setBusy(false)
    setTrennenFrage(false)
    if (res.error) {
      setFehler(res.error)
      return
    }
    showToast('Telefonie wurde getrennt')
    setGeraete([])
    setCaller('')
    setAnzeige('')
    await ladeStatus()
  }

  if (laden) return <LoadingBlock text="Telefonie-Status wird geladen …" />
  if (ladeFehler) return <ErrorBlock message={ladeFehler} onRetry={() => void ladeStatus()} />

  const verbunden = status?.verbunden === true

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-semibold text-ink-800">
            <PhoneCall size={16} /> sipgate-Telefonie
          </h2>
          {verbunden ? <Badge tone="green">Verbunden</Badge> : <Badge tone="amber">Nicht verbunden</Badge>}
        </div>

        {verbunden && status ? (
          <div className="mt-4 space-y-3 text-sm">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Info label="Kontotyp" wert={status.anbieter ? `sipgate ${ANBIETER_LABEL[status.anbieter]}` : '–'} />
              <Info label="Gerät" wert={status.geraetName ?? status.geraetId ?? '–'} />
              {status.geraetName && status.geraetId && <Info label="Geräte-ID" wert={status.geraetId} />}
              {status.rufnummerCaller && <Info label="Eigene Rufnummer (klingelt zuerst)" wert={status.rufnummerCaller} />}
              {status.rufnummerAnzeige && <Info label="Angezeigte Rufnummer beim Lead" wert={status.rufnummerAnzeige} />}
            </div>
            {status.tokenGueltig === true && (
              <p className="flex items-center gap-1.5 text-emerald-700">
                <CheckCircle2 size={15} /> Das Token ist gültig.
              </p>
            )}
            {status.tokenGueltig === false && (
              <p className="flex items-start gap-1.5 text-red-600" role="alert">
                <AlertCircle size={15} className="mt-0.5 shrink-0" /> Das gespeicherte Token funktioniert nicht mehr. Bitte neu verbinden.
              </p>
            )}
            {status.hinweis && <p className="text-xs text-ink-500">{status.hinweis}</p>}
            <p className="text-ink-500">
              Im Power Dialer löst der Button „Mobil (Satellite)“ den Anruf über sipgate aus: Zuerst klingelt Ihr Gerät, danach wird der Lead verbunden.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button variant="secondary" onClick={() => void geraetAendern()} disabled={busy}>
                Gerät ändern
              </Button>
              <Button variant="secondary" onClick={() => setModus('verbinden')} disabled={busy}>
                Neues Token eintragen
              </Button>
              {!trennenFrage ? (
                <Button variant="ghost" className="border border-ink-200 text-red-600" onClick={() => setTrennenFrage(true)} disabled={busy}>
                  Trennen
                </Button>
              ) : (
                <span className="flex flex-wrap items-center gap-2 rounded-lg bg-red-50 px-3 py-1.5 text-red-700">
                  Zugang wirklich löschen?
                  <Button variant="danger" onClick={() => void trennen()} disabled={busy}>
                    Ja, trennen
                  </Button>
                  <Button variant="secondary" onClick={() => setTrennenFrage(false)}>
                    Abbrechen
                  </Button>
                </span>
              )}
            </div>
          </div>
        ) : (
          <p className="mt-3 text-sm text-ink-500">
            Verbinden Sie Ihr persönliches sipgate-Konto, damit der Power Dialer Anrufe über Ihre Mobilnummer auslösen kann. Ohne Verbindung öffnet der
            Button „Mobil (Satellite)“ wie bisher die Telefon-Anwendung des Geräts.
          </p>
        )}
        {fehler && modus === 'uebersicht' && (
          <p className="mt-3 flex items-start gap-1.5 text-sm text-red-600" role="alert">
            <AlertCircle size={15} className="mt-0.5 shrink-0" /> {fehler}
          </p>
        )}
      </Card>

      {modus === 'verbinden' && (
        <Card className="p-5">
          <h2 className="mb-3 flex items-center gap-2 font-semibold text-ink-800">
            <KeyRound size={16} /> {verbunden ? 'Neues Token eintragen' : 'sipgate verbinden'}
          </h2>
          <fieldset className="mb-4">
            <legend className="mb-1 text-xs font-medium text-ink-500">Kontotyp bei sipgate</legend>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Kontotyp">
              {(['sipgate_classic', 'sipgate_neo'] as const).map((a) => (
                <label
                  key={a}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                    anbieter === a ? 'border-brand-400 bg-brand-50 text-brand-800' : 'border-ink-200 text-ink-600 hover:bg-ink-50'
                  }`}
                >
                  <input type="radio" name="kontotyp" value={a} checked={anbieter === a} onChange={() => setAnbieter(a)} className="h-4 w-4 text-brand-600" />
                  {ANBIETER_LABEL[a]}
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs text-ink-500">
              Woran man den Kontotyp erkennt, ist in der sipgate-API-Dokumentation nicht beschrieben (ein Personal Access Token verrät es nicht). Im
              Zweifel bitte den sipgate-Support fragen.
            </p>
            {anbieter === 'sipgate_neo' && (
              <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800" role="note">
                <p className="font-semibold">Neo: noch nicht erprobt, Zugangsweg ungeklärt</p>
                <p className="mt-1">
                  Zugangsweg für Neo-Konten ungeklärt; Token-Anlage im Web für neue Verträge evtl. nicht möglich, bitte sipgate-Support fragen. Der
                  Neo-Anruf ist nur so weit umgesetzt, wie die sipgate-Dokumentation ihn belegt (POST /calls), und wurde nie gegen ein echtes Konto
                  getestet. Bis das geklärt ist, hilft „Nummer kopieren“, um einen Lead manuell über die sipgate-App anzurufen.
                </p>
              </div>
            )}
          </fieldset>
          <ol className="mb-4 list-decimal space-y-1 pl-5 text-sm text-ink-600">
            <li>
              <a
                href="https://app.sipgate.com/personal-access-token"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline"
              >
                app.sipgate.com/personal-access-token <ExternalLink size={12} />
              </a>{' '}
              öffnen (Einstellungen → Personal Access Token).
            </li>
            <li>„Token hinzufügen“ wählen und einen Namen vergeben, z. B. „CRM“.</li>
            <li>
              Nur diese beiden Rechte auswählen:{' '}
              {ERFORDERLICHE_RECHTE[anbieter].map((r, i) => (
                <span key={r}>
                  {i > 0 && ' und '}
                  <code className="rounded bg-ink-100 px-1">{r}</code>
                </span>
              ))}
              .
            </li>
            <li>Token-ID und Token kopieren und unten eintragen. Das Token wird von sipgate nur einmal angezeigt.</li>
          </ol>
          <form onSubmit={verbinden} className="space-y-3" autoComplete="off">
            <Field label="Token-ID">
              <PasswortFeld
                value={tokenId}
                onChange={(e) => setTokenId(e.target.value)}
                autoComplete="off"
                placeholder="token-ABC123"
              />
            </Field>
            <Field label="Token">
              <PasswortFeld value={token} onChange={(e) => setToken(e.target.value)} autoComplete="new-password" />
            </Field>
            {fehler && (
              <p className="flex items-start gap-1.5 text-sm text-red-600" role="alert">
                <AlertCircle size={15} className="mt-0.5 shrink-0" /> {fehler}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={busy}>
                {busy && <Loader2 size={15} className="animate-spin" />} Verbinden und prüfen
              </Button>
              {verbunden && (
                <Button variant="secondary" onClick={() => setModus('uebersicht')} disabled={busy}>
                  Abbrechen
                </Button>
              )}
            </div>
            <p className="flex items-start gap-1.5 text-xs text-ink-400">
              <ShieldCheck size={13} className="mt-0.5 shrink-0" />
              Das Token wird nur einmal übertragen, auf dem Server verschlüsselt gespeichert und nie wieder angezeigt. Neo ist nach Doku umgesetzt, aber ungetestet.
            </p>
          </form>
        </Card>
      )}

      {modus === 'geraetewahl' && (
        <Card className="p-5">
          <h2 className="mb-1 font-semibold text-ink-800">Gerät auswählen</h2>
          <p className="mb-3 text-sm text-ink-500">Dieses Gerät klingelt zuerst, sobald Sie im Power Dialer „Mobil (Satellite)“ drücken.</p>
          <div className="space-y-2" role="radiogroup" aria-label="sipgate-Gerät">
            {geraete.map((g) => (
              <label
                key={g.id}
                className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm ${
                  auswahl === g.id ? 'border-brand-400 bg-brand-50' : 'border-ink-200 hover:bg-ink-50'
                }`}
              >
                <input type="radio" name="geraet" value={g.id} checked={auswahl === g.id} onChange={() => setAuswahl(g.id)} className="h-4 w-4 text-brand-600" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-ink-800">{g.name}</span>
                  <span className="block text-xs text-ink-400">
                    {geraetTypLabel(g.typ)} · ID {g.id}
                  </span>
                </span>
                <Badge tone={g.online ? 'green' : 'ink'}>{g.online ? 'online' : 'offline'}</Badge>
              </label>
            ))}
          </div>

          <details className="mt-4 rounded-xl bg-ink-50 px-3 py-2 text-sm">
            <summary className="cursor-pointer text-xs font-medium text-ink-500">Erweitert (optional)</summary>
            <div className="mt-3 space-y-3">
              {(status?.anbieter ?? anbieter) !== 'sipgate_neo' && (
                <Field label="Eigene Rufnummer, die zuerst klingeln soll (statt des Geräts)">
                  <input className={inputClass} value={caller} onChange={(e) => setCaller(e.target.value)} placeholder="z. B. +49 151 12345678" />
                </Field>
              )}
              <Field label="Rufnummer, die beim Lead angezeigt wird">
                <input className={inputClass} value={anzeige} onChange={(e) => setAnzeige(e.target.value)} placeholder="z. B. +49 30 1234567" />
              </Field>
            </div>
          </details>

          {fehler && (
            <p className="mt-3 flex items-start gap-1.5 text-sm text-red-600" role="alert">
              <AlertCircle size={15} className="mt-0.5 shrink-0" /> {fehler}
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => void geraetSpeichern()} disabled={busy || !auswahl}>
              {busy && <Loader2 size={15} className="animate-spin" />} Speichern
            </Button>
            {verbunden && (
              <Button variant="secondary" onClick={() => setModus('uebersicht')} disabled={busy}>
                Abbrechen
              </Button>
            )}
          </div>
        </Card>
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
