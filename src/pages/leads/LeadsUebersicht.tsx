import { useMemo, useState } from 'react'
import { useLeads } from '../../context/LeadsContext'
import { SectionHeader, KpiTile, inputClass } from '../../components/ui'
import LeadTable from '../../components/LeadTable'
import LeadsGate from '../../components/LeadsGate'
import { ALL_STATUS, isOpenStatus, STATUS_LABEL, type DbLead, type DbLeadStatus } from '../../lib/leads'

function Liste({ leads }: { leads: DbLead[] }) {
  const { queue } = useLeads()
  const [suche, setSuche] = useState('')
  const [status, setStatus] = useState<DbLeadStatus | 'alle'>('alle')

  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase()
    return leads.filter((l) => {
      if (status !== 'alle' && l.status !== status) return false
      if (!q) return true
      return [l.name, l.telefon, l.email, l.gesellschaft].some((v) => v.toLowerCase().includes(q))
    })
  }, [leads, suche, status])

  const offen = leads.filter((l) => isOpenStatus(l.status)).length
  const neu = leads.filter((l) => l.status === 'neu').length

  return (
    <>
      <div className="mb-5 grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiTile label="Leads gesamt" value={String(leads.length)} />
        <KpiTile label="In Bearbeitung" value={String(offen)} accent="amber" />
        <KpiTile label="Neu" value={String(neu)} />
        <KpiTile label="Anrufbar" value={String(queue.length)} accent="brand" hint="im Power Dialer" />
      </div>

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <input
          className={`${inputClass} sm:max-w-xs`}
          placeholder="Suchen (Name, Telefon, E-Mail, Gesellschaft)"
          value={suche}
          onChange={(e) => setSuche(e.target.value)}
          aria-label="Leads durchsuchen"
        />
        <select className={`${inputClass} sm:max-w-[14rem]`} value={status} onChange={(e) => setStatus(e.target.value as DbLeadStatus | 'alle')} aria-label="Nach Status filtern">
          <option value="alle">Alle Status</option>
          {ALL_STATUS.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </div>

      <LeadTable
        leads={gefiltert}
        emptyText={
          leads.length === 0
            ? 'Noch keine Leads vorhanden. Neue Leads erscheinen hier automatisch, sobald sie vom Lead-Lieferanten eingehen.'
            : 'Keine Leads zu dieser Suche gefunden.'
        }
      />
    </>
  )
}

export default function LeadsUebersicht() {
  return (
    <div>
      <SectionHeader title="Leads" subtitle="Alle eingegangenen Leads aus der Datenbank, neueste zuerst" />
      <LeadsGate>{(leads) => <Liste leads={leads} />}</LeadsGate>
    </div>
  )
}
