import { SectionHeader, NichtAngebundenSeite } from '../components/ui'

export default function Buchhaltung() {
  return (
    <div>
      <SectionHeader title="Buchhaltung" subtitle="Umsatz, Provisionen und Auszahlungen" />
      <NichtAngebundenSeite leerText="Noch keine Einträge." />
    </div>
  )
}
