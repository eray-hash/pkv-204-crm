// Uebersetzt Fehlermeldungen von Supabase Auth in verstaendliches Deutsch.

interface AuthErrorLike {
  message?: string
  status?: number
  code?: string
  name?: string
}

export function mapAuthError(error: unknown): string {
  const e = (error && typeof error === 'object' ? error : {}) as AuthErrorLike
  const message = (e.message ?? '').toLowerCase()
  const code = (e.code ?? '').toLowerCase()

  if (code === 'invalid_credentials' || message.includes('invalid login credentials')) {
    return 'E-Mail oder Passwort ist falsch.'
  }
  if (code === 'email_not_confirmed' || message.includes('email not confirmed')) {
    return 'Die E-Mail-Adresse wurde noch nicht bestätigt. Bitte den Bestätigungslink in der E-Mail öffnen.'
  }
  if (code === 'user_banned' || message.includes('banned')) {
    return 'Dieses Konto ist gesperrt. Bitte beim Administrator melden.'
  }
  if (e.status === 429 || code.includes('rate_limit') || message.includes('rate limit') || message.includes('too many')) {
    return 'Zu viele Versuche. Bitte einen Moment warten und es dann erneut versuchen.'
  }
  if (code === 'weak_password' || message.includes('password should be at least')) {
    return 'Das Passwort ist zu schwach. Bitte mindestens 8 Zeichen verwenden.'
  }
  if (code === 'same_password' || message.includes('different from the old password')) {
    return 'Das neue Passwort muss sich vom bisherigen unterscheiden.'
  }
  if (message.includes('failed to fetch') || message.includes('networkerror') || message.includes('network request failed') || e.name === 'AuthRetryableFetchError') {
    return 'Keine Verbindung zum Server. Bitte die Internetverbindung prüfen und erneut versuchen.'
  }
  if (message.includes('invalid email') || code === 'validation_failed') {
    return 'Bitte eine gültige E-Mail-Adresse eingeben.'
  }
  return 'Die Anmeldung ist fehlgeschlagen. Bitte erneut versuchen.'
}
