import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { Card, SectionHeader, KpiTile, ScrollHint, ExampleNotice } from '../components/ui'
import { formatEuro } from '../lib/utils'
import { ShieldAlert } from 'lucide-react'

export default function Team() {
  const { state } = useApp()
  const { profile } = useAuth()

  if (profile?.rolle !== 'geschaeftsfuehrer') {
    return (
      <div>
        <SectionHeader title="Team" subtitle="Team-Tracking" />
        <Card className="flex flex-col items-center gap-2 p-10 text-center text-sm text-ink-500">
          <ShieldAlert size={28} className="text-amber-500" />
          <p>Dieser Bereich ist nur in der Ansicht „Geschäftsführer" sichtbar.</p>
          <p className="text-xs text-ink-400">Ihr Konto hat die Rolle „Mitarbeiter“.</p>
        </Card>
      </div>
    )
  }

  const zeilen = state.teammitglieder.map((t) => ({
    mitglied: t,
    perf: state.teamPerformance.find((p) => p.teammitgliedId === t.id),
  }))

  const summe = state.teamPerformance.reduce(
    (acc, p) => ({
      einnahmen: acc.einnahmen + p.einnahmen,
      anrufeGesamt: acc.anrufeGesamt + p.anrufeGesamt,
      guteAnrufe: acc.guteAnrufe + p.guteAnrufe,
      terminAnrufe: acc.terminAnrufe + p.terminAnrufe,
      abschlussAnrufe: acc.abschlussAnrufe + p.abschlussAnrufe,
      nichtErreichtAnrufe: acc.nichtErreichtAnrufe + p.nichtErreichtAnrufe,
    }),
    { einnahmen: 0, anrufeGesamt: 0, guteAnrufe: 0, terminAnrufe: 0, abschlussAnrufe: 0, nichtErreichtAnrufe: 0 },
  )

  return (
    <div>
      <SectionHeader title="Team" subtitle="Leistungsübersicht pro Teammitglied (nur für Geschäftsführer sichtbar)" />
      <ExampleNotice text="Beispieldaten – die Team-Zahlen sind noch nicht mit der Datenbank verbunden." />

      <div className="mb-5 grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiTile label="Team-Einnahmen" value={formatEuro(summe.einnahmen)} accent="brand" />
        <KpiTile label="Anrufe gesamt" value={String(summe.anrufeGesamt)} />
        <KpiTile label="Termine erzielt" value={String(summe.terminAnrufe)} accent="amber" />
        <KpiTile label="Abschlüsse" value={String(summe.abschlussAnrufe)} accent="green" />
      </div>

      <ScrollHint />
      <div className="overflow-x-auto rounded-2xl border border-ink-100 bg-white shadow-sm">
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead>
            <tr className="border-b border-ink-100 text-xs uppercase tracking-wide text-ink-400">
              <th className="px-4 py-3 font-medium">Mitarbeiter</th>
              <th className="px-4 py-3 font-medium">Einnahmen</th>
              <th className="px-4 py-3 font-medium">Anrufe gesamt</th>
              <th className="px-4 py-3 font-medium">Gute Anrufe</th>
              <th className="px-4 py-3 font-medium">Zu Termin geführt</th>
              <th className="px-4 py-3 font-medium">Zu Abschluss geführt</th>
              <th className="px-4 py-3 font-medium">Nicht rausgegangen</th>
            </tr>
          </thead>
          <tbody>
            {zeilen.map(({ mitglied, perf }) =>
              perf ? (
                <tr key={mitglied.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50/70">
                  <td className="px-4 py-3">
                    <p className="font-medium text-ink-800">{mitglied.name}</p>
                    <p className="text-xs text-ink-400">{mitglied.rolle}</p>
                  </td>
                  <td className="px-4 py-3 font-medium text-brand-600">{formatEuro(perf.einnahmen)}</td>
                  <td className="px-4 py-3 text-ink-600">{perf.anrufeGesamt}</td>
                  <td className="px-4 py-3 text-ink-600">{perf.guteAnrufe}</td>
                  <td className="px-4 py-3 text-ink-600">{perf.terminAnrufe}</td>
                  <td className="px-4 py-3 text-ink-600">{perf.abschlussAnrufe}</td>
                  <td className="px-4 py-3 text-ink-400">{perf.nichtErreichtAnrufe}</td>
                </tr>
              ) : null,
            )}
          </tbody>
          <tfoot>
            <tr className="border-t border-ink-100 bg-ink-50/60 font-semibold text-ink-800">
              <td className="px-4 py-3">Gesamt</td>
              <td className="px-4 py-3">{formatEuro(summe.einnahmen)}</td>
              <td className="px-4 py-3">{summe.anrufeGesamt}</td>
              <td className="px-4 py-3">{summe.guteAnrufe}</td>
              <td className="px-4 py-3">{summe.terminAnrufe}</td>
              <td className="px-4 py-3">{summe.abschlussAnrufe}</td>
              <td className="px-4 py-3">{summe.nichtErreichtAnrufe}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
