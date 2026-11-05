import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

/** Faengt unerwartete Darstellungsfehler ab und zeigt statt einer weissen Seite eine verstaendliche Meldung. */
export default class ErrorBoundary extends Component<Props, { fehler: boolean }> {
  state = { fehler: false }

  static getDerivedStateFromError() {
    return { fehler: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Nur technische Angaben in die Konsole, keine Anzeige von Details fuer Nutzer
    console.error('Unerwarteter Darstellungsfehler:', error.message, info.componentStack)
  }

  render() {
    if (!this.state.fehler) return this.props.children
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-50 px-4">
        <div className="w-full max-w-sm rounded-2xl border border-ink-100 bg-white p-6 text-center shadow-sm" role="alert">
          <h1 className="text-lg font-semibold text-ink-900">Etwas ist schiefgelaufen</h1>
          <p className="mt-2 text-sm text-ink-500">Die Seite konnte nicht angezeigt werden. Bitte laden Sie sie neu. Ihre Daten sind nicht verloren gegangen.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Neu laden
          </button>
        </div>
      </div>
    )
  }
}
