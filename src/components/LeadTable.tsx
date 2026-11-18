import { useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { formatDate, formatEuroExact } from '../lib/utils'
import { besitzerAnzeige, filterZuweisung, leadZugriff, statusLabel, statusTone, type DbLead, type ZuweisungsFilter } from '../lib/leads'
import { useToast } from './ToastContext'
import { useAuth } from '../context/AuthContext'
import { useTeam } from '../context/TeamContext'
import { useLeads } from '../context/LeadsContext'
import { Badge, Button, ScrollHint } from './ui'

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
  const { session, profile } = useAuth()
  const istGF = profile?.rolle === 'geschaeftsfuehrer'
  const { showToast } = useToast()
  const { nameVon } = useTeam()
  // Das Duplikat-Kennzeichen nur zeigen, wenn der urspruengliche Lead fuer den Nutzer sichtbar ist (sonst fuehrt der Hinweis ins Leere)
  const { leads: sichtbareLeads, uebernehmen } = useLeads()
  const [busyId, setBusyId] = useState<string | null>(null)
  const sichtbareIds = new Set(sichtbareLeads.map((l) => l.id))
  const meId = session?.user.id ?? null
  const [filter, setFilter] = useState<ZuweisungsFilter>('alle')

  if (leads.length === 0) {
    return <div className="rounded-xl border border-dashed border-ink-200 bg-white p-8 text-center text-sm text-ink-400">{emptyText}</div>
  }

  async function uebernimm(lead: DbLead) {
    setBusyId(lead.id)
    const res = await uebernehmen(lead.id)
    setBusyId(null)
    if (res.fehler) showToast(res.fehler, 'info')
    else if (res.ok) showToast(`${lead.name} übernommen`)
    else showToast('Dieser Lead wurde inzwischen von jemand anderem übernommen oder kann nicht übernommen werden.', 'info')
  }

  const sichtbar = filterZuweisung(leads, filter, meId)
  const anzahl = (f: ZuweisungsFilter) => filterZuweisung(leads, f, meId).length

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-1 rounded-xl bg-ink-100 p-1 sm:inline-flex" role="group" aria-label="Zuweisung filtern">
        {(['alle', 'frei', 'meine', 'kollegen'] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
            className={`rounded-lg px-3 py-1 text-sm font-medium transition-colors ${filter === f ? 'bg-white text-brand-700 shadow-sm' : 'text-ink-500 hover:text-ink-700'}`}
          >
            {f === 'alle' ? 'Alle' : f === 'frei' ? 'Frei' : f === 'meine' ? 'Meine' : 'Bei Kollegen'} <span className="text-xs text-ink-400">({anzahl(f)})</span>
          </button>
        ))}
      </div>
      {filter === 'kollegen' && (
        <p className="mb-2 text-xs text-ink-500">Leads von Kollegen sind nur zum Ansehen. Übernehmen oder umhängen kann nur der Geschäftsführer.</p>
      )}
      {filter === 'meine' && (
        <p className="mb-2 text-xs text-ink-500">Eigene Leads freigeben: Lead öffnen und „Freigeben“ wählen. Es sind höchstens 50 offene eigene Leads möglich.</p>
      )}
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
                  {/* Echter Link fuer Tastatur und Screenreader; die ganze Zeile bleibt zusaetzlich klickbar */}
                  <Link to={`/leads/${lead.id}`} onClick={(e) => e.stopPropagation()} className="hover:text-brand-700 hover:underline focus-visible:underline">
                    {lead.name}
                  </Link>
                  {lead.gesperrt_am && (
                    <Badge tone="red" className="ml-2">
                      Gesperrt
                    </Badge>
                  )}
                  {lead.moegliches_duplikat_von && sichtbareIds.has(lead.moegliches_duplikat_von) && (
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
                    <span className={lead.zugewiesen_an === meId ? 'font-medium text-brand-700' : 'text-ink-600'}>{besitzerAnzeige(lead, meId, nameVon)}</span>
                  ) : (
                    <span className="flex flex-wrap items-center gap-2">
                      <Badge tone="green">Frei</Badge>
                      {leadZugriff(lead, meId, istGF).darfUebernehmen && (
                        // Klick auf den Knopf darf nicht die Zeile (Navigation zum Lead) ausloesen
                        <span onClick={(e) => e.stopPropagation()}>
                          <Button variant="secondary" className="px-2.5 py-1 text-xs" disabled={busyId === lead.id} onClick={() => void uebernimm(lead)}>
                            Übernehmen
                          </Button>
                        </span>
                      )}
                    </span>
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
