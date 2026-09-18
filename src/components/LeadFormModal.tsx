import { useState, type FormEvent } from 'react'
import { useApp } from '../context/AppContext'
import { useToast } from './ToastContext'
import { Modal, Field, inputClass, Button } from './ui'
import { uid, isoDaysAgo } from '../lib/utils'
import type { Lead } from '../types'

export default function LeadFormModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { dispatch } = useApp()
  const { showToast } = useToast()
  const [name, setName] = useState('')
  const [telefon, setTelefon] = useState('')
  const [email, setEmail] = useState('')
  const [tarif, setTarif] = useState('')
  const [beitrag, setBeitrag] = useState('')
  const [notizen, setNotizen] = useState('')

  function reset() {
    setName('')
    setTelefon('')
    setEmail('')
    setTarif('')
    setBeitrag('')
    setNotizen('')
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    const lead: Lead = {
      id: uid('lead'),
      name: name.trim(),
      telefon: telefon.trim() || '–',
      email: email.trim() || '–',
      versicherer: 'Unbekannt',
      tarif: tarif.trim() || 'Nicht angegeben',
      beitragAlt: Number(beitrag) || 0,
      status: 'Neu',
      liste: 'aktiv',
      erstelltAm: isoDaysAgo(0),
      notizen: notizen.trim(),
      aktivitaeten: [{ id: uid('akt'), datum: isoDaysAgo(0), typ: 'status', text: 'Lead manuell angelegt (Status: Neu)' }],
    }
    dispatch({ type: 'ADD_LEAD', lead })
    showToast(`Lead „${lead.name}“ wurde angelegt`)
    reset()
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="Lead hinzufügen">
      <form onSubmit={handleSubmit} className="space-y-3">
        <Field label="Name *">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required placeholder="Vor- und Nachname" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Telefon">
            <input className={inputClass} value={telefon} onChange={(e) => setTelefon(e.target.value)} placeholder="0151 1234567" />
          </Field>
          <Field label="E-Mail">
            <input className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@beispiel.de" type="email" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Aktueller Tarif">
            <input className={inputClass} value={tarif} onChange={(e) => setTarif(e.target.value)} placeholder="z.B. Komfort Plus" />
          </Field>
          <Field label="Beitrag (€/Monat)">
            <input className={inputClass} value={beitrag} onChange={(e) => setBeitrag(e.target.value)} placeholder="450" type="number" />
          </Field>
        </div>
        <Field label="Notizen">
          <textarea className={`${inputClass} min-h-[80px]`} value={notizen} onChange={(e) => setNotizen(e.target.value)} placeholder="Notizen zum Lead..." />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>
            Abbrechen
          </Button>
          <Button type="submit">Lead speichern</Button>
        </div>
      </form>
    </Modal>
  )
}
