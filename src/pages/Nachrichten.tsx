import { SectionHeader, NichtAngebundenSeite } from '../components/ui'

export default function Nachrichten() {
  return (
    <div>
      <SectionHeader title="Nachrichten" subtitle="Postfach für die Kommunikation mit Leads und Kunden" />
      <NichtAngebundenSeite leerText="Noch keine Nachrichten." />
    </div>
  )
}
