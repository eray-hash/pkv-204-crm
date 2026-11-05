import { createContext, useContext } from 'react'

/** Aktuelle Zeit (vom JetztProvider alle 30 Sekunden aktualisiert) in einem eigenen Kontext, damit nur die Nutzer dieser Zeit neu rendern. */
export const JetztContext = createContext<Date>(new Date())

export function useJetzt(): Date {
  return useContext(JetztContext)
}
