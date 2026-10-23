import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { useLeads } from '../context/LeadsContext'
import { Card, ErrorBlock, ExampleNotice, KpiTile, LoadingBlock, SectionHeader, inputClass } from '../components/ui'
import { formatDateTime, formatEuroExact, zeitraumToRange, ZEITRAUM_LABELS } from '../lib/utils'
import { beitragSumme, countByStatus, imBereich, statusLabel, type DbLeadStatus } from '../lib/leads'
import type { ZeitraumFilter } from '../types'
import { PhoneCall, TrendingUp, Users2, Trophy } from 'lucide-react'

const FILTERS: ZeitraumFilter[] = ['heute', 'gestern', 'letzte7', 'letzte14', 'letzte30', 'diesermonat', 'letztermonat', 'alle']
const PIPELINE: DbLeadStatus[] = ['neu', 'kontaktiert', 'nicht_erreicht', 'termin_vereinbart', 'beratung']

export default function Dashboard() {
  const { state } = useApp()
  const { leads, queue, loading, error, reload } = useLeads()
  const navigate = useNavigate()
  const [filter, setFilter] = useState<ZeitraumFilter>('letzte30')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')

  const range = useMemo(() => {
    if (filter === 'custom') return zeitraumToRange('custom', { start: customStart, end: customEnd })
    return zeitraumToRange(filter)
  }, [filter, customStart, customEnd])

  const neueLeads = useMemo(() => leads.filter((l) => imBereich(l.eingang_zeit, range)), [leads, range])
  const gewonnen = useMemo(() => leads.filter((l) => l.status === 'gewonnen' && imBereich(l.updated_at, range)), [leads, range])
  const termine = useMemo(() => leads.filter((l) => l.status === 'termin_vereinbart' && imBereich(l.updated_at, range)), [leads, range])
  const counts = useMemo(() => countByStatus(leads), [leads])

  const anstehendeTermine = [...state.termine]
    .filter((t) => new Date(t.datum).getTime() >= Date.now() - 1000 * 60 * 60)
    .sort((a, b) => new Date(a.datum).getTime() - new Date(b.datum).getTime())
    .slice(0, 5)

  return (
    <div>
      <SectionHeader title="Dashboard" subtitle="Überblick über Leads und Ergebnisse der §204-Tarifoptimierung" />

      <Card className="mb-5 p-3">
        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                filter === f ? 'bg-brand-600 text-white' : 'bg-ink-50 text-ink-500 hover:bg-ink-100'
              }`}
            >
              {ZEITRAUM_LABELS[f]}
            </button>
          ))}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <input
              type="date"
              aria-label="Startdatum"
              className={`${inputClass} w-auto py-1.5`}
              value={customStart}
              onChange={(e) => {
                setCustomStart(e.target.value)
                setFilter('custom')
              }}
            />
            <span className="text-sm text-ink-400">bis</span>
            <input
              type="date"
              aria-label="Enddatum"
              className={`${inputClass} w-auto py-1.5`}
              value={customEnd}
              onChange={(e) => {
                setCustomEnd(e.target.value)
                setFilter('custom')
              }}
            />
          </div>
        </div>
      </Card>

      {loading && leads.length === 0 ? (
        <LoadingBlock text="Kennzahlen werden geladen …" />
      ) : error && leads.length === 0 ? (
        <ErrorBlock message={error} onRetry={() => void reload()} />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
            <KpiTile label="Neue Leads" value={String(neueLeads.length)} hint={`Eingang: ${ZEITRAUM_LABELS[filter]}`} />
            <KpiTile label="Gewonnene Kunden" value={String(gewonnen.length)} accent="green" hint={`Gewonnen: ${ZEITRAUM_LABELS[filter]}`} />
            <KpiTile label="Termine vereinbart" value={String(termine.length)} accent="amber" hint={`Status gesetzt: ${ZEITRAUM_LABELS[filter]}`} />
            <KpiTile label="Tarifbeitrag-Volumen" value={formatEuroExact(beitragSumme(neueLeads))} accent="brand" hint="monatlich, neue Leads im Zeitraum" />
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <Card className="p-5 lg:col-span-2">
              <div className="mb-3 flex items-center gap-2">
                <TrendingUp size={18} className="text-brand-500" />
                <h2 className="font-semibold text-ink-800">Pipeline-Übersicht</h2>
                <span className="text-xs text-ink-400">(alle Leads, unabhängig vom Zeitraum)</span>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {PIPELINE.map((status) => (
                  <button
                    key={status}
                    onClick={() => navigate('/leads')}
                    className="rounded-xl border border-ink-100 p-3 text-left hover:border-brand-200 hover:bg-brand-50/40"
                  >
                    <p className="text-xs text-ink-400">{statusLabel(status)}</p>
                    <p className="mt-1 text-lg font-semibold text-ink-800">{counts[status]}</p>
                  </button>
                ))}
                <button
                  onClick={() => navigate('/leads/kunden')}
                  className="rounded-xl border border-brand-100 bg-brand-50 p-3 text-left hover:bg-brand-100"
                >
                  <p className="flex items-center gap-1 text-xs text-brand-700">
                    <Trophy size={12} /> Gewonnen
                  </p>
                  <p className="mt-1 text-lg font-semibold text-brand-800">{counts.gewonnen}</p>
                </button>
              </div>

              <div className="mt-5 flex items-center gap-2">
                <Users2 size={18} className="text-brand-500" />
                <h2 className="font-semibold text-ink-800">Nächste Termine</h2>
              </div>
              <div className="mt-1">
                <ExampleNotice text="Beispieldaten – der Kalender ist noch nicht mit der Datenbank verbunden." />
              </div>
              <div className="divide-y divide-ink-50">
                {anstehendeTermine.length === 0 && <p className="py-3 text-sm text-ink-400">Keine anstehenden Termine.</p>}
                {anstehendeTermine.map((t) => (
                  <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                    <div>
                      <p className="font-medium text-ink-800">{t.leadName}</p>
                      <p className="text-xs text-ink-400">
                        {t.typ} · {t.format}
                      </p>
                    </div>
                    <p className="text-ink-500">{formatDateTime(t.datum)}</p>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-5">
              <div className="mb-3 flex items-center gap-2">
                <PhoneCall size={18} className="text-brand-500" />
                <h2 className="font-semibold text-ink-800">Power Dialer</h2>
              </div>
              <p className="text-sm text-ink-500">
                {queue.length === 0
                  ? 'Aktuell keine anrufbaren Leads.'
                  : `${queue.length} anrufbare${queue.length === 1 ? 'r' : ''} Lead${queue.length === 1 ? '' : 's'} bereit zur Anwahl.`}
              </p>
              <button
                onClick={() => navigate('/leads/power-dialer')}
                className="mt-4 w-full rounded-xl bg-brand-600 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
              >
                Power Dialer starten
              </button>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
