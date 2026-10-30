import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppProvider } from './context/AppContext'
import { AuthProvider } from './context/AuthContext'
import { LeadsProvider } from './context/LeadsContext'
import { TeamProvider } from './context/TeamContext'
import AuthGate from './components/AuthGate'
import { ToastProvider } from './components/ToastContext'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import LeadsUebersicht from './pages/leads/LeadsUebersicht'
import Kunden from './pages/leads/Kunden'
import Verloren from './pages/leads/Verloren'
import Alte from './pages/leads/Alte'
import Reklamiert from './pages/leads/Reklamiert'
import LeadDetail from './pages/leads/LeadDetail'
import PowerDialer from './pages/leads/PowerDialer'
import Wiedervorlagen from './pages/Wiedervorlagen'
import Kalender from './pages/Kalender'
import Nachrichten from './pages/Nachrichten'
import Buchhaltung from './pages/Buchhaltung'
import Team from './pages/Team'
import Hilfe from './pages/Hilfe'
import Profil from './pages/Profil'

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <AppProvider>
          <HashRouter>
            <AuthGate>
              <TeamProvider>
              <LeadsProvider>
                <Routes>
                  <Route element={<Layout />}>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/leads" element={<LeadsUebersicht />} />
                    <Route path="/leads/kunden" element={<Kunden />} />
                    <Route path="/leads/verloren" element={<Verloren />} />
                    <Route path="/leads/alt" element={<Alte />} />
                    <Route path="/leads/reklamiert" element={<Reklamiert />} />
                    <Route path="/leads/power-dialer" element={<PowerDialer />} />
                    <Route path="/leads/:id" element={<LeadDetail />} />
                    <Route path="/wiedervorlagen" element={<Wiedervorlagen />} />
                    <Route path="/kalender" element={<Kalender />} />
                    <Route path="/nachrichten" element={<Nachrichten />} />
                    <Route path="/buchhaltung" element={<Buchhaltung />} />
                    <Route path="/team" element={<Team />} />
                    <Route path="/hilfe" element={<Hilfe />} />
                    <Route path="/profil" element={<Profil />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Route>
                </Routes>
              </LeadsProvider>
              </TeamProvider>
            </AuthGate>
          </HashRouter>
        </AppProvider>
      </AuthProvider>
    </ToastProvider>
  )
}
