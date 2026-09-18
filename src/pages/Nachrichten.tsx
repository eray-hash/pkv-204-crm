import { useState, type FormEvent } from 'react'
import { useApp } from '../context/AppContext'
import { useToast } from '../components/ToastContext'
import { Card, SectionHeader, Badge, Tabs, Field, inputClass, Button } from '../components/ui'
import { formatDateTime } from '../lib/utils'
import type { Nachricht } from '../types'
import { Mail, Settings, CheckCircle2 } from 'lucide-react'

export default function Nachrichten() {
  const { state, dispatch } = useApp()
  const { showToast } = useToast()
  const [tab, setTab] = useState<'posteingang' | 'einstellungen'>('posteingang')
  const [selected, setSelected] = useState<Nachricht | null>(null)
  const [verknuepfteEmail, setVerknuepfteEmail] = useState('')
  const [verbunden, setVerbunden] = useState(false)

  function openMessage(m: Nachricht) {
    setSelected(m)
    if (!m.gelesen) dispatch({ type: 'MARK_MESSAGE_READ', id: m.id })
  }

  function handleVerknuepfen(e: FormEvent) {
    e.preventDefault()
    if (!verknuepfteEmail.trim()) return
    setVerbunden(true)
    showToast(`E-Mail-Adresse ${verknuepfteEmail} wurde verknüpft (Mockup)`)
  }

  const unread = state.nachrichten.filter((m) => !m.gelesen).length

  return (
    <div>
      <SectionHeader title="Nachrichten" subtitle="Postfach für die Kommunikation mit Leads und Kunden" />

      <div className="mb-5">
        <Tabs
          tabs={[
            { id: 'posteingang', label: `Posteingang (${unread} ungelesen)` },
            { id: 'einstellungen', label: 'E-Mail verknüpfen' },
          ]}
          active={tab}
          onChange={(id) => setTab(id as typeof tab)}
        />
      </div>

      {tab === 'posteingang' ? (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
          <Card className="p-2 lg:col-span-2">
            <div className="max-h-[65vh] divide-y divide-ink-50 overflow-y-auto">
              {state.nachrichten.map((m) => (
                <button
                  key={m.id}
                  onClick={() => openMessage(m)}
                  className={`block w-full px-3 py-3 text-left hover:bg-ink-50 ${selected?.id === m.id ? 'bg-brand-50/60' : ''}`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-sm ${!m.gelesen ? 'font-semibold text-ink-900' : 'text-ink-700'}`}>{m.absender}</span>
                    {!m.gelesen && <span className="h-2 w-2 rounded-full bg-brand-500" />}
                  </div>
                  <p className={`truncate text-sm ${!m.gelesen ? 'font-medium text-ink-800' : 'text-ink-500'}`}>{m.betreff}</p>
                  <p className="truncate text-xs text-ink-400">{m.vorschau}</p>
                  <p className="mt-0.5 text-xs text-ink-300">{formatDateTime(m.datum)}</p>
                </button>
              ))}
            </div>
          </Card>

          <Card className="p-6 lg:col-span-3">
            {selected ? (
              <div>
                <div className="mb-4 flex items-start justify-between border-b border-ink-100 pb-4">
                  <div>
                    <h2 className="text-lg font-semibold text-ink-900">{selected.betreff}</h2>
                    <p className="text-sm text-ink-500">
                      Von {selected.absender} ({selected.email})
                    </p>
                  </div>
                  <p className="text-xs text-ink-400">{formatDateTime(selected.datum)}</p>
                </div>
                <p className="whitespace-pre-line text-sm leading-relaxed text-ink-700">{selected.inhalt}</p>
              </div>
            ) : (
              <div className="flex h-full min-h-[300px] flex-col items-center justify-center text-ink-300">
                <Mail size={36} />
                <p className="mt-2 text-sm">Wählen Sie eine Nachricht aus, um sie zu lesen.</p>
              </div>
            )}
          </Card>
        </div>
      ) : (
        <Card className="max-w-xl p-6">
          <h2 className="mb-1 flex items-center gap-2 font-semibold text-ink-800">
            <Settings size={16} /> Eigene E-Mail-Adresse verknüpfen
          </h2>
          <p className="mb-4 text-sm text-ink-500">Verknüpfen Sie Ihr eigenes Postfach, um Nachrichten direkt im CRM zu empfangen und zu versenden.</p>
          {verbunden && (
            <div className="mb-4 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              <CheckCircle2 size={16} /> {verknuepfteEmail} ist verknüpft
            </div>
          )}
          <form onSubmit={handleVerknuepfen} className="space-y-3">
            <Field label="E-Mail-Adresse">
              <input
                type="email"
                className={inputClass}
                placeholder="name@meine-domain.de"
                value={verknuepfteEmail}
                onChange={(e) => setVerknuepfteEmail(e.target.value)}
              />
            </Field>
            <Field label="IMAP-Server (optional)">
              <input className={inputClass} placeholder="imap.meine-domain.de" />
            </Field>
            <Field label="SMTP-Server (optional)">
              <input className={inputClass} placeholder="smtp.meine-domain.de" />
            </Field>
            <Button type="submit">Verknüpfen</Button>
          </form>
          <div className="mt-3">
            <Badge tone="ink">Mockup – keine echte Postfach-Anbindung</Badge>
          </div>
        </Card>
      )}
    </div>
  )
}
