import { useState } from 'react'
import { useApp } from '../../context/AppContext'
import { useToast } from '../../components/ToastContext'
import { Card, Field, inputClass, Button, Modal } from '../../components/ui'
import { uid } from '../../lib/utils'
import { Trash2, Plus, Copy } from 'lucide-react'

const TAGE = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']

export default function KalenderEinstellungen() {
  const { state, dispatch } = useApp()
  const { showToast } = useToast()
  const [buchungslink, setBuchungslink] = useState(state.profil.buchungslink)
  const [modalOpen, setModalOpen] = useState(false)
  const [blockTitel, setBlockTitel] = useState('')
  const [blockVon, setBlockVon] = useState('')
  const [blockBis, setBlockBis] = useState('')

  function saveBuchungslink() {
    dispatch({ type: 'UPDATE_PROFIL', patch: { buchungslink } })
    showToast('Buchungslink gespeichert')
  }

  function copyLink() {
    navigator.clipboard?.writeText(buchungslink).catch(() => undefined)
    showToast('Buchungslink kopiert')
  }

  function toggleTag(tag: string) {
    const plan = { ...state.profil.wochenplan }
    const current = plan[tag] ?? { aktiv: false, zeitfenster: [] }
    plan[tag] = {
      aktiv: !current.aktiv,
      zeitfenster: !current.aktiv && current.zeitfenster.length === 0 ? [{ von: '09:00', bis: '17:00' }] : current.zeitfenster,
    }
    dispatch({ type: 'UPDATE_PROFIL', patch: { wochenplan: plan } })
  }

  function updateZeitfenster(tag: string, index: number, field: 'von' | 'bis', value: string) {
    const plan = { ...state.profil.wochenplan }
    const tageintrag = plan[tag]
    const zeitfenster = tageintrag.zeitfenster.map((z, i) => (i === index ? { ...z, [field]: value } : z))
    plan[tag] = { ...tageintrag, zeitfenster }
    dispatch({ type: 'UPDATE_PROFIL', patch: { wochenplan: plan } })
  }

  function addBlockzeit() {
    if (!blockTitel.trim() || !blockVon || !blockBis) return
    dispatch({ type: 'ADD_BLOCKZEIT', blockzeit: { id: uid('block'), titel: blockTitel.trim(), von: blockVon, bis: blockBis } })
    setBlockTitel('')
    setBlockVon('')
    setBlockBis('')
    setModalOpen(false)
    showToast('Blockzeit hinzugefügt')
  }

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <h2 className="mb-3 font-semibold text-ink-800">Persönlicher Buchungslink</h2>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[280px] flex-1">
            <Field label="Buchungslink">
              <input className={inputClass} value={buchungslink} onChange={(e) => setBuchungslink(e.target.value)} />
            </Field>
          </div>
          <Button variant="secondary" onClick={copyLink}>
            <Copy size={15} /> Kopieren
          </Button>
          <Button onClick={saveBuchungslink}>Speichern</Button>
        </div>

        <div className="mt-5 flex flex-wrap gap-2 border-t border-ink-100 pt-4">
          <Button
            variant="secondary"
            onClick={() => showToast('Vorlage „Erstgespräch“ (30 Min.) angelegt')}
          >
            <Plus size={15} /> Vorlage Erstgespräch anlegen
          </Button>
          <Button
            variant="secondary"
            onClick={() => showToast('Vorlage „Beratungsgespräch“ (45 Min.) angelegt')}
          >
            <Plus size={15} /> Vorlage Beratungsgespräch anlegen
          </Button>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="mb-3 font-semibold text-ink-800">Wochenplan – Verfügbarkeit</h2>
        <div className="space-y-2">
          {TAGE.map((tag) => {
            const entry = state.profil.wochenplan[tag] ?? { aktiv: false, zeitfenster: [] }
            return (
              <div key={tag} className="flex flex-wrap items-center gap-3 rounded-lg border border-ink-100 px-3 py-2">
                <label className="flex w-32 items-center gap-2 text-sm font-medium text-ink-700">
                  <input type="checkbox" checked={entry.aktiv} onChange={() => toggleTag(tag)} className="h-4 w-4 rounded border-ink-300 text-brand-600" />
                  {tag}
                </label>
                {entry.aktiv ? (
                  entry.zeitfenster.map((z, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <input type="time" className="rounded-lg border border-ink-200 px-2 py-1" value={z.von} onChange={(e) => updateZeitfenster(tag, i, 'von', e.target.value)} />
                      <span className="text-ink-400">bis</span>
                      <input type="time" className="rounded-lg border border-ink-200 px-2 py-1" value={z.bis} onChange={(e) => updateZeitfenster(tag, i, 'bis', e.target.value)} />
                    </div>
                  ))
                ) : (
                  <span className="text-sm text-ink-300">Nicht verfügbar</span>
                )}
              </div>
            )
          })}
        </div>
      </Card>

      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-ink-800">Blockierte Zeiträume</h2>
          <Button onClick={() => setModalOpen(true)}>
            <Plus size={15} /> Hinzufügen
          </Button>
        </div>
        <div className="space-y-2">
          {state.profil.blockzeiten.length === 0 && <p className="text-sm text-ink-400">Keine blockierten Zeiträume.</p>}
          {state.profil.blockzeiten.map((b) => (
            <div key={b.id} className="flex items-center justify-between rounded-lg bg-ink-50 px-3 py-2 text-sm">
              <div>
                <p className="font-medium text-ink-700">{b.titel}</p>
                <p className="text-xs text-ink-400">
                  {b.von} – {b.bis}
                </p>
              </div>
              <button onClick={() => dispatch({ type: 'REMOVE_BLOCKZEIT', id: b.id })} className="rounded-lg p-1.5 text-ink-400 hover:bg-red-50 hover:text-red-600">
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Blockzeit hinzufügen">
        <div className="space-y-3">
          <Field label="Bezeichnung">
            <input className={inputClass} value={blockTitel} onChange={(e) => setBlockTitel(e.target.value)} placeholder="z.B. Urlaub" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Von">
              <input type="date" className={inputClass} value={blockVon} onChange={(e) => setBlockVon(e.target.value)} />
            </Field>
            <Field label="Bis">
              <input type="date" className={inputClass} value={blockBis} onChange={(e) => setBlockBis(e.target.value)} />
            </Field>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Abbrechen
            </Button>
            <Button onClick={addBlockzeit}>Hinzufügen</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
