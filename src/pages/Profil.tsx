import { useState } from 'react'
import { SectionHeader, Tabs } from '../components/ui'
import Profildaten from './profil/Profildaten'
import KalenderEinstellungen from './profil/KalenderEinstellungen'
import SalesProvision from './profil/SalesProvision'
import TeamProvision from './profil/TeamProvision'
import Telefonie from './profil/Telefonie'
import Erreichbarkeit from './profil/Erreichbarkeit'

type Tab = 'profildaten' | 'erreichbarkeit' | 'telefonie' | 'kalender' | 'sales' | 'team'

export default function Profil() {
  const [tab, setTab] = useState<Tab>('profildaten')

  return (
    <div>
      <SectionHeader title="Mein Profil" subtitle="Konto, Erreichbarkeit und Telefonie" />

      <div className="mb-5">
        <Tabs
          tabs={[
            { id: 'profildaten', label: 'Profildaten' },
            { id: 'erreichbarkeit', label: 'Erreichbarkeit' },
            { id: 'telefonie', label: 'Telefonie' },
            { id: 'kalender', label: 'Kalender-Einstellungen' },
            { id: 'sales', label: 'Sales-Provision' },
            { id: 'team', label: 'Team-Provision' },
          ]}
          active={tab}
          onChange={(id) => setTab(id as Tab)}
        />
      </div>

      {tab === 'profildaten' && <Profildaten />}
      {tab === 'erreichbarkeit' && <Erreichbarkeit />}
      {tab === 'telefonie' && <Telefonie />}
      {tab === 'kalender' && <KalenderEinstellungen />}
      {tab === 'sales' && <SalesProvision />}
      {tab === 'team' && <TeamProvision />}
    </div>
  )
}
