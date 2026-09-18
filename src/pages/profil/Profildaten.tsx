import { useState } from 'react'
import { useApp } from '../../context/AppContext'
import { useToast } from '../../components/ToastContext'
import { Card, Field, inputClass, Button } from '../../components/ui'
import { RefreshCw } from 'lucide-react'

export default function Profildaten() {
  const { state, dispatch } = useApp()
  const { showToast } = useToast()

  const [name, setName] = useState(state.profil.name)
  const [telefon, setTelefon] = useState(state.profil.telefon)
  const [email, setEmail] = useState(state.profil.email)
  const [signaturHtml, setSignaturHtml] = useState(state.profil.signaturHtml)
  const [signaturText, setSignaturText] = useState(state.profil.signaturText)

  function handleSave() {
    dispatch({ type: 'UPDATE_PROFIL', patch: { name, telefon, email, signaturHtml, signaturText } })
    showToast('Profildaten wurden gespeichert')
  }

  function handleNewPassword() {
    const generated = Math.random().toString(36).slice(-4) + Math.random().toString(36).slice(-4).toUpperCase() + '!' + Math.floor(Math.random() * 100)
    showToast(`Neues Passwort generiert: ${generated}`)
  }

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <h2 className="mb-4 font-semibold text-ink-800">Kontaktdaten</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Name">
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Telefon">
            <input className={inputClass} value={telefon} onChange={(e) => setTelefon(e.target.value)} />
          </Field>
          <Field label="E-Mail-Adresse">
            <input className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <div className="flex items-end">
            <Button variant="secondary" onClick={handleNewPassword}>
              <RefreshCw size={15} /> Neues Passwort generieren
            </Button>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="mb-1 font-semibold text-ink-800">E-Mail-Signatur (HTML)</h2>
        <p className="mb-3 text-xs text-ink-400">Wird bei ausgehenden E-Mails automatisch angehängt.</p>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <textarea
            className={`${inputClass} min-h-[140px] font-mono text-xs`}
            value={signaturHtml}
            onChange={(e) => setSignaturHtml(e.target.value)}
          />
          <div>
            <p className="mb-1 text-xs font-medium text-ink-500">Vorschau</p>
            <div className="min-h-[140px] rounded-lg border border-ink-200 bg-ink-50 p-3" dangerouslySetInnerHTML={{ __html: signaturHtml }} />
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="mb-1 font-semibold text-ink-800">E-Mail-Signatur (Klartext)</h2>
        <p className="mb-3 text-xs text-ink-400">Wird für Clients ohne HTML-Unterstützung verwendet.</p>
        <textarea className={`${inputClass} min-h-[100px]`} value={signaturText} onChange={(e) => setSignaturText(e.target.value)} />
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave}>Speichern</Button>
      </div>
    </div>
  )
}
