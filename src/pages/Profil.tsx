import { useState } from 'react'
import { SectionHeader, Tabs } from '../components/ui'
import Profildaten from './profil/Profildaten'
import KalenderEinstellungen from './profil/KalenderEinstellungen'
import SalesProvision from './profil/SalesProvision'
import TeamProvision from './profil/TeamProvision'

type Tab = 'profildaten' | 'kalender' | 'sales' | 'team'

export default function Profil() {
  const [tab, setTab] = useState<Tab>('profildaten')

  return (
    <div>
      <SectionHeader title="Mein Profil" subtitle="Profildaten, Kalendereinstellungen und Provisionsübersichten" />

      <div className="mb-5">
        <Tabs
          tabs={[
            { id: 'profildaten', label: 'Profildaten' },
            { id: 'kalender', label: 'Kalender-Einstellungen' },
            { id: 'sales', label: 'Sales-Provision' },
            { id: 'team', label: 'Team-Provision' },
          ]}
          active={tab}
          onChange={(id) => setTab(id as Tab)}
        />
      </div>

      {tab === 'profildaten' && <Profildaten />}
      {tab === 'kalender' && <KalenderEinstellungen />}
      {tab === 'sales' && <SalesProvision />}
      {tab === 'team' && <TeamProvision />}
    </div>
  )
}
