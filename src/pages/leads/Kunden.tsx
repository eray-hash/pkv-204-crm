import { SectionHeader, KpiTile } from '../../components/ui'
import LeadTable from '../../components/LeadTable'
import LeadsGate from '../../components/LeadsGate'
import { beitragSumme, filterKategorie } from '../../lib/leads'
import { formatEuroExact } from '../../lib/utils'

export default function Kunden() {
  return (
    <div>
      <SectionHeader title="Kundenbereich" subtitle="Gewonnene Leads (Status „Gewonnen“)" />
      <LeadsGate>
        {(leads) => {
          const kunden = filterKategorie(leads, 'kunde')
          const summe = beitragSumme(kunden)
          return (
            <>
              <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <KpiTile label="Gewonnene Kunden" value={String(kunden.length)} accent="green" />
                <KpiTile label="Summe Tarifbeiträge" value={formatEuroExact(summe)} hint="monatlich, aller gewonnenen Kunden" accent="brand" />
                <KpiTile label="Ø Tarifbeitrag" value={formatEuroExact(kunden.length ? summe / kunden.length : 0)} hint="pro Kunde" />
              </div>
              <LeadTable leads={kunden} emptyText="Noch keine gewonnenen Kunden." />
            </>
          )
        }}
      </LeadsGate>
    </div>
  )
}
