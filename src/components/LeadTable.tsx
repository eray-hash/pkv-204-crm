import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatDate, formatEuroExact } from '../lib/utils'
import { filterZuweisung, statusLabel, statusTone, type DbLead, type ZuweisungsFilter } from '../lib/leads'
import { useAuth } from '../context/AuthContext'
import { useTeam } from '../context/TeamContext'
import { Badge, ScrollHint } from './ui'

export function DbStatusBadge({ status }: { status: string }) {
  return <Badge tone={statusTone(status)}>{statusLabel(status)}</Badge>
}

export default function LeadTable({
  leads,
  extraColumnLabel,
  extraColumnRender,
  emptyText = 'Keine Einträge vorhanden.',
}: {
  leads: DbLead[]
  extraColumnLabel?: string
  extraColumnRender?: (lead: DbLead) => ReactNode
  emptyText?: string
}) {
  const navigate = useNavigate()
  const { session } = useAuth()
  const { nameVon } = useTeam()
  const meId = session?.user.id ?? null
  const [filter, setFilter] = useState<ZuweisungsFilter>('alle')

  if (leads.length === 0) {
    return <div className="rounded-xl border border-dashed border-ink-200 bg-white p-8 text-center text-sm text-ink-400">{emptyText}</div>
  }

  const sichtbar = filterZuweisung(leads, filter, meId)
  const anzahl = (f: ZuweisungsFilter) => filterZuweisung(leads, f, meId).length

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-1 rounded-xl bg-ink-100 p-1 sm:inline-flex" role="group" aria-label="Zuweisung filtern">
        {(['alle', 'frei', 'meine'] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
            className={`rounded-lg px-3 py-1 text-sm font-medium transition-colors ${filter === f ? 'bg-white text-brand-700 shadow-sm' : 'text-ink-500 hover:text-ink-700'}`}
          >
            {f === 'alle' ? 'Alle' : f === 'frei' ? 'Frei' : 'Meine'} <span className="text-xs text-ink-400">({anzahl(f)})</span>
          </button>
        ))}
      </div>
      <ScrollHint />
      <div className="overflow-x-auto rounded-2xl border border-ink-100 bg-white shadow-sm">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead>
            <tr className="border-b border-ink-100 text-xs uppercase tracking-wide text-ink-400">
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Telefon</th>
              <th className="px-4 py-3 font-medium">Gesellschaft</th>
              <th className="px-4 py-3 font-medium">Tarifbeitrag</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Zugewiesen an</th>
              <th className="px-4 py-3 font-medium">Eingang</th>
              {extraColumnLabel && <th className="px-4 py-3 font-medium">{extraColumnLabel}</th>}
            </tr>
          </thead>
          <tbody>
            {sichtbar.length === 0 && (
              <tr>
                <td colSpan={extraColumnLabel ? 8 : 7} className="px-4 py-8 text-center text-sm text-ink-400">
                  Keine Leads in dieser Ansicht.
                </td>
              </tr>
            )}
            {sichtbar.map((lead) => (
              <tr
                key={lead.id}
                onClick={() => navigate(`/leads/${lead.id}`)}
                className="cursor-pointer border-b border-ink-50 last:border-0 hover:bg-ink-50/70"
              >
                <td className="px-4 py-3 font-medium text-ink-800">
                  {lead.name}
                  {lead.moegliches_duplikat_von && (
                    <Badge tone="amber" className="ml-2">
                      Mögliches Duplikat
                    </Badge>
                  )}
                </td>
                <td className="px-4 py-3 text-ink-500">{lead.telefon}</td>
                <td className="px-4 py-3 text-ink-500">{lead.gesellschaft}</td>
                <td className="px-4 py-3 text-ink-600">{formatEuroExact(lead.tarifbeitrag)}</td>
                <td className="px-4 py-3">
                  <DbStatusBadge status={lead.status} />
                </td>
                <td className="px-4 py-3">
                  {lead.zugewiesen_an ? (
                    <span className={lead.zugewiesen_an === meId ? 'font-medium text-brand-700' : 'text-ink-600'}>
                      {lead.zugewiesen_an === meId ? 'Ich' : nameVon(lead.zugewiesen_an)}
                    </span>
                  ) : (
                    <Badge tone="green">Frei</Badge>
                  )}
                </td>
                <td className="px-4 py-3 text-ink-500">{formatDate(lead.eingang_zeit)}</td>
                {extraColumnLabel && <td className="px-4 py-3 text-ink-500">{extraColumnRender?.(lead)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
