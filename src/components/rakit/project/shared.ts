// ─── Project-detail shared helpers (used by the tab views) ───────────────────

import { ApiClientError } from '@/components/rakit/api-client'

export const DAY = 86_400_000
/** Kanban/timeline day-cell width in px. */
export const DAY_WIDTH = 36

export function startOfMs(value: string | Date): number {
  const d = new Date(value)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Urgent-first ranking for priority sorting. */
export const PRIORITY_RANK: Record<'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW', number> = {
  URGENT: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
}

export function errMessage(e: unknown): string {
  return e instanceof ApiClientError ? e.message : 'Terjadi kesalahan. Coba lagi.'
}
