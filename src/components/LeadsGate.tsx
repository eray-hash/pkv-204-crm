import type { ReactNode } from 'react'
import { useLeads } from '../context/LeadsContext'
import type { DbLead } from '../lib/leads'
import { ErrorBlock, LoadingBlock } from './ui'

/** Zeigt Lade- und Fehlerzustand fuer alle Seiten, die Leads aus der Datenbank brauchen. */
export default function LeadsGate({ children }: { children: (leads: DbLead[]) => ReactNode }) {
  const { leads, loading, error, reload } = useLeads()
  if (loading && leads.length === 0) return <LoadingBlock text="Leads werden geladen …" />
  if (error && leads.length === 0) return <ErrorBlock message={error} onRetry={() => void reload()} />
  return (
    <>
      {error && <div className="mb-4"><ErrorBlock message={`${error} Es werden die zuletzt geladenen Daten angezeigt.`} onRetry={() => void reload()} /></div>}
      {children(leads)}
    </>
  )
}
