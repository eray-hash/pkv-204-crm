import { useState, type FormEvent } from 'react'
import { Button, Field, Modal, inputClass } from './ui'
import { SPERR_GRUENDE, sperrGrundText, type SperrGrundArt } from '../lib/leads'

/**
 * Rueckfrage "Widerruf / nicht mehr anrufen": Grund waehlen, dann bestaetigen. Gesperrte Leads werden nie wieder angerufen,
 * die Rufnummer kommt auf die Sperrliste (Aufheben kann nur der Geschaeftsfuehrer).
 */
export default function SperrDialog({
  leadName,
  busy,
  onBestaetigen,
  onClose,
}: {
  leadName: string
  busy: boolean
  onBestaetigen: (grund: string) => void
  onClose: () => void
}) {
  const [art, setArt] = useState<SperrGrundArt>('widerruf')
  const [freitext, setFreitext] = useState('')
  const grund = sperrGrundText(art, freitext)

  function absenden(e: FormEvent) {
    e.preventDefault()
    if (grund) onBestaetigen(grund)
  }

  return (
    <Modal open onClose={busy ? () => undefined : onClose} busy={busy} title="Widerruf / nicht mehr anrufen">
      <form onSubmit={absenden} className="space-y-3">
        <p className="text-sm text-ink-600">
          „{leadName}“ wird gesperrt und nie wieder angerufen. Die Rufnummer kommt auf die Sperrliste, weitere Leads mit derselben Nummer werden ebenfalls gesperrt.
          Nur der Geschäftsführer kann die Sperre wieder aufheben.
        </p>
        <fieldset>
          <legend className="mb-1 text-xs font-medium text-ink-500">Grund</legend>
          <div className="space-y-1.5">
            {SPERR_GRUENDE.map((g) => (
              <label key={g.id} className="flex items-center gap-2 text-sm text-ink-700">
                <input type="radio" name="sperrgrund" value={g.id} checked={art === g.id} onChange={() => setArt(g.id)} className="h-4 w-4 text-brand-600" />
                {g.label}
              </label>
            ))}
          </div>
        </fieldset>
        <Field label={art === 'sonstiges' ? 'Bitte den Grund angeben' : 'Zusatz (optional)'}>
          <input className={inputClass} value={freitext} onChange={(e) => setFreitext(e.target.value)} maxLength={300} required={art === 'sonstiges'} />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Abbrechen
          </Button>
          <Button type="submit" variant="danger" disabled={busy || !grund}>
            Lead sperren
          </Button>
        </div>
      </form>
    </Modal>
  )
}
