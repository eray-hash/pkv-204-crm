import { useEffect, useRef, useState, type InputHTMLAttributes } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { buttonLabel, eingabeTyp, STANDARD_SICHTBAR, umschalten } from '../lib/passwortAnzeige'
import { inputClass } from './ui'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  /** Pflicht, damit Passwortmanager und iPhone-Schluesselbund das Feld richtig behandeln. */
  autoComplete: 'current-password' | 'new-password' | 'off'
}

/**
 * Passwortfeld mit Auge-Button. Standard: verborgen. Beim Absenden des Formulars und beim Verlassen der Seite
 * (Unmount) wird wieder verborgen. Der Button ist nicht in der Tab-Reihenfolge und am Handy gut tippbar (44 px).
 */
export default function PasswortFeld({ className = '', ...rest }: Props) {
  const [sichtbar, setSichtbar] = useState(STANDARD_SICHTBAR)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const form = ref.current?.form
    if (!form) return
    const verbergen = () => setSichtbar(false)
    form.addEventListener('submit', verbergen)
    return () => form.removeEventListener('submit', verbergen)
  }, [])

  return (
    <div className="relative">
      <input ref={ref} {...rest} type={eingabeTyp(sichtbar)} className={`${inputClass} pr-12 ${className}`} spellCheck={false} autoCapitalize="none" autoCorrect="off" />
      <button
        type="button"
        tabIndex={-1}
        aria-label={buttonLabel(sichtbar)}
        aria-pressed={sichtbar}
        title={buttonLabel(sichtbar)}
        // Fokus im Eingabefeld behalten (Tastatur bleibt am Handy offen)
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setSichtbar((v) => umschalten(v))}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-ink-400 hover:text-ink-700"
      >
        {sichtbar ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  )
}
