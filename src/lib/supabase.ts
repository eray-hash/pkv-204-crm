import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

export const supabaseKonfiguriert = Boolean(url && key)

// Es wird ausschliesslich der oeffentliche (publishable) Schluessel verwendet.
// Der Zugriffsschutz laeuft ueber Row Level Security in der Datenbank.
export const supabase = createClient(url || 'https://nicht-konfiguriert.invalid', key || 'nicht-konfiguriert', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})
