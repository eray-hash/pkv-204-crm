import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { CheckCircle2, Info, X } from 'lucide-react'

interface Toast {
  id: string
  text: string
  tone: 'success' | 'info'
}

interface ToastContextValue {
  showToast: (text: string, tone?: Toast['tone']) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const showToast = useCallback((text: string, tone: Toast['tone'] = 'success') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    setToasts((prev) => [...prev, { id, text, tone }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 3500)
  }, [])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="pointer-events-none fixed bottom-5 right-5 z-[100] flex flex-col gap-2" role="status" aria-live="polite" aria-atomic="false">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto flex items-center gap-2 rounded-xl border border-ink-100 bg-white px-4 py-3 text-sm text-ink-700 shadow-lg"
          >
            {t.tone === 'success' ? <CheckCircle2 size={18} className="text-brand-500" aria-hidden="true" /> : <Info size={18} className="text-brand-500" aria-hidden="true" />}
            <span>{t.text}</span>
            <button
              type="button"
              aria-label="Hinweis schließen"
              onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
              className="ml-1 text-ink-300 hover:text-ink-500"
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast muss innerhalb von ToastProvider verwendet werden')
  return ctx
}
