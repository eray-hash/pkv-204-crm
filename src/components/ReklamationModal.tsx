import { useState, type FormEvent } from 'react'
import { useApp } from '../context/AppContext'
import { useToast } from './ToastContext'
import { Modal, Field, inputClass, Button } from './ui'
import { REKLAMATION_GRUENDE } from '../types'

export default function ReklamationModal({ open, onClose, leadId, leadName }: { open: boolean; onClose: () => void; leadId: string; leadName: string }) {
  const { dispatch } = useApp()
  const { showToast } = useToast()
  const [grund, setGrund] = useState<string>(REKLAMATION_GRUENDE[0])
  const [notiz, setNotiz] = useState('')

  function reset() {
    setGrund(REKLAMATION_GRUENDE[0])
    setNotiz('')
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (grund === 'Sonstiges' && !notiz.trim()) return
    dispatch({ type: 'REKLAMIEREN_LEAD', id: leadId, grund, notiz: notiz.trim() })
    showToast(`Lead „${leadName}“ wurde reklamiert und in die Liste „Reklamierte Leads“ verschoben`)
    reset()
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="Lead reklamieren">
      <p className="mb-4 text-sm text-ink-500">
        Die Reklamation wird in der Liste „Reklamierte Leads" als Signal an den Lead-Lieferanten erfasst.
      </p>
      <form onSubmit={handleSubmit} className="space-y-3">
        <Field label="Grund *">
          <select className={inputClass} value={grund} onChange={(e) => setGrund(e.target.value)}>
            {REKLAMATION_GRUENDE.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </Field>
        <Field label={grund === 'Sonstiges' ? 'Notiz (Pflichtfeld bei „Sonstiges“) *' : 'Notiz'}>
          <textarea
            className={`${inputClass} min-h-[90px]`}
            value={notiz}
            onChange={(e) => setNotiz(e.target.value)}
            placeholder="Zusätzliche Details zur Reklamation..."
            required={grund === 'Sonstiges'}
          />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>
            Abbrechen
          </Button>
          <Button type="submit" variant="danger">
            Lead reklamieren
          </Button>
        </div>
      </form>
    </Modal>
  )
}
