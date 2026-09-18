import { useMemo } from 'react'
import { useApp } from '../../context/AppContext'
import { SectionHeader, KpiTile } from '../../components/ui'
import LeadTable from '../../components/LeadTable'
import { formatEuro } from '../../lib/utils'

export default function Kunden() {
  const { state } = useApp()
  const kunden = useMemo(() => state.leads.filter((l) => l.liste === 'kunde'), [state.leads])

  const gesamtFakturierung = kunden.reduce((sum, k) => sum + (k.beitragNeu ?? k.beitragAlt), 0)
  const durchschnitt = kunden.length > 0 ? gesamtFakturierung / kunden.length : 0

  return (
    <div>
      <SectionHeader title="Kundenbereich" subtitle="Gewonnene Leads, die erfolgreich in einen optimierten Tarif gewechselt sind" />

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiTile label="Gewonnene Kunden" value={String(kunden.length)} accent="green" />
        <KpiTile label="Gesamt-Fakturierung" value={formatEuro(gesamtFakturierung)} hint="Monatliche Beitragssumme aller Kunden" accent="brand" />
        <KpiTile label="Ø monatlicher Umsatz" value={formatEuro(durchschnitt)} hint="pro Kunde" />
      </div>

      <LeadTable leads={kunden} />
    </div>
  )
}
