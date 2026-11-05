import { useSyncExternalStore } from 'react'

/** Aktueller Zustand einer CSS-Medienabfrage (z. B. "(min-width: 1024px)"), aktualisiert sich bei Aenderungen. */
export function useMedia(abfrage: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const m = window.matchMedia(abfrage)
      m.addEventListener('change', onChange)
      return () => m.removeEventListener('change', onChange)
    },
    () => window.matchMedia(abfrage).matches,
    () => false,
  )
}
