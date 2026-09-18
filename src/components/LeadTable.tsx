import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Lead } from '../types'
import { formatDate, formatEuro } from '../lib/utils'
import { StatusBadge } from './ui'

export default function LeadTable({
  leads,
  extraColumnLabel,
  extraColumnRender,
  dateLabel = 'Datum',
}: {
  leads: Lead[]
  extraColumnLabel?: string
  extraColumnRender?: (lead: Lead) => ReactNode
  dateLabel?: string
}) {
  const navigate = useNavigate()

  if (leads.length === 0) {
    return <div className="rounded-xl border border-dashed border-ink-200 p-8 text-center text-sm text-ink-400">Keine Einträge vorhanden.</div>
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-ink-100 bg-white shadow-sm">
      <table className="w-full min-w-[820px] text-left text-sm">
        <thead>
          <tr className="border-b border-ink-100 text-xs uppercase tracking-wide text-ink-400">
            <th className="px-4 py-3 font-medium">Name</th>
            <th className="px-4 py-3 font-medium">Versicherer</th>
            <th className="px-4 py-3 font-medium">Tarif</th>
            <th className="px-4 py-3 font-medium">Beitrag</th>
            <th className="px-4 py-3 font-medium">Ersparnis</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">{dateLabel}</th>
            {extraColumnLabel && <th className="px-4 py-3 font-medium">{extraColumnLabel}</th>}
          </tr>
        </thead>
        <tbody>
          {leads.map((lead) => (
            <tr
              key={lead.id}
              onClick={() => navigate(`/leads/${lead.id}`)}
              className="cursor-pointer border-b border-ink-50 last:border-0 hover:bg-ink-50/70"
            >
              <td className="px-4 py-3 font-medium text-ink-800">{lead.name}</td>
              <td className="px-4 py-3 text-ink-500">{lead.versicherer}</td>
              <td className="px-4 py-3 text-ink-500">{lead.tarif}</td>
              <td className="px-4 py-3 text-ink-600">
                {lead.beitragNeu ? (
                  <span>
                    <span className="text-ink-300 line-through">{formatEuro(lead.beitragAlt)}</span>{' '}
                    <span className="font-medium text-ink-800">{formatEuro(lead.beitragNeu)}</span>
                  </span>
                ) : (
                  formatEuro(lead.beitragAlt)
                )}
              </td>
              <td className="px-4 py-3 text-brand-600">{lead.ersparnis ? `${formatEuro(lead.ersparnis)} / Monat` : '–'}</td>
              <td className="px-4 py-3">
                <StatusBadge status={lead.status} />
              </td>
              <td className="px-4 py-3 text-ink-500">{formatDate(lead.erstelltAm)}</td>
              {extraColumnLabel && <td className="px-4 py-3 text-ink-500">{extraColumnRender?.(lead)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
