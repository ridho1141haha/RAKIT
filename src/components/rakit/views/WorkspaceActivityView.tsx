'use client'

// ─── WorkspaceActivityView: cross-workspace activity feed with cursor paging ──

import * as React from 'react'
import { useRakit } from '@/components/rakit/store'
import { apiGet, ApiClientError } from '@/components/rakit/api-client'
import type { ActivityItem } from '@/components/rakit/types'
import { Masthead, EmptyState, ViewSkeleton, UserAvatar } from '@/components/rakit/ui-primitives'
import { formatDateTime } from '@/components/rakit/format'
import { ACTIVITY_TYPES } from '@/lib/constants'
import { Button } from '@/components/ui/button'
import { toast } from '@/hooks/use-toast'
import { Activity, Loader2, RotateCcw } from 'lucide-react'

const FILTERS = [
  { key: 'all', label: 'Semua' },
  { key: 'PROJECT', label: 'Proyek' },
  { key: 'TASK', label: 'Tugas' },
  { key: 'IDEA', label: 'Ide' },
  { key: 'DOCUMENT', label: 'Dokumen' },
  { key: 'MEMBER', label: 'Anggota' },
] as const

type FilterKey = (typeof FILTERS)[number]['key']

function verbFor(type: string): string {
  return ACTIVITY_TYPES[type as keyof typeof ACTIVITY_TYPES] ?? type
}

function detailFrom(metadata: string | null): string | null {
  if (!metadata) return null
  try {
    const parsed: unknown = JSON.parse(metadata)
    if (parsed && typeof parsed === 'object' && 'detail' in parsed) {
      const detail = (parsed as { detail?: unknown }).detail
      if (typeof detail === 'string' && detail.trim()) return detail.trim()
    }
    return null
  } catch {
    return null
  }
}

export function WorkspaceActivityView() {
  const workspaceId = useRakit((s) => s.workspaceId)
  const workspaceName = useRakit((s) => s.currentWorkspace()?.name)
  const navigate = useRakit((s) => s.navigate)

  const [events, setEvents] = React.useState<ActivityItem[] | null>(null)
  const [nextCursor, setNextCursor] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [filter, setFilter] = React.useState<FilterKey>('all')
  const [loadingMore, setLoadingMore] = React.useState(false)

  const load = React.useCallback(async () => {
    if (!workspaceId) return
    setError(null)
    try {
      const data = await apiGet<{ events: ActivityItem[]; nextCursor: string | null }>(
        `/api/workspaces/${workspaceId}/activity?limit=30`,
      )
      setEvents(data.events)
      setNextCursor(data.nextCursor ?? null)
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : 'Gagal memuat aktivitas.')
    }
  }, [workspaceId])

  React.useEffect(() => {
    void load()
  }, [load])

  async function loadMore() {
    if (!workspaceId || !nextCursor) return
    setLoadingMore(true)
    try {
      const data = await apiGet<{ events: ActivityItem[]; nextCursor: string | null }>(
        `/api/workspaces/${workspaceId}/activity?limit=30&cursor=${encodeURIComponent(nextCursor)}`,
      )
      setEvents((prev) => {
        const seen = new Set((prev ?? []).map((e) => e.id))
        return [...(prev ?? []), ...data.events.filter((e) => !seen.has(e.id))]
      })
      setNextCursor(data.nextCursor ?? null)
    } catch (e) {
      toast({
        title: 'Gagal memuat aktivitas lanjutan',
        description: e instanceof ApiClientError ? e.message : 'Coba lagi sebentar.',
        variant: 'destructive',
      })
    } finally {
      setLoadingMore(false)
    }
  }

  const filtered = React.useMemo(() => {
    if (!events) return []
    if (filter === 'all') return events
    return events.filter((e) => (e.entityType ?? '').toUpperCase() === filter)
  }, [events, filter])

  return (
    <div>
      <Masthead
        kicker={workspaceName ?? 'Workspace'}
        title="Aktivitas"
        description="Jejak perubahan di seluruh workspace — 30 terbaru."
      />

      {/* filter row */}
      <div className="flex items-center overflow-x-auto border-b border-border" role="tablist" aria-label="Filter aktivitas">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            role="tab"
            aria-selected={filter === f.key}
            data-active={filter === f.key}
            className="tab-ed"
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error ? (
        <div className="pt-6">
          <EmptyState
            icon={<Activity className="size-8" />}
            title="Aktivitas belum bisa dimuat"
            description={error}
            action={
              <Button variant="outline" size="sm" onClick={() => void load()}>
                <RotateCcw className="size-4" /> Coba lagi
              </Button>
            }
          />
        </div>
      ) : events === null ? (
        <div className="pt-6">
          <ViewSkeleton rows={7} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="pt-6">
          <EmptyState
            icon={<Activity className="size-8" />}
            title={filter === 'all' ? 'Belum ada aktivitas' : 'Tidak ada aktivitas pada kategori ini'}
            description={
              filter === 'all'
                ? 'Mulai buat proyek, tugas, atau ide — jejak perubahannya akan muncul di sini.'
                : 'Coba pilih kategori lain, atau lakukan perubahan baru untuk melihat jejaknya.'
            }
          />
        </div>
      ) : (
        <>
          <div className="divide-y divide-border border-b border-border">
            {filtered.map((ev) => {
              const detail = detailFrom(ev.metadata)
              return (
                <div key={ev.id} className="flex items-start gap-3 py-3">
                  <UserAvatar user={ev.user} size={28} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-relaxed">
                      <span className="font-semibold">{ev.user.name}</span> {verbFor(ev.type)}{' '}
                      {ev.entityTitle ? (
                        <span className="italic">{ev.entityTitle}</span>
                      ) : (
                        <span className="italic text-muted-foreground">—</span>
                      )}
                      {ev.project ? (
                        <>
                          {' · '}
                          <button
                            type="button"
                            className="font-mono text-xs text-brand underline decoration-brand/40 underline-offset-2 hover:decoration-brand"
                            onClick={() => navigate({ name: 'project', projectId: ev.project!.id, tab: 'board' })}
                          >
                            {ev.project.name}
                          </button>
                        </>
                      ) : null}
                      {detail ? (
                        <span className="font-mono text-[11px] text-muted-foreground"> · {detail}</span>
                      ) : null}
                    </p>
                    <p className="mt-1 flex items-center gap-2">
                      <span className="font-mono text-[10px] text-muted-foreground">{formatDateTime(ev.createdAt)}</span>
                      <span aria-hidden>·</span>
                      <span className="kicker text-[9px] opacity-80">{ev.type}</span>
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
          {nextCursor ? (
            <div className="flex justify-center pt-4">
              <Button variant="outline" size="sm" onClick={() => void loadMore()} disabled={loadingMore}>
                {loadingMore ? <Loader2 className="size-4 animate-spin" /> : null}
                Muat lebih banyak
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}
