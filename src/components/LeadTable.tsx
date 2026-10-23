import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatDate, formatEuroExact } from '../lib/utils'
import { statusLabel, statusTone, type DbLead } from '../lib/leads'
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

  if (leads.length === 0) {
    return <div className="rounded-xl border border-dashed border-ink-200 bg-white p-8 text-center text-sm text-ink-400">{emptyText}</div>
  }

  return (
    <div>
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
              <th className="px-4 py-3 font-medium">Eingang</th>
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
