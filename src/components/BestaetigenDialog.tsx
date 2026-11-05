import { Button, Modal } from './ui'

/** Einfache Rueckfrage vor einer folgenreichen Aktion. */
export default function BestaetigenDialog({
  titel,
  text,
  bestaetigenText,
  gefaehrlich = false,
  busy = false,
  onBestaetigen,
  onClose,
}: {
  titel: string
  text: string
  bestaetigenText: string
  gefaehrlich?: boolean
  busy?: boolean
  onBestaetigen: () => void
  onClose: () => void
}) {
  return (
    <Modal open onClose={busy ? () => undefined : onClose} busy={busy} title={titel}>
      <p className="text-sm text-ink-600">{text}</p>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          Abbrechen
        </Button>
        <Button variant={gefaehrlich ? 'danger' : 'primary'} onClick={onBestaetigen} disabled={busy}>
          {bestaetigenText}
        </Button>
      </div>
    </Modal>
  )
}
