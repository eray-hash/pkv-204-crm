import { SectionHeader, NichtAngebundenSeite } from '../components/ui'

export default function Kalender() {
  return (
    <div>
      <SectionHeader title="Kalender" subtitle="Termine und Verfügbarkeiten" />
      <NichtAngebundenSeite leerText="Noch keine Termine." />
    </div>
  )
}
