import { useMemo } from 'react'
import { useApp } from '../../context/AppContext'
import { SectionHeader, KpiTile } from '../../components/ui'
import LeadTable from '../../components/LeadTable'

export default function Alte() {
  const { state } = useApp()
  const alte = useMemo(() => state.leads.filter((l) => l.liste === 'alt'), [state.leads])

  function tageInaktiv(iso: string): number {
    return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24))
  }

  return (
    <div>
      <SectionHeader title="Alte Leads" subtitle="Ältere, inaktive Leads ohne aktuelle Bearbeitung – Kandidaten für eine Reaktivierungs-Kampagne" />

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiTile label="Alte Leads" value={String(alte.length)} />
        <KpiTile
          label="Ø Tage inaktiv"
          value={alte.length > 0 ? String(Math.round(alte.reduce((s, l) => s + tageInaktiv(l.erstelltAm), 0) / alte.length)) : '0'}
          accent="amber"
        />
        <KpiTile label="Reaktivierungspotenzial" value="18%" hint="geschätzte Erfolgsquote bei erneuter Ansprache" />
      </div>

      <LeadTable leads={alte} extraColumnLabel="Zuletzt aktiv" extraColumnRender={(l) => `vor ${tageInaktiv(l.erstelltAm)} Tagen`} dateLabel="Angelegt am" />
    </div>
  )
}
