import { useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import { useToast } from '../components/ToastContext'
import { Card, SectionHeader, KpiTile, Badge, Modal, Button } from '../components/ui'
import SimpleBarChart from '../components/SimpleBarChart'
import { formatEuro, formatDate } from '../lib/utils'

type BuchhaltungFilter = 'gesamt' | 'diesermonat' | 'letztermonat' | 'letzte14' | 'custom'

const FILTER_LABEL: Record<BuchhaltungFilter, string> = {
  gesamt: 'Gesamt',
  diesermonat: 'Dieser Monat',
  letztermonat: 'Letzter Monat',
  letzte14: 'Letzte 2 Wochen',
  custom: 'Benutzerdefiniert',
}

export default function Buchhaltung() {
  const { state, dispatch } = useApp()
  const { showToast } = useToast()
  const [filter, setFilter] = useState<BuchhaltungFilter>('gesamt')
  const [payoutDialog, setPayoutDialog] = useState(false)
  const [payoutAmount, setPayoutAmount] = useState(0)
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')

  const { umsatz } = useMemo(() => {
    const data = state.umsatzverlauf
    if (filter === 'gesamt') {
      return { umsatz: data.reduce((s, d) => s + d.umsatz, 0), provision: data.reduce((s, d) => s + d.provision, 0) }
    }
    if (filter === 'diesermonat') {
      const last = data[data.length - 1]
      return { umsatz: last?.umsatz ?? 0, provision: last?.provision ?? 0 }
    }
    if (filter === 'letztermonat') {
      const prev = data[data.length - 2]
      return { umsatz: prev?.umsatz ?? 0, provision: prev?.provision ?? 0 }
    }
    if (filter === 'letzte14') {
      const last = data[data.length - 1]
      return { umsatz: Math.round((last?.umsatz ?? 0) / 2), provision: Math.round((last?.provision ?? 0) / 2) }
    }
    // custom – vereinfachte Mockup-Berechnung anhand gewählter Tage
    const tage = customStart && customEnd ? Math.max(1, Math.round((new Date(customEnd).getTime() - new Date(customStart).getTime()) / 86400000)) : 30
    const letzterMonat = data[data.length - 1]
    const faktor = tage / 30
    return { umsatz: Math.round((letzterMonat?.umsatz ?? 0) * faktor), provision: Math.round((letzterMonat?.provision ?? 0) * faktor) }
  }, [filter, state.umsatzverlauf, customStart, customEnd])

  const ausgezahlt = state.auszahlungen.filter((a) => a.status === 'ausgezahlt').reduce((s, a) => s + a.betrag, 0)
  const zurAuszahlungAnstehend = state.auszahlungen.filter((a) => a.status !== 'ausgezahlt').reduce((s, a) => s + a.betrag, 0)
  const gesamtProvisionAllTime = state.umsatzverlauf.reduce((s, d) => s + d.provision, 0)
  const offeneProvisionen = Math.max(gesamtProvisionAllTime - ausgezahlt - zurAuszahlungAnstehend, 320)

  function handlePayoutRequest() {
    setPayoutAmount(offeneProvisionen)
    dispatch({ type: 'REQUEST_PAYOUT', betrag: offeneProvisionen })
    setPayoutDialog(true)
  }

  return (
    <div>
      <SectionHeader title="Buchhaltung" subtitle="Umsatz, Provisionen und Auszahlungen im Überblick" />

      <Card className="mb-5 p-3">
        <div className="flex flex-wrap items-center gap-2">
          {(Object.keys(FILTER_LABEL) as BuchhaltungFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${filter === f ? 'bg-brand-600 text-white' : 'bg-ink-50 text-ink-500 hover:bg-ink-100'}`}
            >
              {FILTER_LABEL[f]}
            </button>
          ))}
          {filter === 'custom' && (
            <div className="ml-auto flex items-center gap-2">
              <input type="date" className="rounded-lg border border-ink-200 px-2 py-1.5 text-sm" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
              <span className="text-sm text-ink-400">bis</span>
              <input type="date" className="rounded-lg border border-ink-200 px-2 py-1.5 text-sm" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
            </div>
          )}
        </div>
      </Card>

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiTile label="Umsatz gesamt" value={formatEuro(umsatz)} hint={FILTER_LABEL[filter]} />
        <KpiTile label="Zur Auszahlung anstehend" value={formatEuro(zurAuszahlungAnstehend)} accent="amber" />
        <KpiTile label="Offene Provisionen" value={formatEuro(offeneProvisionen)} accent="brand" hint="noch nicht abgerechnet" />
        <KpiTile label="Bereits ausgezahlt" value={formatEuro(ausgezahlt)} accent="green" />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-ink-800">Umsatz- & Provisionsverlauf</h2>
            <div className="flex items-center gap-3 text-xs text-ink-400">
              <span className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-sm bg-brand-500" /> Umsatz
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: '#a5b4fc' }} /> Provision
              </span>
            </div>
          </div>
          <SimpleBarChart data={state.umsatzverlauf} />
        </Card>

        <Card className="p-5">
          <div className="mb-3 flex flex-col gap-2">
            <h2 className="font-semibold text-ink-800">Auszahlungen</h2>
            <Button className="w-full justify-center" onClick={handlePayoutRequest}>
              Auszahlungsbereit
            </Button>
          </div>
          <div className="divide-y divide-ink-50">
            {state.auszahlungen.map((a) => (
              <div key={a.id} className="flex items-center justify-between py-2.5 text-sm">
                <div>
                  <p className="text-ink-700">{formatDate(a.datum)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-ink-800">{formatEuro(a.betrag)}</span>
                  <Badge tone={a.status === 'ausgezahlt' ? 'green' : a.status === 'angefordert' ? 'brand' : 'amber'}>{a.status}</Badge>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Modal open={payoutDialog} onClose={() => setPayoutDialog(false)} title="Auszahlung angefordert">
        <p className="text-sm text-ink-600">
          Ihre Auszahlung über <span className="font-semibold text-ink-800">{formatEuro(payoutAmount)}</span> wurde erfolgreich angefordert und wird
          innerhalb der nächsten 3–5 Werktage bearbeitet.
        </p>
        <div className="mt-5 flex justify-end">
          <Button
            onClick={() => {
              setPayoutDialog(false)
              showToast('Auszahlung wurde angefordert')
            }}
          >
            Verstanden
          </Button>
        </div>
      </Modal>
    </div>
  )
}
