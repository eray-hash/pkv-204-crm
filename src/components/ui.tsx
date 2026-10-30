import type { ReactNode } from 'react'
import { LEER_TEXT, NICHT_ANGEBUNDEN_TEXT } from '../lib/texte'
import { X, MoveHorizontal, Info, Loader2, AlertCircle } from 'lucide-react'

export function Card({
  children,
  className = '',
  onClick,
}: {
  children: ReactNode
  className?: string
  onClick?: () => void
}) {
  return (
    <div className={`rounded-2xl border border-ink-100 bg-white shadow-sm ${className}`} onClick={onClick}>
      {children}
    </div>
  )
}

export function SectionHeader({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-ink-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function KpiTile({
  label,
  value,
  hint,
  accent = 'brand',
}: {
  label: string
  value: string
  hint?: string
  accent?: 'brand' | 'red' | 'amber' | 'ink' | 'green'
}) {
  const accents: Record<string, string> = {
    brand: 'text-brand-600',
    red: 'text-red-600',
    amber: 'text-amber-600',
    ink: 'text-ink-700',
    green: 'text-emerald-600',
  }
  return (
    <Card className="p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-400">{label}</p>
      <p className={`mt-1.5 text-2xl font-semibold ${accents[accent]}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-400">{hint}</p>}
    </Card>
  )
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

export function Button({
  children,
  onClick,
  variant = 'primary',
  className = '',
  type = 'button',
  disabled,
  title,
}: {
  children: ReactNode
  onClick?: () => void
  variant?: ButtonVariant
  className?: string
  type?: 'button' | 'submit'
  disabled?: boolean
  title?: string
}) {
  const variants: Record<ButtonVariant, string> = {
    primary: 'bg-brand-600 text-white hover:bg-brand-700 shadow-sm',
    secondary: 'bg-white text-ink-700 border border-ink-200 hover:bg-ink-50',
    ghost: 'text-ink-600 hover:bg-ink-100',
    danger: 'bg-red-600 text-white hover:bg-red-700',
  }
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  )
}

export function Badge({
  children,
  tone = 'ink',
  className = '',
}: {
  children: ReactNode
  tone?: 'ink' | 'brand' | 'red' | 'amber' | 'green'
  className?: string
}) {
  const tones: Record<string, string> = {
    ink: 'bg-ink-100 text-ink-600',
    brand: 'bg-brand-100 text-brand-700',
    red: 'bg-red-100 text-red-700',
    amber: 'bg-amber-100 text-amber-700',
    green: 'bg-emerald-100 text-emerald-700',
  }
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[tone]} ${className}`}>{children}</span>
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  wide?: boolean
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-4" onClick={onClose}>
      <div
        className={`max-h-[90vh] w-full overflow-y-auto rounded-2xl bg-white p-6 shadow-xl ${wide ? 'max-w-2xl' : 'max-w-md'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink-900">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ink-500">{label}</span>
      {children}
    </label>
  )
}

export const inputClass =
  'w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-800 placeholder:text-ink-300 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100'

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: string; label: string }[]
  active: string
  onChange: (id: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-1 rounded-xl bg-ink-100 p-1">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors ${
            active === tab.id ? 'bg-white text-brand-700 shadow-sm' : 'text-ink-500 hover:text-ink-700'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

export function ScrollHint() {
  return (
    <div className="mb-1.5 flex items-center gap-1 text-xs text-ink-400 lg:hidden">
      <MoveHorizontal size={13} /> Tabelle nach links/rechts wischen zum Scrollen
    </div>
  )
}

export function EmptyState({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-ink-200 p-8 text-center text-sm text-ink-400">{text}</div>
}

/** Ruhiger Hinweis oben auf Seiten, für die es noch kein Backend gibt. */
export function NichtAngebunden({ text = NICHT_ANGEBUNDEN_TEXT }: { text?: string }) {
  return (
    <div role="note" className="mb-4 flex max-w-full items-start gap-2 rounded-lg border border-ink-100 bg-white px-3 py-2 text-sm text-ink-500">
      <Info size={15} className="mt-0.5 shrink-0 text-ink-400" />
      <span>{text}</span>
    </div>
  )
}

/** Seite ohne Backend: Hinweis plus ehrlicher Leer-Zustand. */
export function NichtAngebundenSeite({ leerText = LEER_TEXT }: { leerText?: string }) {
  return (
    <>
      <NichtAngebunden />
      <EmptyState text={leerText} />
    </>
  )
}

export function LoadingBlock({ text = 'Daten werden geladen …' }: { text?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 rounded-2xl border border-ink-100 bg-white p-10 text-sm text-ink-500 shadow-sm" role="status">
      <Loader2 size={18} className="animate-spin text-brand-500" />
      {text}
    </div>
  )
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-red-100 bg-red-50/60 p-8 text-center" role="alert">
      <AlertCircle size={24} className="text-red-500" />
      <p className="text-sm text-red-700">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="rounded-lg bg-white px-3.5 py-2 text-sm font-medium text-ink-700 shadow-sm ring-1 ring-ink-200 hover:bg-ink-50">
          Erneut versuchen
        </button>
      )}
    </div>
  )
}
