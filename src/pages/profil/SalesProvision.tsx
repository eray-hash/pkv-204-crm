import { useApp } from '../../context/AppContext'
import { Card } from '../../components/ui'

export default function SalesProvision() {
  const { state } = useApp()
  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full min-w-[600px] text-left text-sm">
        <thead>
          <tr className="border-b border-ink-100 text-xs uppercase tracking-wide text-ink-400">
            <th className="px-4 py-3 font-medium">Produkt</th>
            <th className="px-4 py-3 font-medium">Abschlussart</th>
            <th className="px-4 py-3 font-medium">Provisionssatz</th>
            <th className="px-4 py-3 font-medium">Hinweis</th>
          </tr>
        </thead>
        <tbody>
          {state.salesProvision.map((row) => (
            <tr key={row.id} className="border-b border-ink-50 last:border-0">
              <td className="px-4 py-3 font-medium text-ink-800">{row.produkt}</td>
              <td className="px-4 py-3 text-ink-500">{row.abschlussart}</td>
              <td className="px-4 py-3 font-semibold text-brand-600">{row.satzProzent}%</td>
              <td className="px-4 py-3 text-ink-400">{row.hinweis}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}
