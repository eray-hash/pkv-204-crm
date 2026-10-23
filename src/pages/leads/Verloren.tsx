import { SectionHeader, KpiTile } from '../../components/ui'
import LeadTable from '../../components/LeadTable'
import LeadsGate from '../../components/LeadsGate'
import { filterKategorie } from '../../lib/leads'

export default function Verloren() {
  return (
    <div>
      <SectionHeader
        title="Verlorene Leads"
        subtitle="Abgeschlossene Leads: verloren, verstorben, nicht mehr PKV, kein Interesse oder schon umgestellt"
      />
      <LeadsGate>
        {(leads) => {
          const verloren = filterKategorie(leads, 'verloren')
          const anzahl = (s: string) => verloren.filter((l) => l.status === s).length
          return (
            <>
              <div className="mb-5 grid grid-cols-2 gap-4 md:grid-cols-4">
                <KpiTile label="Verlorene Leads" value={String(verloren.length)} accent="red" />
                <KpiTile label="Kein Interesse" value={String(anzahl('kein_interesse'))} />
                <KpiTile label="Schon umgestellt" value={String(anzahl('schon_umgestellt'))} />
                <KpiTile label="Nicht mehr PKV / Verstorben" value={String(anzahl('nicht_mehr_pkv') + anzahl('verstorben'))} />
              </div>
              <LeadTable leads={verloren} emptyText="Keine verlorenen Leads." />
            </>
          )
        }}
      </LeadsGate>
    </div>
  )
}
