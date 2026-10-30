// Schutz gegen Rueckfall: im Quellcode (ohne Tests) duerfen keine Beispieldaten mehr stehen,
// und Bereiche ohne Backend muessen den ruhigen Hinweis plus Leer-Zustand zeigen.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { LEER_TEXT, NICHT_ANGEBUNDEN_TEXT } from './texte.ts'

const SRC = join(import.meta.dirname, '..')

function dateien(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? dateien(p) : [p]
  })
}
const quellen = dateien(SRC).filter((p) => /\.(ts|tsx)$/.test(p) && !/\.test\.ts$/.test(p))

test('Texte: Hinweis und Leer-Zustand sind wie vereinbart formuliert', () => {
  assert.equal(NICHT_ANGEBUNDEN_TEXT, 'Dieser Bereich ist noch nicht angebunden.')
  assert.equal(LEER_TEXT, 'Noch keine Einträge.')
})

test('Beispieldaten: seed, AppContext und erfundene Namen sind aus dem Quellcode verschwunden', () => {
  assert.ok(!existsSync(join(SRC, 'data', 'seed.ts')))
  assert.ok(!existsSync(join(SRC, 'context', 'AppContext.tsx')))
  const verboten = /Julia Fischer|Andreas Wolf|Sandra Becker|Frank Zimmermann|Sabine Kr(ue|ü)ger|Jan Meier|Markus Hofmann|Carsten Kessler|Allianz|\bDKV\b|Debeka|NEWS_TICKER|Beispieldaten zur(ü|ue)cksetzen/
  for (const p of quellen) {
    const text = readFileSync(p, 'utf8')
    // altbestand.ts nennt die alten Speicher-Schluessel bewusst
    const bereinigt = p.endsWith('altbestand.ts') ? text.replace(/pkv-204-crm-[a-z0-9-]+/g, '') : text
    assert.ok(!verboten.test(bereinigt), `Beispieldaten in ${p}`)
    assert.ok(!/ExampleNotice/.test(text), `ExampleNotice in ${p}`)
  }
})

test('Bereiche ohne Backend zeigen Hinweis und Leer-Zustand statt Beispieldaten', () => {
  const seiten = [
    'pages/Kalender.tsx',
    'pages/Buchhaltung.tsx',
    'pages/Nachrichten.tsx',
    'pages/Hilfe.tsx',
    'pages/leads/Reklamiert.tsx',
    'pages/profil/KalenderEinstellungen.tsx',
    'pages/profil/SalesProvision.tsx',
    'pages/profil/TeamProvision.tsx',
  ]
  for (const s of seiten) {
    const text = readFileSync(join(SRC, s), 'utf8')
    assert.match(text, /NichtAngebundenSeite/, s)
    assert.doesNotMatch(text, /useApp|dispatch|state\./, s)
  }
})
