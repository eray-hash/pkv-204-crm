import { SectionHeader, KpiTile } from '../../components/ui'
import LeadTable from '../../components/LeadTable'
import LeadsGate from '../../components/LeadsGate'
import { ageInDays, ALT_NACH_TAGEN, beitragSumme, filterKategorie } from '../../lib/leads'
import { formatEuroExact } from '../../lib/utils'

export default function Alte() {
  return (
    <div>
      <SectionHeader title="Alte Leads" subtitle={`Offene Leads, die älter als ${ALT_NACH_TAGEN} Tage sind`} />
      <LeadsGate>
        {(leads) => {
          const alte = filterKategorie(leads, 'alt')
          const schnitt = alte.length ? Math.round(alte.reduce((s, l) => s + ageInDays(l.eingang_zeit), 0) / alte.length) : 0
          return (
            <>
              <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <KpiTile label="Alte Leads" value={String(alte.length)} />
                <KpiTile label="Ø Alter" value={`${schnitt} Tage`} accent="amber" />
                <KpiTile label="Tarifbeitrag-Volumen" value={formatEuroExact(beitragSumme(alte))} hint="monatlich, aller alten Leads" />
              </div>
              <LeadTable
                leads={alte}
                extraColumnLabel="Alter"
                extraColumnRender={(l) => `${ageInDays(l.eingang_zeit)} Tage`}
                emptyText="Keine alten Leads."
              />
            </>
          )
        }}
      </LeadsGate>
    </div>
  )
}
