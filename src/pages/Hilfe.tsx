import { SectionHeader, NichtAngebundenSeite } from '../components/ui'

export default function Hilfe() {
  return (
    <div>
      <SectionHeader title="Hilfe / Onboarding" subtitle="Schulungsvideos und Materialien" />
      <NichtAngebundenSeite leerText="Noch keine Schulungsvideos." />
    </div>
  )
}
