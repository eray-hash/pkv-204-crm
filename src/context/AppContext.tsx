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
  Aktivitaet,
  Wiedervorlage,
  LeadStatus,
  Blockzeit,
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
  buildOnboardingVideos,
  buildProfil,
} from '../data/seed'
import { uid, isoDaysAgo } from '../lib/utils'

export interface AppData {
  leads: Lead[]
  termine: Termin[]
  nachrichten: Nachricht[]
  auszahlungen: Auszahlung[]
  umsatzverlauf: UmsatzPunkt[]
  salesProvision: SalesProvisionZeile[]
  teamProvision: TeamProvisionZeile[]
  benachrichtigungen: Benachrichtigung[]
  teammitglieder: Teammitglied[]
  onboardingVideos: OnboardingVideo[]
  profil: Profil
  sprache: 'de' | 'en'
}

const STORAGE_KEY = 'pkv-204-crm-data-v1'

function buildSeed(): AppData {
  const leads = buildLeads()
  return {
    leads,
    termine: buildTermine(leads),
    nachrichten: buildNachrichten(),
    auszahlungen: buildAuszahlungen(),
    umsatzverlauf: buildUmsatzverlauf(),
    salesProvision: buildSalesProvision(),
    teamProvision: buildTeamProvision(),
    benachrichtigungen: buildBenachrichtigungen(),
    teammitglieder: buildTeammitglieder(),
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
      if (parsed && Array.isArray(parsed.leads)) {
        return parsed
      }
    }
  } catch {
    // ignore, fall back to seed
  }
  return buildSeed()
}

type Action =
  | { type: 'ADD_LEAD'; lead: Lead }
  | { type: 'UPDATE_LEAD'; id: string; patch: Partial<Lead> }
  | { type: 'SET_LEAD_STATUS'; id: string; status: LeadStatus }
  | { type: 'ADD_AKTIVITAET'; leadId: string; aktivitaet: Aktivitaet }
  | { type: 'SET_WIEDERVORLAGE'; leadId: string; wiedervorlage: Wiedervorlage | undefined }
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
  | { type: 'RESET' }

function reducer(state: AppData, action: Action): AppData {
  switch (action.type) {
    case 'ADD_LEAD':
      return { ...state, leads: [action.lead, ...state.leads] }
    case 'UPDATE_LEAD':
      return { ...state, leads: state.leads.map((l) => (l.id === action.id ? { ...l, ...action.patch } : l)) }
    case 'SET_LEAD_STATUS':
      return {
        ...state,
        leads: state.leads.map((l) =>
          l.id === action.id
            ? {
                ...l,
                status: action.status,
                liste: action.status === 'Gewonnen' ? 'kunde' : action.status === 'Verloren' ? 'verloren' : l.liste,
                aktivitaeten: [
                  { id: uid('akt'), datum: isoDaysAgo(0), typ: 'status', text: `Status geändert zu „${action.status}“` },
                  ...l.aktivitaeten,
                ],
              }
            : l,
        ),
      }
    case 'ADD_AKTIVITAET':
      return {
        ...state,
        leads: state.leads.map((l) => (l.id === action.leadId ? { ...l, aktivitaeten: [action.aktivitaet, ...l.aktivitaeten] } : l)),
      }
    case 'SET_WIEDERVORLAGE':
      return {
        ...state,
        leads: state.leads.map((l) => (l.id === action.leadId ? { ...l, wiedervorlage: action.wiedervorlage } : l)),
      }
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
