import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { Card, KpiTile, SectionHeader, inputClass } from '../components/ui'
import { formatEuro, formatDate, formatDateTime, zeitraumToRange, inRange, ZEITRAUM_LABELS } from '../lib/utils'
import type { ZeitraumFilter } from '../types'
import { PhoneCall, TrendingUp, Users2, Trophy } from 'lucide-react'

const FILTERS: ZeitraumFilter[] = ['heute', 'gestern', 'letzte7', 'letzte14', 'letzte30', 'diesermonat', 'letztermonat', 'alle']

export default function Dashboard() {
  const { state } = useApp()
  const navigate = useNavigate()
  const [filter, setFilter] = useState<ZeitraumFilter>('letzte30')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')

  const range = useMemo(() => {
    if (filter === 'custom') return zeitraumToRange('custom', { start: customStart, end: customEnd })
    return zeitraumToRange(filter)
  }, [filter, customStart, customEnd])

  const leadsImZeitraum = useMemo(() => state.leads.filter((l) => inRange(l.erstelltAm, range)), [state.leads, range])
  const neueLeads = leadsImZeitraum.length
  const gewonnene = leadsImZeitraum.filter((l) => l.status === 'Gewonnen').length
  const termineImZeitraum = state.termine.filter((t) => inRange(t.datum, range)).length
  const ersparnisSumme = leadsImZeitraum.reduce((sum, l) => sum + (l.ersparnis ?? 0), 0)

  const alleKunden = state.leads.filter((l) => l.liste === 'kunde')
  const anstehendeTermine = [...state.termine]
    .filter((t) => new Date(t.datum).getTime() >= Date.now() - 1000 * 60 * 60)
    .sort((a, b) => new Date(a.datum).getTime() - new Date(b.datum).getTime())
    .slice(0, 5)

  return (
    <div>
      <SectionHeader title="Dashboard" subtitle="Überblick über Leads, Termine und Ergebnisse der §204-Tarifoptimierung" />

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

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiTile label="Neue Leads" value={String(neueLeads)} hint={ZEITRAUM_LABELS[filter]} />
        <KpiTile label="Gewonnene Kunden" value={String(gewonnene)} accent="green" hint={ZEITRAUM_LABELS[filter]} />
        <KpiTile label="Termine" value={String(termineImZeitraum)} accent="amber" hint={ZEITRAUM_LABELS[filter]} />
        <KpiTile label="Ersparnis erzielt" value={formatEuro(ersparnisSumme)} accent="brand" hint="Monatliche Summe im Zeitraum" />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="mb-3 flex items-center gap-2">
            <TrendingUp size={18} className="text-brand-500" />
            <h2 className="font-semibold text-ink-800">Pipeline-Übersicht</h2>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {(['Neu', 'Kontaktiert', 'Termin vereinbart', 'Beratung', 'Antrag'] as const).map((status) => {
              const count = state.leads.filter((l) => l.status === status && l.liste === 'aktiv').length
              return (
                <button
                  key={status}
                  onClick={() => navigate('/leads')}
                  className="rounded-xl border border-ink-100 p-3 text-left hover:border-brand-200 hover:bg-brand-50/40"
                >
                  <p className="text-xs text-ink-400">{status}</p>
                  <p className="mt-1 text-lg font-semibold text-ink-800">{count}</p>
                </button>
              )
            })}
            <button
              onClick={() => navigate('/leads/kunden')}
              className="rounded-xl border border-brand-100 bg-brand-50 p-3 text-left hover:bg-brand-100"
            >
              <p className="flex items-center gap-1 text-xs text-brand-700">
                <Trophy size={12} /> Gewonnen
              </p>
              <p className="mt-1 text-lg font-semibold text-brand-800">{alleKunden.length}</p>
            </button>
          </div>

          <div className="mt-5 flex items-center gap-2">
            <Users2 size={18} className="text-brand-500" />
            <h2 className="font-semibold text-ink-800">Nächste Termine</h2>
          </div>
          <div className="mt-2 divide-y divide-ink-50">
            {anstehendeTermine.length === 0 && <p className="py-3 text-sm text-ink-400">Keine anstehenden Termine.</p>}
            {anstehendeTermine.map((t) => (
              <div key={t.id} className="flex items-center justify-between py-2.5 text-sm">
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
            {state.leads.filter((l) => l.liste === 'aktiv').length} aktive Leads bereit zur automatischen Anwahl.
          </p>
          <button
            onClick={() => navigate('/leads/power-dialer')}
            className="mt-4 w-full rounded-xl bg-brand-600 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
          >
            Power Dialer starten
          </button>

          <div className="mt-6 border-t border-ink-100 pt-4">
            <h3 className="mb-2 text-sm font-semibold text-ink-800">Überfällige Wiedervorlagen</h3>
            {state.leads
              .filter((l) => l.wiedervorlage && new Date(l.wiedervorlage.datum).getTime() < Date.now())
              .slice(0, 4)
              .map((l) => (
                <button
                  key={l.id}
                  onClick={() => navigate(`/leads/${l.id}`)}
                  className="mb-1.5 block w-full rounded-lg bg-red-50 px-3 py-2 text-left text-xs text-red-700 hover:bg-red-100"
                >
                  <span className="font-medium">{l.name}</span> · fällig am {formatDate(l.wiedervorlage!.datum)}
                </button>
              ))}
            {state.leads.filter((l) => l.wiedervorlage && new Date(l.wiedervorlage.datum).getTime() < Date.now()).length === 0 && (
              <p className="text-xs text-ink-400">Keine überfälligen Wiedervorlagen.</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}
