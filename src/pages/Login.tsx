import { useState, type FormEvent, type ReactNode } from 'react'
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { inputClass, Field } from '../components/ui'
import PasswortFeld from '../components/PasswortFeld'
import { pruefeNeuesPasswort } from '../lib/passwort'

type Modus = 'login' | 'reset' | 'neuesPasswort'

function Rahmen({ titel, untertitel, children }: { titel: string; untertitel: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-50 px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-sm font-bold text-white">§204</div>
          <div>
            <p className="text-base font-semibold leading-tight text-ink-900">PKV Tarifoptimierung</p>
            <p className="text-xs leading-tight text-ink-400">Lead-Management CRM</p>
          </div>
        </div>
        <div className="rounded-2xl border border-ink-100 bg-white p-6 shadow-sm">
          <h1 className="text-lg font-semibold text-ink-900">{titel}</h1>
          <p className="mb-5 mt-1 text-sm text-ink-500">{untertitel}</p>
          {children}
        </div>
      </div>
    </div>
  )
}

function Fehler({ text }: { text: string }) {
  return (
    <div role="alert" className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
      <AlertCircle size={16} className="mt-0.5 shrink-0" />
      <span>{text}</span>
    </div>
  )
}

function Erfolg({ text }: { text: string }) {
  return (
    <div role="status" className="flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
      <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
      <span>{text}</span>
    </div>
  )
}

function Senden({ busy, children }: { busy: boolean; children: ReactNode }) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-3.5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {busy && <Loader2 size={16} className="animate-spin" />}
      {children}
    </button>
  )
}

export default function Login({ start = 'login', startFehler = null }: { start?: Modus; startFehler?: string | null }) {
  const { signIn, sendPasswordReset, updatePassword } = useAuth()
  const [modus, setModus] = useState<Modus>(start)
  const [email, setEmail] = useState('')
  const [passwort, setPasswort] = useState('')
  const [passwort2, setPasswort2] = useState('')
  const [busy, setBusy] = useState(false)
  const [fehler, setFehler] = useState<string | null>(startFehler)
  const [erfolg, setErfolg] = useState<string | null>(null)

  function wechsle(m: Modus) {
    setModus(m)
    setFehler(null)
    setErfolg(null)
  }

  async function anmelden(e: FormEvent) {
    e.preventDefault()
    setFehler(null)
    if (!email.trim() || !passwort) {
      setFehler('Bitte E-Mail-Adresse und Passwort eingeben.')
      return
    }
    setBusy(true)
    const err = await signIn(email, passwort)
    setBusy(false)
    if (err) setFehler(err)
  }

  async function zuruecksetzen(e: FormEvent) {
    e.preventDefault()
    setFehler(null)
    setErfolg(null)
    if (!email.trim()) {
      setFehler('Bitte die E-Mail-Adresse eingeben.')
      return
    }
    setBusy(true)
    const err = await sendPasswordReset(email)
    setBusy(false)
    if (err) setFehler(err)
    else setErfolg('Falls zu dieser E-Mail-Adresse ein Konto existiert, wurde ein Link zum Zurücksetzen des Passworts gesendet.')
  }

  async function neuesSetzen(e: FormEvent) {
    e.preventDefault()
    setFehler(null)
    const pruefung = pruefeNeuesPasswort(passwort, passwort2)
    if (pruefung) {
      setFehler(pruefung)
      return
    }
    setBusy(true)
    const err = await updatePassword(passwort)
    setBusy(false)
    if (err) setFehler(err)
  }

  if (modus === 'neuesPasswort') {
    return (
      <Rahmen titel="Neues Passwort festlegen" untertitel="Bitte ein neues Passwort für Ihr Konto vergeben.">
        <form onSubmit={neuesSetzen} className="space-y-3" noValidate>
          <Field label="Neues Passwort">
            <PasswortFeld autoComplete="new-password" value={passwort} onChange={(e) => setPasswort(e.target.value)} />
          </Field>
          <Field label="Neues Passwort wiederholen">
            <PasswortFeld autoComplete="new-password" value={passwort2} onChange={(e) => setPasswort2(e.target.value)} />
          </Field>
          {fehler && <Fehler text={fehler} />}
          <Senden busy={busy}>Passwort speichern</Senden>
        </form>
      </Rahmen>
    )
  }

  if (modus === 'reset') {
    return (
      <Rahmen titel="Passwort vergessen" untertitel="Wir senden Ihnen einen Link zum Zurücksetzen per E-Mail.">
        <form onSubmit={zuruecksetzen} className="space-y-3" noValidate>
          <Field label="E-Mail-Adresse">
            <input type="email" autoComplete="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@firma.de" />
          </Field>
          {fehler && <Fehler text={fehler} />}
          {erfolg && <Erfolg text={erfolg} />}
          <Senden busy={busy}>Link senden</Senden>
          <button type="button" onClick={() => wechsle('login')} className="block w-full text-center text-sm font-medium text-brand-700 hover:underline">
            Zurück zur Anmeldung
          </button>
        </form>
      </Rahmen>
    )
  }

  return (
    <Rahmen titel="Anmelden" untertitel="Bitte mit Ihrer E-Mail-Adresse und Ihrem Passwort anmelden.">
      <form onSubmit={anmelden} className="space-y-3" noValidate>
        <Field label="E-Mail-Adresse">
          <input type="email" autoComplete="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@firma.de" />
        </Field>
        <Field label="Passwort">
          <PasswortFeld autoComplete="current-password" value={passwort} onChange={(e) => setPasswort(e.target.value)} />
        </Field>
        {fehler && <Fehler text={fehler} />}
        <Senden busy={busy}>Anmelden</Senden>
        <button type="button" onClick={() => wechsle('reset')} className="block w-full text-center text-sm font-medium text-brand-700 hover:underline">
          Passwort vergessen?
        </button>
      </form>
    </Rahmen>
  )
}
