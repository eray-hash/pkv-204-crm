import { useEffect, useState, type ReactNode } from 'react'
import { JetztContext } from '../lib/jetzt'

/** Liefert die aktuelle Zeit (alle 30 Sekunden). Die Kinder werden dadurch nicht neu gerendert, nur die Nutzer von useJetzt. */
export default function JetztProvider({ children }: { children: ReactNode }) {
  const [jetzt, setJetzt] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setJetzt(new Date()), 30_000)
    return () => clearInterval(t)
  }, [])
  return <JetztContext.Provider value={jetzt}>{children}</JetztContext.Provider>
}
