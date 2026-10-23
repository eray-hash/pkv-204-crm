import { useMemo } from 'react'
import { useApp } from '../context/AppContext'
import { SectionHeader, Card, KpiTile, StatusBadge, Badge, ExampleNotice } from '../components/ui'
import { formatDateTime } from '../lib/utils'
import { AlertTriangle, Phone, Mail } from 'lucide-react'

export default function Wiedervorlagen() {
  const { state } = useApp()

  const wiedervorlagen = useMemo(
    () =>
      state.beispielLeads
        .filter((l) => l.wiedervorlage)
        .map((l) => ({ lead: l, ueberfaellig: new Date(l.wiedervorlage!.datum).getTime() < Date.now() }))
        .sort((a, b) => new Date(a.lead.wiedervorlage!.datum).getTime() - new Date(b.lead.wiedervorlage!.datum).getTime()),
    [state.beispielLeads],
  )

  const ueberfaelligCount = wiedervorlagen.filter((w) => w.ueberfaellig).length

  return (
    <div>
      <SectionHeader title="Wiedervorlagen" subtitle="Leads und Kunden mit vereinbartem Rückruf- oder Nachfasstermin" />
      <ExampleNotice />

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiTile label="Wiedervorlagen gesamt" value={String(wiedervorlagen.length)} />
        <KpiTile label="Überfällig" value={String(ueberfaelligCount)} accent="red" />
        <KpiTile label="Anstehend" value={String(wiedervorlagen.length - ueberfaelligCount)} accent="brand" />
      </div>

      <div className="space-y-2.5">
        {wiedervorlagen.length === 0 && <Card className="p-8 text-center text-sm text-ink-400">Keine Wiedervorlagen vorhanden.</Card>}
        {wiedervorlagen.map(({ lead, ueberfaellig }) => (
          <Card
            key={lead.id}
            className={`p-4 ${ueberfaellig ? 'border-red-200 bg-red-50/60' : ''}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                {ueberfaellig && <AlertTriangle size={18} className="text-red-500" />}
                <div>
                  <p className="font-medium text-ink-800">{lead.name}</p>
                  <p className="flex items-center gap-3 text-xs text-ink-400">
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
                <StatusBadge status={lead.status} />
                {ueberfaellig && <Badge tone="red">Überfällig</Badge>}
                <div className="text-right">
                  <p className={`text-sm font-medium ${ueberfaellig ? 'text-red-600' : 'text-ink-700'}`}>{formatDateTime(lead.wiedervorlage!.datum)}</p>
                  <p className="text-xs text-ink-400">{lead.wiedervorlage!.notiz}</p>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
