'use client'

/**
 * ProjectsView — all workspace projects as editorial hairline rows with
 * status underline-tabs + search. Rows are sorted ACTIVE first, then
 * PLANNING, ON_HOLD, and the rest; within a group by updatedAt desc.
 */

import * as React from 'react'
import { useRakit, roleAtLeast } from '@/components/rakit/store'
import { apiGet, ApiClientError } from '@/components/rakit/api-client'
import type { Project, ProjectStatus } from '@/components/rakit/types'
import {
  Masthead,
  ProjectStatusBadge,
  PriorityMark,
  DueText,
  ProgressBar,
  AvatarStack,
  EmptyState,
  ViewSkeleton,
} from '@/components/rakit/ui-primitives'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

type StatusTab = 'ALL' | ProjectStatus

const STATUS_TABS: Array<{ key: StatusTab; label: string }> = [
  { key: 'ALL', label: 'Semua' },
  { key: 'ACTIVE', label: 'Aktif' },
  { key: 'PLANNING', label: 'Perencanaan' },
  { key: 'ON_HOLD', label: 'Ditunda' },
  { key: 'COMPLETED', label: 'Selesai' },
  { key: 'ARCHIVED', label: 'Diarsipkan' },
]

const STATUS_ORDER: Record<ProjectStatus, number> = {
  ACTIVE: 0,
  PLANNING: 1,
  ON_HOLD: 2,
  COMPLETED: 3,
  ARCHIVED: 4,
}

export function ProjectsView() {
  const workspaceId = useRakit((s) => s.workspaceId)
  const workspace = useRakit((s) => s.currentWorkspace())
  const dataVersion = useRakit((s) => s.dataVersion)
  const navigate = useRakit((s) => s.navigate)
  const openOverlay = useRakit((s) => s.openOverlay)
  const myRole = useRakit((s) => s.workspaces.find((w) => w.id === s.workspaceId)?.role ?? null)

  const [projects, setProjects] = React.useState<Project[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const [statusTab, setStatusTab] = React.useState<StatusTab>('ALL')
  const [search, setSearch] = React.useState('')

  const load = React.useCallback(async () => {
    if (!workspaceId) return
    setLoading(true)
    setError(null)
    try {
      const res = await apiGet<{ projects: Project[] }>(`/api/workspaces/${workspaceId}/projects`)
      setProjects(res.projects)
    } catch (e) {
      const msg = e instanceof ApiClientError ? e.message : 'Gagal memuat proyek.'
      setError(msg)
      toast({ title: 'Gagal memuat proyek', description: msg, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [workspaceId])

  React.useEffect(() => {
    void load()
  }, [load, dataVersion])

  const visible = React.useMemo(() => {
    const q = search.trim().toLowerCase()
    return [...projects]
      .sort((a, b) => {
        const oa = STATUS_ORDER[a.status] ?? 9
        const ob = STATUS_ORDER[b.status] ?? 9
        if (oa !== ob) return oa - ob
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      })
      .filter((p) => {
        if (statusTab !== 'ALL' && p.status !== statusTab) return false
        if (q && !p.name.toLowerCase().includes(q)) return false
        return true
      })
  }, [projects, statusTab, search])

  if (error && projects.length === 0 && !loading) {
    return (
      <div>
        <Masthead
          kicker={workspace?.name ?? 'Workspace'}
          title="Proyek"
          description="Semua upaya tim dalam satu papan."
        />
        <EmptyState
          title="Proyek gagal dimuat"
          description={error}
          action={
            <Button variant="outline" size="sm" onClick={() => void load()}>
              Coba Lagi
            </Button>
          }
        />
      </div>
    )
  }

  if (loading && projects.length === 0) return <ViewSkeleton rows={6} />

  return (
    <div>
      <Masthead
        kicker={workspace?.name ?? 'Workspace'}
        title="Proyek"
        description="Semua upaya tim dalam satu papan."
        actions={
          <>
            <Button size="sm" onClick={() => openOverlay({ kind: 'project-create' })}>
              Proyek Baru
            </Button>
            {roleAtLeast(myRole, 'ADMIN') ? (
              <Button size="sm" variant="outline" onClick={() => openOverlay({ kind: 'invite-member' })}>
                Undang Anggota
              </Button>
            ) : null}
          </>
        }
      />

      {/* Filter bar */}
      <div className="flex flex-col gap-3 border-b border-border sm:flex-row sm:items-center sm:justify-between">
        <div className="flex overflow-x-auto" role="tablist" aria-label="Filter status proyek">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={statusTab === tab.key}
              className="tab-ed"
              data-active={statusTab === tab.key}
              onClick={() => setStatusTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari proyek…"
          className="h-8 w-full text-xs sm:w-56"
          aria-label="Cari proyek"
        />
      </div>

      {/* Project rows */}
      <div className="mt-5">
        {visible.length === 0 ? (
          projects.length === 0 ? (
            <EmptyState
              title="Belum ada proyek"
              description="Buat proyek pertamamu untuk mulai mengatur pekerjaan tim."
              action={
                <Button size="sm" onClick={() => openOverlay({ kind: 'project-create' })}>
                  Proyek Baru
                </Button>
              }
            />
          ) : (
            <EmptyState compact title="Tidak ada proyek pada status ini." description="Coba pilih status lain atau ubah kata kunci pencarian." />
          )
        ) : (
          <div className="divide-y divide-border border-y">
            {visible.map((p) => {
              const total = p.taskStats?.total ?? 0
              const done = p.taskStats?.done ?? 0
              const pct = total > 0 ? (done / total) * 100 : 0
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => navigate({ name: 'project', projectId: p.id, tab: 'board' })}
                  className={cn(
                    'flex w-full items-center gap-4 px-2 py-4 text-left transition-colors',
                    'hover:bg-muted/40',
                  )}
                >
                  <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: p.color }} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-medium">{p.name}</p>
                    {p.description ? (
                      <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{p.description}</p>
                    ) : null}
                  </div>
                  <div className="hidden shrink-0 items-center gap-3 md:flex">
                    <ProjectStatusBadge status={p.status} />
                    <PriorityMark priority={p.priority} />
                  </div>
                  <div className="hidden shrink-0 items-center gap-3 lg:flex">
                    <div className="w-24">
                      <ProgressBar value={pct} />
                    </div>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {done}/{total}
                    </span>
                    <AvatarStack users={(p.members ?? []).map((m) => m.user)} size={22} max={3} />
                    <DueText date={p.targetDate} className="w-16 text-right" />
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
