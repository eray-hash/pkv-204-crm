import { useState, type FormEvent } from 'react'
import { AlertCircle, Loader2 } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../components/ToastContext'
import PasswortFeld from '../../components/PasswortFeld'
import { Button, Card, Field } from '../../components/ui'
import { MIN_PASSWORT_LAENGE, pruefeNeuesPasswort } from '../../lib/passwort'

/** Passwort setzen oder aendern (auch fuer Konten, die ueber eine Einladung ohne Passwort angelegt wurden). */
export default function PasswortAendern() {
  const { updatePassword } = useAuth()
  const { showToast } = useToast()
  const [neu, setNeu] = useState('')
  const [wiederholung, setWiederholung] = useState('')
  const [busy, setBusy] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  async function speichern(e: FormEvent) {
    e.preventDefault()
    setFehler(null)
    const pruefung = pruefeNeuesPasswort(neu, wiederholung)
    if (pruefung) {
      setFehler(pruefung)
      return
    }
    setBusy(true)
    const err = await updatePassword(neu)
    setBusy(false)
    if (err) {
      setFehler(err)
      return
    }
    setNeu('')
    setWiederholung('')
    showToast('Passwort wurde gespeichert')
  }

  return (
    <Card className="mt-5 p-5">
      <h2 className="mb-1 font-semibold text-ink-800">Passwort ändern</h2>
      <p className="mb-4 text-xs text-ink-400">
        Hier können Sie Ihr Passwort jederzeit setzen oder ändern (mindestens {MIN_PASSWORT_LAENGE} Zeichen). Die Anmeldung läuft danach mit
        E-Mail-Adresse und Passwort.
      </p>
      <form onSubmit={speichern} className="max-w-sm space-y-3" noValidate>
        <Field label="Neues Passwort">
          <PasswortFeld autoComplete="new-password" value={neu} onChange={(e) => setNeu(e.target.value)} />
        </Field>
        <Field label="Neues Passwort wiederholen">
          <PasswortFeld autoComplete="new-password" value={wiederholung} onChange={(e) => setWiederholung(e.target.value)} />
        </Field>
        {fehler && (
          <p className="flex items-start gap-1.5 text-sm text-red-600" role="alert">
            <AlertCircle size={15} className="mt-0.5 shrink-0" /> {fehler}
          </p>
        )}
        <Button type="submit" disabled={busy}>
          {busy && <Loader2 size={15} className="animate-spin" />} Passwort speichern
        </Button>
      </form>
    </Card>
  )
}
