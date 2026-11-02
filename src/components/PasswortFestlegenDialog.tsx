import { useState, type FormEvent } from 'react'
import { AlertCircle, Loader2 } from 'lucide-react'
import PasswortFeld from './PasswortFeld'
import { Button, Field, Modal } from './ui'
import { setzeVorlaeufigesPasswort } from '../lib/mitarbeiterApi'
import { MIN_VORLAEUFIG_LAENGE, pruefeVorlaeufigesPasswort } from '../lib/passwort'
import { useToast } from './ToastContext'

/** Dialog fuer den Geschaeftsfuehrer: vorlaeufiges Passwort fuer ein Teammitglied festlegen (ohne E-Mail). */
export default function PasswortFestlegenDialog({ ziel, onClose }: { ziel: { id: string; name: string } | null; onClose: () => void }) {
  if (!ziel) return null
  // key: pro Person ein frischer Zustand, damit nie ein altes Passwort stehen bleibt
  return <Inhalt key={ziel.id} ziel={ziel} onClose={onClose} />
}

function Inhalt({ ziel, onClose }: { ziel: { id: string; name: string }; onClose: () => void }) {
  const { showToast } = useToast()
  const [passwort, setPasswort] = useState('')
  const [wiederholung, setWiederholung] = useState('')
  const [busy, setBusy] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  async function speichern(e: FormEvent) {
    e.preventDefault()
    setFehler(null)
    const pruefung = pruefeVorlaeufigesPasswort(passwort, wiederholung)
    if (pruefung) {
      setFehler(pruefung)
      return
    }
    setBusy(true)
    const err = await setzeVorlaeufigesPasswort(ziel.id, passwort)
    setBusy(false)
    // Felder in jedem Fall leeren, das Passwort wird nie wieder angezeigt
    setPasswort('')
    setWiederholung('')
    if (err) {
      setFehler(err)
      return
    }
    showToast(`Vorläufiges Passwort für ${ziel.name || 'das Teammitglied'} wurde gesetzt`)
    onClose()
  }

  return (
    <Modal open onClose={busy ? () => undefined : onClose} title={`Passwort festlegen: ${ziel.name || 'Teammitglied'}`}>
      <form onSubmit={speichern} className="space-y-3" noValidate>
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Geben Sie das Passwort telefonisch weiter, nicht per Chat oder Mail. Die Person muss es beim ersten Login ändern.
        </p>
        <Field label={`Vorläufiges Passwort (mindestens ${MIN_VORLAEUFIG_LAENGE} Zeichen)`}>
          <PasswortFeld autoComplete="new-password" value={passwort} onChange={(e) => setPasswort(e.target.value)} />
        </Field>
        <Field label="Passwort wiederholen">
          <PasswortFeld autoComplete="new-password" value={wiederholung} onChange={(e) => setWiederholung(e.target.value)} />
        </Field>
        {fehler && (
          <p className="flex items-start gap-1.5 text-sm text-red-600" role="alert">
            <AlertCircle size={15} className="mt-0.5 shrink-0" /> {fehler}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Abbrechen
          </Button>
          <Button type="submit" disabled={busy}>
            {busy && <Loader2 size={15} className="animate-spin" />} Passwort festlegen
          </Button>
        </div>
      </form>
    </Modal>
  )
}
