// ─── id-ID formatting helpers (Asia/Jakarta) ─────────────────────────────────

const dateFmt = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' })
const dateFmtShort = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', timeZone: 'Asia/Jakarta' })
const dateTimeFmt = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Jakarta' })
const weekdayFmt = new Intl.DateTimeFormat('id-ID', { weekday: 'short', timeZone: 'Asia/Jakarta' })

const DAY = 24 * 60 * 60 * 1000

export function formatDate(value?: string | Date | null): string {
  if (!value) return '—'
  return dateFmt.format(new Date(value))
}

export function formatDateShort(value?: string | Date | null): string {
  if (!value) return '—'
  return dateFmtShort.format(new Date(value))
}

export function formatDateTime(value?: string | Date | null): string {
  if (!value) return '—'
  return dateTimeFmt.format(new Date(value))
}

export function startOfDay(value: string | Date): Date {
  const d = new Date(value)
  d.setHours(0, 0, 0, 0)
  return d
}

export function daysUntil(value: string | Date): number {
  return Math.round((startOfDay(value).getTime() - startOfDay(new Date()).getTime()) / DAY)
}

/** Relative label in Indonesian, e.g. "baru saja", "5 mnt lalu", "2 hr lalu". */
export function formatRelative(value: string | Date): string {
  const diff = Date.now() - new Date(value).getTime()
  if (diff < 60_000) return 'baru saja'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} mnt lalu`
  if (diff < DAY) return `${Math.floor(diff / 3_600_000)} jam lalu`
  const days = Math.floor(diff / DAY)
  if (days === 1) return 'kemarin'
  if (days < 7) return `${days} hr lalu`
  if (days < 30) return `${Math.floor(days / 7)} pekan lalu`
  return formatDate(value)
}

/** Compact due-date label: "Terlambat 3 hr" / "Hari ini" / "Besok" / "5 Nov". */
export function dueLabel(value: string | null | undefined): { text: string; overdue: boolean; soon: boolean } | null {
  if (!value) return null
  const d = daysUntil(value)
  if (d < 0) return { text: `Terlambat ${Math.abs(d)} hr`, overdue: true, soon: false }
  if (d === 0) return { text: 'Hari ini', overdue: false, soon: true }
  if (d === 1) return { text: 'Besok', overdue: false, soon: true }
  if (d <= 7) return { text: dateFmtShort.format(new Date(value)), overdue: false, soon: false }
  return { text: dateFmtShort.format(new Date(value)), overdue: false, soon: false }
}

export function weekdayLabel(value: string | Date): string {
  return weekdayFmt.format(new Date(value))
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('')
}

export function formatHours(hours?: number | null): string {
  if (hours == null) return ''
  return hours % 1 === 0 ? `${hours} j` : `${hours.toFixed(1)} j`
}

/** Deterministic pastel-ish text color for labels/paths (kept warm). */
export function hexWithAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
