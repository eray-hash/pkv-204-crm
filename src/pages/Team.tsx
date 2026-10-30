import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useTeam } from '../context/TeamContext'
import { useLeads } from '../context/LeadsContext'
import { Card, SectionHeader, KpiTile, ScrollHint, LoadingBlock, ErrorBlock } from '../components/ui'
import { ladeAnrufzahlen } from '../lib/teamApi'
import { summeTeam, teamZeilen } from '../lib/team'
import { ShieldAlert } from 'lucide-react'

const NICHT_ERFASST = 'noch nicht erfasst'

function Zahl({ wert }: { wert: number | null }) {
  return wert === null ? (
    <span className="text-ink-400" title={NICHT_ERFASST}>
      –
    </span>
  ) : (
    <>{wert}</>
  )
}

function NichtErfasst() {
  return (
    <span className="text-ink-400" title={NICHT_ERFASST}>
      – <span className="text-xs">({NICHT_ERFASST})</span>
    </span>
  )
}

export default function Team() {
  const { profile } = useAuth()
  const { mitglieder, loading, error, reload } = useTeam()
  const { leads } = useLeads()
  const [anrufe, setAnrufe] = useState<Record<string, number> | null>(null)
  const [anrufeGeladen, setAnrufeGeladen] = useState(false)

  const istGf = profile?.rolle === 'geschaeftsfuehrer'
  const idKey = mitglieder.map((m) => m.id).join(',')

  useEffect(() => {
    if (!istGf || !idKey) return
    let aktiv = true
    void ladeAnrufzahlen(idKey.split(',')).then((a) => {
      if (!aktiv) return
      setAnrufe(a)
      setAnrufeGeladen(true)
    })
    return () => {
      aktiv = false
    }
  }, [istGf, idKey])

  const zeilen = useMemo(() => teamZeilen(mitglieder.map((m) => m.id), leads, anrufe), [mitglieder, leads, anrufe])
  const summe = useMemo(() => summeTeam(zeilen), [zeilen])

  if (!istGf) {
    return (
      <div>
        <SectionHeader title="Team" subtitle="Team-Tracking" />
        <Card className="flex flex-col items-center gap-2 p-10 text-center text-sm text-ink-500">
          <ShieldAlert size={28} className="text-amber-500" />
          <p>Dieser Bereich ist nur in der Ansicht „Geschäftsführer“ sichtbar.</p>
          <p className="text-xs text-ink-400">Ihr Konto hat die Rolle „Mitarbeiter“.</p>
        </Card>
      </div>
    )
  }

  return (
    <div>
      <SectionHeader title="Team" subtitle="Leistungsübersicht pro Teammitglied (nur für Geschäftsführer sichtbar)" />

      {loading && mitglieder.length === 0 ? (
        <LoadingBlock text="Team wird geladen …" />
      ) : error && mitglieder.length === 0 ? (
        <ErrorBlock message={error} onRetry={() => void reload()} />
      ) : (
        <>
          <p className="mb-4 text-sm text-ink-500">
            Angezeigt werden nur Zahlen, die in der Datenbank vorliegen: Anrufe aus dem Anruf-Protokoll und die jeweils zugewiesenen Leads. Alles
            andere (z. B. Einnahmen) ist noch nicht erfasst.
          </p>
          {anrufeGeladen && anrufe === null && (
            <div className="mb-4">
              <ErrorBlock message="Die Anrufzahlen konnten nicht geladen werden." />
            </div>
          )}

          <div className="mb-5 grid grid-cols-2 gap-4 md:grid-cols-4">
            <KpiTile label="Anrufe gesamt" value={summe.anrufe === null ? '–' : String(summe.anrufe)} />
            <KpiTile label="Zugewiesene Leads" value={String(summe.zugewiesen)} accent="brand" />
            <KpiTile label="Termin vereinbart" value={String(summe.terminVereinbart)} accent="amber" hint="zugewiesene Leads im Status" />
            <KpiTile label="Gewonnen" value={String(summe.gewonnen)} accent="green" hint="zugewiesene Leads im Status" />
          </div>

          <ScrollHint />
          <div className="overflow-x-auto rounded-2xl border border-ink-100 bg-white shadow-sm">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead>
                <tr className="border-b border-ink-100 text-xs uppercase tracking-wide text-ink-400">
                  <th className="px-4 py-3 font-medium">Mitarbeiter</th>
                  <th className="px-4 py-3 font-medium">Anrufe gesamt</th>
                  <th className="px-4 py-3 font-medium">Zugewiesene Leads</th>
                  <th className="px-4 py-3 font-medium">Termin vereinbart</th>
                  <th className="px-4 py-3 font-medium">Gewonnen</th>
                  <th className="px-4 py-3 font-medium">Einnahmen</th>
                  <th className="px-4 py-3 font-medium">Nicht rausgegangene Anrufe</th>
                </tr>
              </thead>
              <tbody>
                {mitglieder.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-ink-400">
                      Noch keine Einträge.
                    </td>
                  </tr>
                )}
                {mitglieder.map((m, i) => {
                  const z = zeilen[i]
                  return (
                    <tr key={m.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50/70">
                      <td className="px-4 py-3">
                        <p className="font-medium text-ink-800">{m.name || 'Ohne Namen'}</p>
                        <p className="text-xs text-ink-400">{m.rolle === 'geschaeftsfuehrer' ? 'Geschäftsführer' : 'Mitarbeiter'}</p>
                      </td>
                      <td className="px-4 py-3 text-ink-600">
                        <Zahl wert={z?.anrufe ?? null} />
                      </td>
                      <td className="px-4 py-3 text-ink-600">{z?.zugewiesen ?? 0}</td>
                      <td className="px-4 py-3 text-ink-600">{z?.terminVereinbart ?? 0}</td>
                      <td className="px-4 py-3 text-ink-600">{z?.gewonnen ?? 0}</td>
                      <td className="px-4 py-3">
                        <NichtErfasst />
                      </td>
                      <td className="px-4 py-3">
                        <NichtErfasst />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-ink-100 bg-ink-50/60 font-semibold text-ink-800">
                  <td className="px-4 py-3">Gesamt</td>
                  <td className="px-4 py-3">
                    <Zahl wert={summe.anrufe} />
                  </td>
                  <td className="px-4 py-3">{summe.zugewiesen}</td>
                  <td className="px-4 py-3">{summe.terminVereinbart}</td>
                  <td className="px-4 py-3">{summe.gewonnen}</td>
                  <td className="px-4 py-3 font-normal">
                    <NichtErfasst />
                  </td>
                  <td className="px-4 py-3 font-normal">
                    <NichtErfasst />
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
