import { useEffect, useRef, useState, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  CalendarClock,
  CalendarDays,
  Mail,
  Wallet,
  LifeBuoy,
  UserCircle,
  Bell,
  Phone,
  ChevronDown,
  Megaphone,
  RotateCcw,
  BarChart3,
  Menu,
  X as XIcon,
  LogOut,
} from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { useLeads } from '../context/LeadsContext'
import { NEWS_TICKER } from '../data/seed'
import { formatDateTime } from '../lib/utils'
import { useToast } from './ToastContext'
import { LiveSwitch, PraesenzListe, PraesenzMenu } from './Praesenz'

const leadSubLinks = [
  { to: '/leads', label: 'Alle Leads', end: true },
  { to: '/leads/kunden', label: 'Kundenbereich' },
  { to: '/leads/verloren', label: 'Verlorene Leads' },
  { to: '/leads/alt', label: 'Alte Leads' },
  { to: '/leads/reklamiert', label: 'Reklamierte Leads' },
  { to: '/leads/power-dialer', label: 'Power Dialer' },
]

export default function Layout() {
  const { state, dispatch } = useApp()
  const { profile, signOut } = useAuth()
  const { leads, queue, loading: leadsLoading } = useLeads()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const [leadsOpen, setLeadsOpen] = useState(true)
  const [notifOpen, setNotifOpen] = useState(false)
  const [tickerIndex, setTickerIndex] = useState(0)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const notifRef = useRef<HTMLDivElement>(null)
  const userMenuRef = useRef<HTMLDivElement>(null)
  const istGeschaeftsfuehrer = profile?.rolle === 'geschaeftsfuehrer'
  const anzeigeName = profile?.name ?? ''

  const unreadMessages = state.nachrichten.filter((m) => !m.gelesen).length
  const unreadNotifs = state.benachrichtigungen.filter((n) => !n.gelesen).length

  useEffect(() => {
    const interval = setInterval(() => {
      setTickerIndex((i) => (i + 1) % NEWS_TICKER.length)
    }, 6000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false)
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setUserMenuOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  useEffect(() => {
    setMobileNavOpen(false)
    setUserMenuOpen(false)
  }, [location.pathname])

  function handleReset() {
    if (confirm('Die Beispieldaten (Kalender, Buchhaltung, Nachrichten usw.) wirklich zurücksetzen? Echte Leads aus der Datenbank sind davon nicht betroffen.')) {
      dispatch({ type: 'RESET' })
      showToast('Beispieldaten wurden auf den Ausgangszustand zurückgesetzt')
    }
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-ink-50">
      {/* Backdrop (mobile drawer) */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-30 bg-ink-900/40 lg:hidden" onClick={() => setMobileNavOpen(false)} aria-hidden="true" />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 max-w-[85vw] shrink-0 flex-col border-r border-ink-100 bg-white transition-transform duration-200 ease-out lg:static lg:z-auto lg:w-64 lg:max-w-none lg:translate-x-0 ${
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center gap-2 border-b border-ink-100 px-5 py-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-sm font-bold text-white">§204</div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink-900 leading-tight">PKV Tarifoptimierung</p>
            <p className="text-xs text-ink-400 leading-tight">Lead-Management CRM</p>
          </div>
          <button
            onClick={() => setMobileNavOpen(false)}
            className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700 lg:hidden"
            aria-label="Menü schließen"
          >
            <XIcon size={18} />
          </button>
        </div>

        <div className="border-b border-ink-100 p-3 lg:hidden">
          <p className="mb-2 px-1 text-xs font-medium uppercase tracking-wide text-ink-400">Einstellungen</p>
          <div className="flex flex-wrap items-center gap-2">
            <LiveSwitch langesLabel />
            <LanguageSwitch />
          </div>
          <p className="mb-1 mt-4 px-1 text-xs font-medium uppercase tracking-wide text-ink-400">Team</p>
          <PraesenzListe />
        </div>

        <nav onClick={(e) => (e.target as HTMLElement).closest('a') && setMobileNavOpen(false)} className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4 text-sm">
          <NavItem to="/" icon={<LayoutDashboard size={18} />} label="Dashboard" end />

          <div>
            <button
              onClick={() => setLeadsOpen((v) => !v)}
              className="flex w-full items-center justify-between rounded-lg px-3 py-2 font-medium text-ink-600 hover:bg-ink-50"
            >
              <span className="flex items-center gap-2.5">
                <Users size={18} />
                Leads
              </span>
              <span className="flex items-center gap-1.5">
                <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-700">{leadsLoading && leads.length === 0 ? '…' : leads.length}</span>
                <ChevronDown size={16} className={`transition-transform ${leadsOpen ? 'rotate-180' : ''}`} />
              </span>
            </button>
            {leadsOpen && (
              <div className="ml-4 mt-0.5 space-y-0.5 border-l border-ink-100 pl-3">
                {leadSubLinks.map((l) => (
                  <NavLink
                    key={l.to}
                    to={l.to}
                    end={l.end}
                    className={({ isActive }) =>
                      `block rounded-lg px-3 py-1.5 ${isActive ? 'bg-brand-50 font-medium text-brand-700' : 'text-ink-500 hover:bg-ink-50'}`
                    }
                  >
                    {l.label}
                  </NavLink>
                ))}
              </div>
            )}
          </div>

          <NavItem to="/wiedervorlagen" icon={<CalendarClock size={18} />} label="Wiedervorlagen" />
          <NavItem to="/kalender" icon={<CalendarDays size={18} />} label="Kalender" />
          <NavItem to="/nachrichten" icon={<Mail size={18} />} label="Nachrichten" />
          <NavItem to="/buchhaltung" icon={<Wallet size={18} />} label="Buchhaltung" />
          {istGeschaeftsfuehrer && <NavItem to="/team" icon={<BarChart3 size={18} />} label="Team" />}
          <NavItem to="/hilfe" icon={<LifeBuoy size={18} />} label="Hilfe / Onboarding" />
          <NavItem to="/profil" icon={<UserCircle size={18} />} label="Mein Profil" />
        </nav>

        <div className="border-t border-ink-100 p-3">
          <button
            onClick={handleReset}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-ink-500 hover:bg-ink-50"
          >
            <RotateCcw size={16} />
            Beispieldaten zurücksetzen
          </button>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-ink-100 bg-white px-3 lg:h-16 lg:gap-4 lg:px-6">
          <button
            onClick={() => setMobileNavOpen(true)}
            className="shrink-0 rounded-lg p-2 text-ink-500 hover:bg-ink-100 lg:hidden"
            aria-label="Menü öffnen"
          >
            <Menu size={20} />
          </button>

          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden rounded-lg bg-ink-50 px-3 py-1.5 text-sm text-ink-500">
            <Megaphone size={16} className="shrink-0 text-brand-500" />
            <span key={tickerIndex} className="truncate">
              {NEWS_TICKER[tickerIndex]}
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-1 lg:gap-1.5">
            <div className="hidden items-center gap-1.5 lg:flex">
              <LiveSwitch />
              <PraesenzMenu />
              <LanguageSwitch />
            </div>

            <button
              onClick={() => navigate('/leads/power-dialer')}
              title={`Power Dialer öffnen (${queue.length} anrufbar)`}
              className="relative rounded-lg p-2 text-ink-500 hover:bg-ink-100"
            >
              <Phone size={19} />
              {queue.length > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white">
                  {queue.length}
                </span>
              )}
            </button>

            <button onClick={() => navigate('/nachrichten')} title="Postfach" className="relative rounded-lg p-2 text-ink-500 hover:bg-ink-100">
              <Mail size={19} />
              {unreadMessages > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                  {unreadMessages}
                </span>
              )}
            </button>

            <div className="relative" ref={notifRef}>
              <button
                onClick={() => setNotifOpen((v) => !v)}
                title="Benachrichtigungen"
                className="relative rounded-lg p-2 text-ink-500 hover:bg-ink-100"
              >
                <Bell size={19} />
                {unreadNotifs > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                    {unreadNotifs}
                  </span>
                )}
              </button>
              {notifOpen && (
                <div className="absolute right-0 z-40 mt-2 w-[85vw] max-w-xs rounded-xl border border-ink-100 bg-white p-2 shadow-lg">
                  <div className="flex items-center justify-between px-2 py-1">
                    <p className="text-sm font-semibold text-ink-800">
                      Benachrichtigungen <span className="text-xs font-normal text-amber-600">(Beispieldaten)</span>
                    </p>
                    <button
                      onClick={() => dispatch({ type: 'MARK_ALL_NOTIFICATIONS_READ' })}
                      className="text-xs font-medium text-brand-600 hover:underline"
                    >
                      Alle als gelesen markieren
                    </button>
                  </div>
                  <div className="mt-1 max-h-80 overflow-y-auto">
                    {state.benachrichtigungen.length === 0 && <p className="p-3 text-sm text-ink-400">Keine Benachrichtigungen</p>}
                    {[...state.benachrichtigungen]
                      .sort((a, b) => new Date(b.datum).getTime() - new Date(a.datum).getTime())
                      .map((n) => (
                        <button
                          key={n.id}
                          onClick={() => dispatch({ type: 'MARK_NOTIFICATION_READ', id: n.id })}
                          className={`block w-full rounded-lg px-2 py-2 text-left text-sm hover:bg-ink-50 ${!n.gelesen ? 'bg-brand-50/60' : ''}`}
                        >
                          <span className="flex items-start gap-2">
                            {!n.gelesen && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />}
                            <span>
                              <span className="block text-ink-700">{n.text}</span>
                              <span className="text-xs text-ink-400">{formatDateTime(n.datum)}</span>
                            </span>
                          </span>
                        </button>
                      ))}
                  </div>
                </div>
              )}
            </div>

            <div className="relative ml-2 border-l border-ink-100 pl-3" ref={userMenuRef}>
              <button
                onClick={() => setUserMenuOpen((v) => !v)}
                className="flex items-center gap-2 rounded-lg p-1 hover:bg-ink-50"
                aria-haspopup="menu"
                aria-expanded={userMenuOpen}
                aria-label="Profilmenü"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-ink-800 text-xs font-semibold text-white">{initials(anzeigeName)}</div>
                <div className="hidden text-left sm:block">
                  <p className="text-sm font-medium leading-tight text-ink-800">{anzeigeName}</p>
                  <p className="text-xs leading-tight text-ink-400">{istGeschaeftsfuehrer ? 'Geschäftsführer' : 'Mitarbeiter'}</p>
                </div>
                <ChevronDown size={14} className="hidden text-ink-400 sm:block" />
              </button>
              {userMenuOpen && (
                <div role="menu" className="absolute right-0 z-40 mt-2 w-60 rounded-xl border border-ink-100 bg-white p-1.5 shadow-lg">
                  <div className="px-3 py-2">
                    <p className="truncate text-sm font-semibold text-ink-800">{anzeigeName}</p>
                    <p className="text-xs text-ink-400">{istGeschaeftsfuehrer ? 'Geschäftsführer' : 'Mitarbeiter'}</p>
                  </div>
                  <button
                    role="menuitem"
                    onClick={() => navigate('/profil')}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-ink-700 hover:bg-ink-50"
                  >
                    <UserCircle size={16} /> Mein Profil
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => void signOut()}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                  >
                    <LogOut size={16} /> Abmelden
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-x-hidden overflow-y-auto px-4 py-4 lg:px-6 lg:py-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

function initials(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

function NavItem({ to, icon, label, end }: { to: string; icon: ReactNode; label: string; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex items-center gap-2.5 rounded-lg px-3 py-2 font-medium ${isActive ? 'bg-brand-50 text-brand-700' : 'text-ink-600 hover:bg-ink-50'}`
      }
    >
      {icon}
      {label}
    </NavLink>
  )
}

function LanguageSwitch() {
  const { state, dispatch } = useApp()
  return (
    <div className="flex items-center overflow-hidden rounded-lg border border-ink-200 text-xs font-semibold">
      <button
        onClick={() => dispatch({ type: 'SET_SPRACHE', sprache: 'de' })}
        className={`px-2 py-1.5 ${state.sprache === 'de' ? 'bg-brand-600 text-white' : 'bg-white text-ink-500 hover:bg-ink-50'}`}
      >
        DE
      </button>
      <button
        onClick={() => dispatch({ type: 'SET_SPRACHE', sprache: 'en' })}
        className={`px-2 py-1.5 ${state.sprache === 'en' ? 'bg-brand-600 text-white' : 'bg-white text-ink-500 hover:bg-ink-50'}`}
      >
        EN
      </button>
    </div>
  )
}
