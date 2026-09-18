import { useMemo, useState, type FormEvent } from 'react'
import { useApp } from '../context/AppContext'
import { useToast } from '../components/ToastContext'
import { Card, SectionHeader, Button, Tabs, Modal, Field, inputClass, Badge } from '../components/ui'
import { formatTime, formatDate, uid } from '../lib/utils'
import type { Termin } from '../types'
import { Plus, Users, Link2, CheckCircle2 } from 'lucide-react'

type View = 'heute' | 'tag' | 'woche' | 'monat'

function startOfWeek(d: Date): Date {
  const c = new Date(d)
  const day = (c.getDay() + 6) % 7 // Montag = 0
  c.setDate(c.getDate() - day)
  c.setHours(0, 0, 0, 0)
  return c
}

function buildMonthGrid(reference: Date): Date[] {
  const first = new Date(reference.getFullYear(), reference.getMonth(), 1)
  const gridStart = startOfWeek(first)
  const days: Date[] = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart)
    d.setDate(gridStart.getDate() + i)
    days.push(d)
  }
  return days
}

const WOCHENTAGE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

export default function Kalender() {
  const { state, dispatch } = useApp()
  const { showToast } = useToast()
  const [view, setView] = useState<View>('monat')
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)

  const [typ, setTyp] = useState<Termin['typ']>('Erstgespräch')
  const [leadName, setLeadName] = useState('')
  const [datum, setDatum] = useState('')
  const [dauer, setDauer] = useState('30')
  const [format, setFormat] = useState<Termin['format']>('Video')

  const now = new Date()
  const monthGrid = useMemo(() => buildMonthGrid(now), [now])

  const filteredTermine = useMemo(() => {
    const sorted = [...state.termine].sort((a, b) => new Date(a.datum).getTime() - new Date(b.datum).getTime())
    if (view === 'heute') {
      return sorted.filter((t) => sameDay(new Date(t.datum), now))
    }
    if (view === 'tag') {
      return sorted.filter((t) => sameDay(new Date(t.datum), selectedDay ?? now))
    }
    if (view === 'woche') {
      const start = startOfWeek(now)
      const end = new Date(start)
      end.setDate(start.getDate() + 6)
      end.setHours(23, 59, 59, 999)
      return sorted.filter((t) => new Date(t.datum) >= start && new Date(t.datum) <= end)
    }
    return sorted
  }, [state.termine, view, selectedDay, now])

  function sameDay(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  }

  function handleCreateTermin(e: FormEvent) {
    e.preventDefault()
    if (!leadName.trim() || !datum) return
    const termin: Termin = {
      id: uid('termin'),
      typ,
      leadName: leadName.trim(),
      datum: new Date(datum).toISOString(),
      dauerMinuten: Number(dauer) || 30,
      format,
    }
    dispatch({ type: 'ADD_TERMIN', termin })
    showToast(`${typ} mit ${leadName} wurde angelegt`)
    setLeadName('')
    setDatum('')
    setModalOpen(false)
  }

  function openNewTermin(prefill?: Termin['typ']) {
    if (prefill) setTyp(prefill)
    setModalOpen(true)
  }

  return (
    <div>
      <SectionHeader
        title="Kalender"
        subtitle="Termine, Verfügbarkeiten und externe Kalenderanbindung"
        actions={
          <>
            <Button variant="secondary" onClick={() => openNewTermin('Erstgespräch')}>
              <Plus size={16} /> Erstgespräch buchen
            </Button>
            <Button onClick={() => openNewTermin('Beratungsgespräch')}>
              <Plus size={16} /> Beratungsgespräch buchen
            </Button>
          </>
        }
      />

      <div className="mb-5 flex items-center justify-between">
        <Tabs
          tabs={[
            { id: 'heute', label: 'Heute' },
            { id: 'tag', label: 'Tag' },
            { id: 'woche', label: 'Woche' },
            { id: 'monat', label: 'Monat' },
          ]}
          active={view}
          onChange={(id) => setView(id as View)}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {view === 'monat' ? (
            <Card className="p-4">
              <p className="mb-3 text-sm font-semibold text-ink-700">
                {now.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}
              </p>
              <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-ink-400">
                {WOCHENTAGE.map((w) => (
                  <div key={w} className="py-1">
                    {w}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {monthGrid.map((d) => {
                  const dayTermine = state.termine.filter((t) => sameDay(new Date(t.datum), d))
                  const inMonth = d.getMonth() === now.getMonth()
                  const isToday = sameDay(d, now)
                  return (
                    <button
                      key={d.toISOString()}
                      onClick={() => {
                        setSelectedDay(d)
                        setView('tag')
                      }}
                      className={`min-h-[64px] rounded-lg border p-1.5 text-left text-xs ${
                        isToday ? 'border-brand-400 bg-brand-50' : 'border-ink-100'
                      } ${inMonth ? '' : 'opacity-40'} hover:border-brand-300`}
                    >
                      <span className={`font-medium ${isToday ? 'text-brand-700' : 'text-ink-600'}`}>{d.getDate()}</span>
                      <div className="mt-1 space-y-0.5">
                        {dayTermine.slice(0, 2).map((t) => (
                          <div key={t.id} className="truncate rounded bg-brand-100 px-1 py-0.5 text-[10px] text-brand-700">
                            {formatTime(t.datum)} {t.leadName}
                          </div>
                        ))}
                        {dayTermine.length > 2 && <div className="text-[10px] text-ink-400">+{dayTermine.length - 2} weitere</div>}
                      </div>
                    </button>
                  )
                })}
              </div>
            </Card>
          ) : (
            <Card className="p-4">
              <p className="mb-3 text-sm font-semibold text-ink-700">
                {view === 'tag' ? formatDate((selectedDay ?? now).toISOString()) : view === 'heute' ? 'Heute' : 'Diese Woche'}
              </p>
              <div className="divide-y divide-ink-50">
                {filteredTermine.length === 0 && <p className="py-6 text-center text-sm text-ink-400">Keine Termine in diesem Zeitraum.</p>}
                {filteredTermine.map((t) => (
                  <div key={t.id} className="flex items-center justify-between py-3">
                    <div>
                      <p className="font-medium text-ink-800">{t.leadName}</p>
                      <p className="text-xs text-ink-400">
                        {t.typ} · {t.format} · {t.dauerMinuten} Min.
                      </p>
                    </div>
                    <div className="text-right text-sm text-ink-600">
                      <p>{formatDate(t.datum)}</p>
                      <p className="text-xs text-ink-400">{formatTime(t.datum)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-5">
          <Card className="p-5">
            <h2 className="mb-3 flex items-center gap-2 font-semibold text-ink-800">
              <Users size={16} /> Wer darf meinen Kalender sehen
            </h2>
            <div className="space-y-2">
              {state.teammitglieder.map((m) => (
                <label key={m.id} className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-ink-50">
                  <span className="text-sm text-ink-700">
                    {m.name} <span className="text-xs text-ink-400">· {m.rolle}</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={m.darfKalenderSehen}
                    onChange={() => dispatch({ type: 'TOGGLE_TEAM_KALENDER', id: m.id })}
                    className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-400"
                  />
                </label>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 flex items-center gap-2 font-semibold text-ink-800">
              <Link2 size={16} /> Externe Kalenderanbindung
            </h2>
            <div className="space-y-2">
              <ExternalCalendarButton label="Mit Google Kalender verbinden" />
              <ExternalCalendarButton label="Mit Outlook verbinden" />
              <ExternalCalendarButton label="Mit Apple Kalender verbinden" />
            </div>
          </Card>
        </div>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Neuen Termin buchen">
        <form onSubmit={handleCreateTermin} className="space-y-3">
          <Field label="Termintyp">
            <select className={inputClass} value={typ} onChange={(e) => setTyp(e.target.value as Termin['typ'])}>
              <option value="Erstgespräch">Erstgespräch</option>
              <option value="Beratungsgespräch">Beratungsgespräch</option>
            </select>
          </Field>
          <Field label="Name des Leads / Kunden">
            <input className={inputClass} value={leadName} onChange={(e) => setLeadName(e.target.value)} required />
          </Field>
          <Field label="Datum & Uhrzeit">
            <input type="datetime-local" className={inputClass} value={datum} onChange={(e) => setDatum(e.target.value)} required />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Dauer (Minuten)">
              <input type="number" className={inputClass} value={dauer} onChange={(e) => setDauer(e.target.value)} />
            </Field>
            <Field label="Format">
              <select className={inputClass} value={format} onChange={(e) => setFormat(e.target.value as Termin['format'])}>
                <option value="Video">Video</option>
                <option value="Telefon">Telefon</option>
                <option value="Vor Ort">Vor Ort</option>
              </select>
            </Field>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Abbrechen
            </Button>
            <Button type="submit">Termin anlegen</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

function ExternalCalendarButton({ label }: { label: string }) {
  const [connected, setConnected] = useState(false)
  const { showToast } = useToast()
  return (
    <button
      onClick={() => {
        setConnected(true)
        showToast(`${label.replace('Mit ', '').replace(' verbinden', '')} wurde verbunden (Mockup)`)
      }}
      className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm ${
        connected ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-ink-200 text-ink-600 hover:bg-ink-50'
      }`}
    >
      {label}
      {connected ? <CheckCircle2 size={16} /> : <Badge tone="ink">Schnellzugriff</Badge>}
    </button>
  )
}
