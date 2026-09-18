import { useMemo } from 'react'
import { useApp } from '../../context/AppContext'
import { SectionHeader, KpiTile } from '../../components/ui'
import LeadTable from '../../components/LeadTable'
import { formatEuro } from '../../lib/utils'

export default function Verloren() {
  const { state } = useApp()
  const verloren = useMemo(() => state.leads.filter((l) => l.liste === 'verloren'), [state.leads])

  const entgangeneErsparnis = verloren.reduce((sum, l) => sum + Math.round(l.beitragAlt * 0.2), 0)
  const gesamtLeads = state.leads.filter((l) => ['kunde', 'verloren'].includes(l.liste)).length
  const quote = gesamtLeads > 0 ? Math.round((verloren.length / gesamtLeads) * 100) : 0

  return (
    <div>
      <SectionHeader title="Verlorene Leads" subtitle="Leads, die den Tarifwechsel nicht abgeschlossen haben oder abgesprungen sind" />

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiTile label="Verlorene Leads" value={String(verloren.length)} accent="red" />
        <KpiTile label="Entgangene Ersparnis" value={formatEuro(entgangeneErsparnis)} hint="geschätzt, monatlich" />
        <KpiTile label="Verlustquote" value={`${quote}%`} hint="von Kunden + verlorenen Leads" />
      </div>

      <LeadTable leads={verloren} extraColumnLabel="Grund" extraColumnRender={(l) => l.verlorenGrund ?? '–'} />
    </div>
  )
}
