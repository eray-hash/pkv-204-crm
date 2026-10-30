import { Copy } from 'lucide-react'
import { kopiereInZwischenablage } from '../lib/zwischenablage'
import { useToast } from './ToastContext'

/** Kleiner Button "Nummer kopieren": damit kann man einen Lead auch ohne API manuell ueber die sipgate-App anrufen. */
export default function NummerKopieren({ nummer, className = '' }: { nummer: string; className?: string }) {
  const { showToast } = useToast()
  return (
    <button
      type="button"
      onClick={async () => {
        const ok = await kopiereInZwischenablage(nummer)
        showToast(ok ? 'Nummer kopiert' : 'Kopieren nicht möglich – bitte die Nummer manuell markieren', ok ? 'success' : 'info')
      }}
      title="Rufnummer in die Zwischenablage kopieren"
      className={`inline-flex items-center gap-1 rounded-md border border-ink-200 bg-white px-2 py-0.5 text-xs font-medium text-ink-600 hover:bg-ink-50 ${className}`}
    >
      <Copy size={12} /> Nummer kopieren
    </button>
  )
}
