import { useAuth } from '../../context/AuthContext'
import { Card } from '../../components/ui'
import PasswortAendern from './PasswortAendern'

function Zeile({ label, wert }: { label: string; wert: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs font-medium text-ink-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-ink-800">{wert || '–'}</dd>
    </div>
  )
}

/** Zeigt die echten Kontodaten (Tabelle profiles und Anmeldung). Bearbeiten ist noch nicht angebunden. */
export default function Profildaten() {
  const { profile, session } = useAuth()
  return (
    <>
    <Card className="p-5">
      <h2 className="mb-4 font-semibold text-ink-800">Kontaktdaten</h2>
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Zeile label="Name" wert={profile?.name} />
        <Zeile label="Rolle" wert={profile ? (profile.rolle === 'geschaeftsfuehrer' ? 'Geschäftsführer' : 'Mitarbeiter') : null} />
        <Zeile label="E-Mail-Adresse" wert={session?.user.email} />
        <Zeile label="Telefon (Festnetz)" wert={profile?.telefon_festnetz} />
        <Zeile label="Telefon (Mobil)" wert={profile?.telefon_mobil} />
      </dl>
      <p className="mt-4 text-xs text-ink-400">
        Diese Angaben stammen aus Ihrem Konto. Das Bearbeiten ist noch nicht angebunden.
      </p>
    </Card>
    <PasswortAendern />
    </>
  )
}
