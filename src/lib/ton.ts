// Kurzer Benachrichtigungston (WebAudio, ohne Datei). Browser blockieren Ton oft bis zur ersten Interaktion; Fehler werden ignoriert.
export function spieleBenachrichtigungston(): void {
  try {
    const Kontext = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Kontext) return
    const ctx = new Kontext()
    const gain = ctx.createGain()
    gain.connect(ctx.destination)
    gain.gain.setValueAtTime(0.0001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5)
    for (const [i, frequenz] of [880, 1175].entries()) {
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = frequenz
      osc.connect(gain)
      osc.start(ctx.currentTime + i * 0.18)
      osc.stop(ctx.currentTime + i * 0.18 + 0.2)
    }
    setTimeout(() => void ctx.close(), 900)
  } catch {
    // kein Ton moeglich
  }
}
