import { useState } from 'react'
import { useApp } from '../../context/AppContext'
import { SectionHeader, Button, KpiTile } from '../../components/ui'
import LeadTable from '../../components/LeadTable'
import LeadFormModal from '../../components/LeadFormModal'
import { Plus } from 'lucide-react'

export default function LeadsUebersicht() {
  const { state } = useApp()
  const [modalOpen, setModalOpen] = useState(false)

  const aktiveLeads = state.leads.filter((l) => l.liste === 'aktiv')
  const neu = aktiveLeads.filter((l) => l.status === 'Neu').length
  const inBearbeitung = aktiveLeads.filter((l) => !['Neu', 'Gewonnen', 'Verloren'].includes(l.status)).length

  return (
    <div>
      <SectionHeader
        title="Leads"
        subtitle="Alle laufenden Leads in der §204-Beratungspipeline"
        actions={
          <Button onClick={() => setModalOpen(true)}>
            <Plus size={16} /> Lead hinzufügen
          </Button>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiTile label="Leads gesamt" value={String(state.leads.length)} />
        <KpiTile label="Aktive Pipeline" value={String(aktiveLeads.length)} accent="brand" />
        <KpiTile label="Neu" value={String(neu)} />
        <KpiTile label="In Bearbeitung" value={String(inBearbeitung)} accent="amber" />
      </div>

      <LeadTable leads={aktiveLeads} />

      <LeadFormModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  )
}
