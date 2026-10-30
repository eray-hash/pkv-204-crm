// Text in die Zwischenablage kopieren (mit Rueckfall fuer Browser/Kontexte ohne Clipboard-API).
export async function kopiereInZwischenablage(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // weiter mit dem Rueckfall
  }
  try {
    const feld = document.createElement('textarea')
    feld.value = text
    feld.setAttribute('readonly', '')
    feld.style.position = 'fixed'
    feld.style.opacity = '0'
    document.body.appendChild(feld)
    feld.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(feld)
    return ok
  } catch {
    return false
  }
}
