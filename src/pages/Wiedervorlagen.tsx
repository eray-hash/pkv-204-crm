import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { SectionHeader, Card, KpiTile, Badge, EmptyState } from '../components/ui'
import LeadsGate from '../components/LeadsGate'
import { DbStatusBadge } from '../components/LeadTable'
import { formatDateTime } from '../lib/utils'
import { wiedervorlagenFuer } from '../lib/leads'
import { AlertTriangle, Phone, Mail } from 'lucide-react'

export default function Wiedervorlagen() {
  const { profile } = useAuth()

  return (
    <div>
      <SectionHeader title="Wiedervorlagen" subtitle="Ihre Leads mit vereinbartem Rückruf (nächster Anruf ab …)" />
      <LeadsGate>
        {(leads) => {
          const liste = wiedervorlagenFuer(leads, profile?.id ?? null)
          const ueberfaellig = liste.filter((w) => w.ueberfaellig).length
          return (
            <>
              <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <KpiTile label="Wiedervorlagen gesamt" value={String(liste.length)} />
                <KpiTile label="Überfällig" value={String(ueberfaellig)} accent="red" />
                <KpiTile label="Anstehend" value={String(liste.length - ueberfaellig)} accent="brand" />
              </div>

              <div className="space-y-2.5">
                {liste.length === 0 && <EmptyState text="Noch keine Einträge." />}
                {liste.map(({ lead, faellig, ueberfaellig: ue }) => (
                  <Card key={lead.id} className={`p-4 ${ue ? 'border-red-200 bg-red-50/60' : ''}`}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        {ue && <AlertTriangle size={18} className="text-red-500" />}
                        <div>
                          <Link to={`/leads/${lead.id}`} className="font-medium text-ink-800 hover:text-brand-700 hover:underline">
                            {lead.name}
                          </Link>
                          <p className="flex flex-wrap items-center gap-x-3 text-xs text-ink-400">
                            <span className="flex items-center gap-1">
                              <Phone size={12} /> {lead.telefon}
                            </span>
                            <span className="flex items-center gap-1">
                              <Mail size={12} /> {lead.email}
                            </span>
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <DbStatusBadge status={lead.status} />
                        {ue && <Badge tone="red">Überfällig</Badge>}
                        <p className={`text-sm font-medium ${ue ? 'text-red-600' : 'text-ink-700'}`}>{formatDateTime(faellig)}</p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </>
          )
        }}
      </LeadsGate>
    </div>
  )
}
