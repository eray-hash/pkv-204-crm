import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../../context/AppContext'
import { useToast } from '../../components/ToastContext'
import { Card, SectionHeader, KpiTile, Badge, Button, inputClass, ScrollHint } from '../../components/ui'
import { formatDate } from '../../lib/utils'
import { REKLAMATION_STATUS_LABEL, type ReklamationStatus } from '../../types'
import { ClipboardCopy, Download, AlertOctagon } from 'lucide-react'

export default function Reklamiert() {
  const { state, dispatch } = useApp()
  const { showToast } = useToast()
  const navigate = useNavigate()

  const reklamiert = useMemo(
    () =>
      state.leads
        .filter((l) => l.liste === 'reklamiert' && l.reklamation)
        .sort((a, b) => new Date(b.reklamation!.datum).getTime() - new Date(a.reklamation!.datum).getTime()),
    [state.leads],
  )

  const offen = reklamiert.filter((l) => l.reklamation!.status === 'offen').length
  const erledigt = reklamiert.length - offen

  function buildListText(): string {
    const zeilen = reklamiert.map((l, i) => {
      const r = l.reklamation!
      return `${i + 1}. ${l.name} | Tel: ${l.telefon} | E-Mail: ${l.email} | Grund: ${r.grund} | Reklamiert am: ${formatDate(r.datum)} | Status: ${REKLAMATION_STATUS_LABEL[r.status]}${r.notiz ? ` | Notiz: ${r.notiz}` : ''}`
    })
    return `Reklamierte Leads – §204 PKV-Tarifoptimierung\nStand: ${formatDate(new Date().toISOString())}\n\n${zeilen.join('\n')}`
  }

  function handleCopy() {
    const text = buildListText()
    navigator.clipboard
      ?.writeText(text)
      .then(() => showToast('Liste der reklamierten Leads wurde in die Zwischenablage kopiert'))
      .catch(() => showToast('Kopieren nicht möglich – bitte Text manuell markieren', 'info'))
  }

  function handleExportCsv() {
    const header = 'Name;Telefon;E-Mail;Grund;Reklamiert am;Status;Notiz'
    const rows = reklamiert.map((l) => {
      const r = l.reklamation!
      return [l.name, l.telefon, l.email, r.grund, formatDate(r.datum), REKLAMATION_STATUS_LABEL[r.status], r.notiz]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(';')
    })
    const csv = [header, ...rows].join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `reklamierte-leads-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    showToast('CSV-Export wurde heruntergeladen')
  }

  return (
    <div>
      <SectionHeader
        title="Reklamierte Leads"
        subtitle="Leads, die als Reklamation an den Lead-Lieferanten gemeldet wurden"
        actions={
          <>
            <Button variant="secondary" onClick={handleCopy}>
              <ClipboardCopy size={15} /> Als Liste kopieren
            </Button>
            <Button variant="secondary" onClick={handleExportCsv}>
              <Download size={15} /> CSV exportieren
            </Button>
          </>
        }
      />

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiTile label="Reklamationen gesamt" value={String(reklamiert.length)} />
        <KpiTile label="Offen (an Lieferant gemeldet)" value={String(offen)} accent="red" />
        <KpiTile label="Erledigt" value={String(erledigt)} accent="green" />
      </div>

      <Card className="mb-4 flex items-start gap-2 p-4 text-sm text-ink-500">
        <AlertOctagon size={18} className="mt-0.5 shrink-0 text-amber-500" />
        <p>
          Diese Liste ist als Meldung an den Lead-Lieferanten gedacht. Über „Als Liste kopieren" oder „CSV exportieren" kann sie direkt
          weitergeleitet werden. Der Status lässt sich je Reklamation manuell auf den Rückmeldestand des Lieferanten umschalten.
        </p>
      </Card>

      {reklamiert.length === 0 ? (
        <Card className="p-8 text-center text-sm text-ink-400">Keine reklamierten Leads vorhanden.</Card>
      ) : (
        <>
        <ScrollHint />
        <div className="overflow-x-auto rounded-2xl border border-ink-100 bg-white shadow-sm">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr className="border-b border-ink-100 text-xs uppercase tracking-wide text-ink-400">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Kontakt</th>
                <th className="px-4 py-3 font-medium">Grund</th>
                <th className="px-4 py-3 font-medium">Notiz</th>
                <th className="px-4 py-3 font-medium">Reklamiert am</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {reklamiert.map((l) => (
                <tr key={l.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50/70">
                  <td className="cursor-pointer px-4 py-3 font-medium text-ink-800" onClick={() => navigate(`/leads/${l.id}`)}>
                    {l.name}
                  </td>
                  <td className="px-4 py-3 text-ink-500">
                    {l.telefon}
                    <br />
                    <span className="text-xs text-ink-400">{l.email}</span>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone="red">{l.reklamation!.grund}</Badge>
                  </td>
                  <td className="max-w-[220px] px-4 py-3 text-ink-500">{l.reklamation!.notiz || '–'}</td>
                  <td className="px-4 py-3 text-ink-500">{formatDate(l.reklamation!.datum)}</td>
                  <td className="px-4 py-3">
                    <select
                      className={`${inputClass} py-1.5 text-xs`}
                      value={l.reklamation!.status}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => dispatch({ type: 'SET_REKLAMATION_STATUS', id: l.id, status: e.target.value as ReklamationStatus })}
                    >
                      {(Object.keys(REKLAMATION_STATUS_LABEL) as ReklamationStatus[]).map((s) => (
                        <option key={s} value={s}>
                          {REKLAMATION_STATUS_LABEL[s]}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  )
}
