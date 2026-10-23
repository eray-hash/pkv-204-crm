import { createContext, useContext, useEffect, useMemo, useReducer, type Dispatch, type ReactNode } from 'react'
import type {
  Lead,
  Termin,
  Nachricht,
  Auszahlung,
  UmsatzPunkt,
  SalesProvisionZeile,
  TeamProvisionZeile,
  Benachrichtigung,
  Teammitglied,
  OnboardingVideo,
  Profil,
  Blockzeit,
  TeamPerformance,
  ReklamationStatus,
} from '../types'
import {
  buildLeads,
  buildTermine,
  buildNachrichten,
  buildAuszahlungen,
  buildUmsatzverlauf,
  buildSalesProvision,
  buildTeamProvision,
  buildBenachrichtigungen,
  buildTeammitglieder,
  buildTeamPerformance,
  buildOnboardingVideos,
  buildProfil,
} from '../data/seed'
import { uid, isoDaysAgo } from '../lib/utils'

/** Beispieldaten des Mockups. Echte Leads kommen aus der Datenbank (siehe LeadsContext). */
export interface AppData {
  /** Beispiel-Leads, nur noch fuer Wiedervorlagen und Reklamationen (Beispieldaten) */
  beispielLeads: Lead[]
  termine: Termin[]
  nachrichten: Nachricht[]
  auszahlungen: Auszahlung[]
  umsatzverlauf: UmsatzPunkt[]
  salesProvision: SalesProvisionZeile[]
  teamProvision: TeamProvisionZeile[]
  benachrichtigungen: Benachrichtigung[]
  teammitglieder: Teammitglied[]
  teamPerformance: TeamPerformance[]
  onboardingVideos: OnboardingVideo[]
  profil: Profil
  sprache: 'de' | 'en'
}

const STORAGE_KEY = 'pkv-204-crm-beispieldaten-v3'

function buildSeed(): AppData {
  const beispielLeads = buildLeads()
  const teammitglieder = buildTeammitglieder()
  return {
    beispielLeads,
    termine: buildTermine(beispielLeads),
    nachrichten: buildNachrichten(),
    auszahlungen: buildAuszahlungen(),
    umsatzverlauf: buildUmsatzverlauf(),
    salesProvision: buildSalesProvision(),
    teamProvision: buildTeamProvision(),
    benachrichtigungen: buildBenachrichtigungen(),
    teammitglieder,
    teamPerformance: buildTeamPerformance(teammitglieder),
    onboardingVideos: buildOnboardingVideos(),
    profil: buildProfil(),
    sprache: 'de',
  }
}

function loadInitial(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as AppData
      if (parsed && Array.isArray(parsed.beispielLeads) && Array.isArray(parsed.teamPerformance)) {
        return parsed
      }
    }
  } catch {
    // ignore, fall back to seed
  }
  return buildSeed()
}

type Action =
  | { type: 'ADD_TERMIN'; termin: Termin }
  | { type: 'MARK_MESSAGE_READ'; id: string }
  | { type: 'REQUEST_PAYOUT'; betrag: number }
  | { type: 'UPDATE_PROFIL'; patch: Partial<Profil> }
  | { type: 'ADD_BLOCKZEIT'; blockzeit: Blockzeit }
  | { type: 'REMOVE_BLOCKZEIT'; id: string }
  | { type: 'SET_SPRACHE'; sprache: 'de' | 'en' }
  | { type: 'MARK_NOTIFICATION_READ'; id: string }
  | { type: 'MARK_ALL_NOTIFICATIONS_READ' }
  | { type: 'TOGGLE_TEAM_KALENDER'; id: string }
  | { type: 'SET_REKLAMATION_STATUS'; id: string; status: ReklamationStatus }
  | { type: 'RESET' }

function reducer(state: AppData, action: Action): AppData {
  switch (action.type) {
    case 'ADD_TERMIN':
      return { ...state, termine: [...state.termine, action.termin] }
    case 'MARK_MESSAGE_READ':
      return { ...state, nachrichten: state.nachrichten.map((m) => (m.id === action.id ? { ...m, gelesen: true } : m)) }
    case 'REQUEST_PAYOUT':
      return {
        ...state,
        auszahlungen: [{ id: uid('pay'), datum: isoDaysAgo(0), betrag: action.betrag, status: 'angefordert' }, ...state.auszahlungen],
      }
    case 'UPDATE_PROFIL':
      return { ...state, profil: { ...state.profil, ...action.patch } }
    case 'ADD_BLOCKZEIT':
      return { ...state, profil: { ...state.profil, blockzeiten: [...state.profil.blockzeiten, action.blockzeit] } }
    case 'REMOVE_BLOCKZEIT':
      return { ...state, profil: { ...state.profil, blockzeiten: state.profil.blockzeiten.filter((b) => b.id !== action.id) } }
    case 'SET_SPRACHE':
      return { ...state, sprache: action.sprache }
    case 'MARK_NOTIFICATION_READ':
      return { ...state, benachrichtigungen: state.benachrichtigungen.map((n) => (n.id === action.id ? { ...n, gelesen: true } : n)) }
    case 'MARK_ALL_NOTIFICATIONS_READ':
      return { ...state, benachrichtigungen: state.benachrichtigungen.map((n) => ({ ...n, gelesen: true })) }
    case 'TOGGLE_TEAM_KALENDER':
      return {
        ...state,
        teammitglieder: state.teammitglieder.map((t) => (t.id === action.id ? { ...t, darfKalenderSehen: !t.darfKalenderSehen } : t)),
      }
    case 'SET_REKLAMATION_STATUS':
      return {
        ...state,
        beispielLeads: state.beispielLeads.map((l) =>
          l.id === action.id && l.reklamation ? { ...l, reklamation: { ...l.reklamation, status: action.status } } : l,
        ),
      }
    case 'RESET':
      return buildSeed()
    default:
      return state
  }
}

interface AppContextValue {
  state: AppData
  dispatch: Dispatch<Action>
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadInitial)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      // storage kann in seltenen Fällen (z.B. privater Modus) fehlschlagen – Mockup läuft trotzdem weiter
    }
  }, [state])

  const value = useMemo(() => ({ state, dispatch }), [state])

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp muss innerhalb von AppProvider verwendet werden')
  return ctx
}
