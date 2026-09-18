import { HashRouter, Routes, Route } from 'react-router-dom'
import { AppProvider } from './context/AppContext'
import { ToastProvider } from './components/ToastContext'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import LeadsUebersicht from './pages/leads/LeadsUebersicht'
import Kunden from './pages/leads/Kunden'
import Verloren from './pages/leads/Verloren'
import Alte from './pages/leads/Alte'
import LeadDetail from './pages/leads/LeadDetail'
import PowerDialer from './pages/leads/PowerDialer'
import Wiedervorlagen from './pages/Wiedervorlagen'
import Kalender from './pages/Kalender'
import Nachrichten from './pages/Nachrichten'
import Buchhaltung from './pages/Buchhaltung'
import Hilfe from './pages/Hilfe'
import Profil from './pages/Profil'

export default function App() {
  return (
    <AppProvider>
      <ToastProvider>
        <HashRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/leads" element={<LeadsUebersicht />} />
              <Route path="/leads/kunden" element={<Kunden />} />
              <Route path="/leads/verloren" element={<Verloren />} />
              <Route path="/leads/alt" element={<Alte />} />
              <Route path="/leads/power-dialer" element={<PowerDialer />} />
              <Route path="/leads/:id" element={<LeadDetail />} />
              <Route path="/wiedervorlagen" element={<Wiedervorlagen />} />
              <Route path="/kalender" element={<Kalender />} />
              <Route path="/nachrichten" element={<Nachrichten />} />
              <Route path="/buchhaltung" element={<Buchhaltung />} />
              <Route path="/hilfe" element={<Hilfe />} />
              <Route path="/profil" element={<Profil />} />
            </Route>
          </Routes>
        </HashRouter>
      </ToastProvider>
    </AppProvider>
  )
}
