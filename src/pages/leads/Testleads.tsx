import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { formatDateTime } from '../../lib/utils'
import { Button, Card, EmptyState, ErrorBlock, LoadingBlock, ScrollHint, SectionHeader } from '../../components/ui'

interface TestLead {
  id: string
  externe_id: string
  name: string
  telefon: string
  email: string
  gesellschaft: string
  eingang_zeit: string
  created_at: string
}

/** Nur Geschaeftsfuehrer: Leads, die mit einem Test-Schluessel eingegangen sind (zum Pruefen der Anbindung). Sie zaehlen nirgends mit und werden nie angerufen. */
export default function Testleads() {
  const { profile } = useAuth()
  const istGf = profile?.rolle === 'geschaeftsfuehrer'
  const [leads, setLeads] = useState<TestLead[] | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)

  const laden = useCallback(async () => {
    setFehler(null)
    const { data, error } = await supabase
      .from('leads')
      .select('id, externe_id, name, telefon, email, gesellschaft, eingang_zeit, created_at')
      .eq('ist_test', true)
      .order('created_at', { ascending: false })
      .limit(200)
    if (error) {
      console.error('Testleads laden fehlgeschlagen', error.code)
      setFehler('Die Testleads konnten nicht geladen werden.')
      return
    }
    setLeads((data ?? []) as TestLead[])
  }, [])

  useEffect(() => {
    if (istGf) void laden()
  }, [istGf, laden])

  if (!istGf) {
    return (
      <div>
        <SectionHeader title="Testleads" subtitle="Nur für Geschäftsführer sichtbar" />
        <EmptyState text="Dieser Bereich ist nur für Geschäftsführer sichtbar." />
      </div>
    )
  }

  return (
    <div>
      <SectionHeader title="Testleads" subtitle="Leads, die mit einem Test-Schlüssel eingegangen sind. Sie zählen nicht mit und werden nie angerufen." />
      <div className="mb-3">
        <Button variant="secondary" onClick={() => void laden()}>
          Aktualisieren
        </Button>
      </div>
      {fehler ? (
        <ErrorBlock message={fehler} onRetry={() => void laden()} />
      ) : leads === null ? (
        <LoadingBlock text="Testleads werden geladen …" />
      ) : leads.length === 0 ? (
        <EmptyState text="Noch keine Testleads eingegangen." />
      ) : (
        <>
          <ScrollHint />
          <Card className="overflow-x-auto p-0">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-ink-100 text-xs uppercase tracking-wide text-ink-400">
                  <th className="px-4 py-3 font-medium">Eingegangen</th>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Telefon</th>
                  <th className="px-4 py-3 font-medium">E-Mail</th>
                  <th className="px-4 py-3 font-medium">Lead-Nr. des Lieferanten</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => (
                  <tr key={l.id} className="border-b border-ink-50 last:border-0">
                    <td className="px-4 py-3 text-ink-600">{formatDateTime(l.created_at)}</td>
                    <td className="px-4 py-3 font-medium text-ink-800">{l.name}</td>
                    <td className="px-4 py-3 text-ink-600">{l.telefon}</td>
                    <td className="px-4 py-3 text-ink-600 break-all">{l.email}</td>
                    <td className="px-4 py-3 text-ink-400 break-all">{l.externe_id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  )
}
