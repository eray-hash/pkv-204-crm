import { SectionHeader, NichtAngebundenSeite } from '../../components/ui'

export default function Reklamiert() {
  return (
    <div>
      <SectionHeader title="Reklamierte Leads" subtitle="Leads, die als Reklamation an den Lead-Lieferanten gemeldet wurden" />
      <NichtAngebundenSeite leerText="Noch keine reklamierten Leads." />
    </div>
  )
}
