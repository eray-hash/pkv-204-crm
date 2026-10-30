import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { raeumeAltbestandAuf } from './lib/altbestand'

// Einmalig beim Start: gespeicherte Beispieldaten der frueheren Version aus dem Browser entfernen.
try {
  raeumeAltbestandAuf(window.localStorage)
} catch {
  // localStorage nicht verfuegbar
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
