import type { ZeitraumFilter } from '../types'

export function uid(prefix = 'id'): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}-${Date.now().toString(36).slice(-4)}`
}

export function formatEuro(value: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value)
}

export function formatDate(iso: string): string {
  const d = new Date(iso)
  return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d)
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d)
}

export function formatTime(iso: string): string {
  const d = new Date(iso)
  return new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' }).format(d)
}

export function isoDaysAgo(days: number, hour = 9, minute = 0): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  d.setHours(hour, minute, 0, 0)
  return d.toISOString()
}

export function isoDaysFromNow(days: number, hour = 9, minute = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  d.setHours(hour, minute, 0, 0)
  return d.toISOString()
}

export function startOfDay(d: Date): Date {
  const c = new Date(d)
  c.setHours(0, 0, 0, 0)
  return c
}

export function endOfDay(d: Date): Date {
  const c = new Date(d)
  c.setHours(23, 59, 59, 999)
  return c
}

export function zeitraumToRange(filter: ZeitraumFilter, custom?: { start: string; end: string }): { start: Date; end: Date } | null {
  const now = new Date()
  switch (filter) {
    case 'heute':
      return { start: startOfDay(now), end: endOfDay(now) }
    case 'gestern': {
      const y = new Date(now)
      y.setDate(y.getDate() - 1)
      return { start: startOfDay(y), end: endOfDay(y) }
    }
    case 'letzte7': {
      const s = new Date(now)
      s.setDate(s.getDate() - 6)
      return { start: startOfDay(s), end: endOfDay(now) }
    }
    case 'letzte14': {
      const s = new Date(now)
      s.setDate(s.getDate() - 13)
      return { start: startOfDay(s), end: endOfDay(now) }
    }
    case 'letzte30': {
      const s = new Date(now)
      s.setDate(s.getDate() - 29)
      return { start: startOfDay(s), end: endOfDay(now) }
    }
    case 'diesermonat': {
      const s = new Date(now.getFullYear(), now.getMonth(), 1)
      return { start: startOfDay(s), end: endOfDay(now) }
    }
    case 'letztermonat': {
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const e = new Date(now.getFullYear(), now.getMonth(), 0)
      return { start: startOfDay(s), end: endOfDay(e) }
    }
    case 'custom': {
      if (!custom?.start || !custom?.end) return null
      return { start: startOfDay(new Date(custom.start)), end: endOfDay(new Date(custom.end)) }
    }
    case 'alle':
    default:
      return null
  }
}

export function inRange(iso: string, range: { start: Date; end: Date } | null): boolean {
  if (!range) return true
  const t = new Date(iso).getTime()
  return t >= range.start.getTime() && t <= range.end.getTime()
}

export const ZEITRAUM_LABELS: Record<ZeitraumFilter, string> = {
  heute: 'Heute',
  gestern: 'Gestern',
  letzte7: 'Letzte 7 Tage',
  letzte14: 'Letzte 2 Wochen',
  letzte30: 'Letzte 30 Tage',
  diesermonat: 'Dieser Monat',
  letztermonat: 'Letzter Monat',
  alle: 'Alle',
  custom: 'Benutzerdefiniert',
}
