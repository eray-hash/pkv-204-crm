import { useApp } from '../../context/AppContext'
import { Card } from '../../components/ui'

export default function TeamProvision() {
  const { state } = useApp()
  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full min-w-[600px] text-left text-sm">
        <thead>
          <tr className="border-b border-ink-100 text-xs uppercase tracking-wide text-ink-400">
            <th className="px-4 py-3 font-medium">Stufe</th>
            <th className="px-4 py-3 font-medium">Bedingung</th>
            <th className="px-4 py-3 font-medium">Provisionssatz</th>
          </tr>
        </thead>
        <tbody>
          {state.teamProvision.map((row) => (
            <tr key={row.id} className="border-b border-ink-50 last:border-0">
              <td className="px-4 py-3 font-medium text-ink-800">{row.stufe}</td>
              <td className="px-4 py-3 text-ink-500">{row.bedingung}</td>
              <td className="px-4 py-3 font-semibold text-brand-600">{row.satzProzent}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}
