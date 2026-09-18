import type { UmsatzPunkt } from '../types'
import { formatEuro } from '../lib/utils'

export default function SimpleBarChart({ data }: { data: UmsatzPunkt[] }) {
  const max = Math.max(...data.map((d) => d.umsatz), 1)
  const width = 640
  const height = 220
  const paddingLeft = 10
  const barGap = 18
  const barWidth = (width - paddingLeft * 2 - barGap * (data.length - 1)) / data.length

  return (
    <svg viewBox={`0 0 ${width} ${height + 30}`} className="w-full" role="img" aria-label="Umsatzverlauf">
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <line key={f} x1={0} x2={width} y1={height - height * f} y2={height - height * f} stroke="#e8eaed" strokeWidth={1} />
      ))}
      {data.map((d, i) => {
        const x = paddingLeft + i * (barWidth + barGap)
        const umsatzH = (d.umsatz / max) * (height - 10)
        const provH = (d.provision / max) * (height - 10)
        return (
          <g key={d.monat}>
            <rect x={x} y={height - umsatzH} width={barWidth * 0.55} height={umsatzH} rx={4} fill="#2b9880" />
            <rect x={x + barWidth * 0.55 + 4} y={height - provH} width={barWidth * 0.35} height={provH} rx={4} fill="#a5b4fc" />
            <text x={x + barWidth / 2} y={height + 18} textAnchor="middle" fontSize="11" fill="#788293">
              {d.monat.slice(0, 3)}
            </text>
            <title>
              {d.monat}: {formatEuro(d.umsatz)} Umsatz, {formatEuro(d.provision)} Provision
            </title>
          </g>
        )
      })}
    </svg>
  )
}
