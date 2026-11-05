'use client'

/**
 * DashboardView — editorial overview of the workspace: stats strip,
 * active projects, recent activity, deadlines, my tasks, weekly
 * productivity and upcoming milestones.
 */

import * as React from 'react'
import { Circle, Flag } from 'lucide-react'
import { useRakit } from '@/components/rakit/store'
import { apiGet, apiPatch, ApiClientError } from '@/components/rakit/api-client'
import type { DashboardData } from '@/components/rakit/types'
import {
  Masthead,
  SectionHeading,
  Kicker,
  UserAvatar,
  AvatarStack,
  ProjectStatusBadge,
  PriorityMark,
  DueText,
  ProgressBar,
  EmptyState,
  ViewSkeleton,
} from '@/components/rakit/ui-primitives'
import { Button } from '@/components/ui/button'
import { formatRelative, startOfDay, weekdayLabel } from '@/components/rakit/format'
import { ACTIVITY_TYPES } from '@/lib/constants'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

/** type → Indonesian verb phrase (from domain constants). */
const ACTIVITY_VERB: Record<string, string> = ACTIVITY_TYPES

/** Explicit cell borders for the 2×2 (mobile) / 1×4 (desktop) stats strip. */
const STAT_BORDERS = [
  '',
  'border-l',
  'border-t md:border-l md:border-t-0',
  'border-l border-t md:border-l md:border-t-0',
] as const

export function DashboardView() {
  const user = useRakit((s) => s.user)
  const workspaceId = useRakit((s) => s.workspaceId)
  const workspace = useRakit((s) => s.currentWorkspace())
  const dataVersion = useRakit((s) => s.dataVersion)
  const navigate = useRakit((s) => s.navigate)
  const openOverlay = useRakit((s) => s.openOverlay)

  const [data, setData] = React.useState<DashboardData | null>(null)
  // myTasks kept in local state so completing a task updates instantly
  const [myTaskList, setMyTaskList] = React.useState<DashboardData['myTasks']>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    if (!workspaceId) return
    setLoading(true)
    setError(null)
    try {
      const res = await apiGet<DashboardData>(`/api/dashboard?workspaceId=${workspaceId}`)
      setData(res)
      setMyTaskList(res.myTasks)
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : 'Gagal memuat dasbor.')
    } finally {
      setLoading(false)
    }
  }, [workspaceId])

  React.useEffect(() => {
    void load()
  }, [load, dataVersion])

  async function completeMyTask(taskId: string) {
    // optimistic: drop the row immediately, reconcile after PATCH
    setMyTaskList((prev) => prev.filter((t) => t.id !== taskId))
    try {
      await apiPatch(`/api/tasks/${taskId}`, { status: 'DONE' })
      toast({ title: 'Tugas diselesaikan' })
      useRakit.getState().bumpDataVersion()
    } catch (e) {
      toast({
        title: 'Gagal menyelesaikan tugas',
        description: e instanceof ApiClientError ? e.message : 'Coba lagi.',
        variant: 'destructive',
      })
      void load()
    }
  }

  if (error && !data) {
    return (
      <EmptyState
        title="Dasbor gagal dimuat"
        description={error}
        action={
          <Button variant="outline" size="sm" onClick={() => void load()}>
            Coba Lagi
          </Button>
        }
      />
    )
  }

  if (loading && !data) return <ViewSkeleton rows={6} />
  if (!data || !workspace) return null

  const stats = data.stats
  const firstName = (user?.name ?? '').split(' ')[0] || 'Kawan'
  const mastheadDescription =
    `${stats.activeProjects} proyek aktif · ${stats.myOpenTasks} tugas menunggumu` +
    (stats.overdueTasks > 0 ? ` · ${stats.overdueTasks} terlambat` : '')

  const statCells = [
    { label: 'Proyek Aktif', value: stats.activeProjects, danger: false, view: { name: 'projects' } as const },
    { label: 'Tugas Saya', value: stats.myOpenTasks, danger: false, view: { name: 'my-tasks' } as const },
    { label: 'Terlambat', value: stats.overdueTasks, danger: stats.overdueTasks > 0, view: { name: 'my-tasks' } as const },
    { label: 'Selesai Pekan Ini', value: stats.doneThisWeek, danger: false, view: null },
  ]

  const weekly = data.weeklyDone
  const maxCount = Math.max(1, ...weekly.map((d) => d.count))
  const totalDone = weekly.reduce((acc, d) => acc + d.count, 0)
  const todayKey = startOfDay(new Date()).getTime()

  return (
    <div>
      <Masthead
        kicker={`${workspace.name} · Ikhtisar`}
        title={`Selamat datang, ${firstName}`}
        description={mastheadDescription}
        actions={
          <>
            <Button size="sm" onClick={() => openOverlay({ kind: 'task-create' })}>
              Tugas Baru
            </Button>
            <Button size="sm" variant="outline" onClick={() => openOverlay({ kind: 'idea-create' })}>
              Ide Baru
            </Button>
          </>
        }
      />

      {/* Stats strip */}
      <div className="grid grid-cols-2 rounded-lg border bg-card md:grid-cols-4" aria-label="Ringkasan statistik">
        {statCells.map((cell, i) => (
          <button
            key={cell.label}
            type="button"
            disabled={!cell.view}
            onClick={() => cell.view && navigate(cell.view)}
            className={cn('p-4 text-left', STAT_BORDERS[i], cell.view && 'transition-colors hover:bg-muted/50')}
          >
            <div className={cn('font-mono text-2xl font-semibold', cell.danger && 'text-brand')}>{cell.value}</div>
            <Kicker className="mt-1.5">{cell.label}</Kicker>
          </button>
        ))}
      </div>

      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_340px] lg:gap-8">
        {/* ── Left column ── */}
        <div className="min-w-0">
          <section>
            <SectionHeading
              aside={
                <button type="button" onClick={() => navigate({ name: 'projects' })} className="hover:text-brand">
                  Lihat semua →
                </button>
              }
            >
              Proyek Aktif
            </SectionHeading>
            {data.activeProjects.length === 0 ? (
              <EmptyState
                compact
                title="Belum ada proyek aktif"
                description="Mulai sebuah proyek untuk melihat kemajuannya di sini."
                action={
                  <Button size="sm" variant="outline" onClick={() => openOverlay({ kind: 'project-create' })}>
                    Proyek Baru
                  </Button>
                }
              />
            ) : (
              <div className="divide-y divide-border border-y">
                {data.activeProjects.map((p) => {
                  const total = p.taskStats?.total ?? 0
                  const done = p.taskStats?.done ?? 0
                  const pct = total > 0 ? (done / total) * 100 : 0
                  return (
                    <div key={p.id} className="flex items-center gap-3 py-3">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: p.color }} aria-hidden />
                      <button
                        type="button"
                        onClick={() => navigate({ name: 'project', projectId: p.id, tab: 'board' })}
                        className="min-w-0 flex-1 truncate text-left text-sm font-medium hover:text-brand"
                      >
                        {p.name}
                      </button>
                      <ProjectStatusBadge status={p.status} className="hidden sm:inline-flex" />
                      <div className="hidden w-32 shrink-0 items-center gap-2 sm:flex">
                        <ProgressBar value={pct} className="flex-1" />
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {done}/{total}
                        </span>
                      </div>
                      <AvatarStack users={(p.members ?? []).map((m) => m.user)} size={22} max={3} />
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          <section className="mt-10">
            <SectionHeading>Aktivitas Terbaru</SectionHeading>
            {data.recentActivity.length === 0 ? (
              <p className="text-xs text-muted-foreground">Belum ada aktivitas di workspace ini.</p>
            ) : (
              <div className="divide-y divide-border border-y">
                {data.recentActivity.map((ev) => (
                  <div key={ev.id} className="flex items-start gap-2.5 py-2.5">
                    <UserAvatar user={ev.user} size={20} className="mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm leading-snug">
                        <b className="font-semibold">{ev.user.name}</b> {ACTIVITY_VERB[ev.type] ?? 'memperbarui'}{' '}
                        {ev.entityTitle ? (
                          <button
                            type="button"
                            onClick={() =>
                              ev.projectId && navigate({ name: 'project', projectId: ev.projectId, tab: 'board' })
                            }
                            className={cn('text-left', ev.projectId && 'hover:text-brand')}
                          >
                            {ev.entityTitle}
                          </button>
                        ) : null}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 font-mono text-[10px] text-muted-foreground">
                        {ev.project ? <span>{ev.project.name}</span> : null}
                        <span>{formatRelative(ev.createdAt)}</span>
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* ── Right column ── */}
        <aside className="space-y-10">
          <section className="space-y-3">
            <SectionHeading>Tenggat Terdekat</SectionHeading>
            {data.upcomingDeadlines.length === 0 ? (
              <EmptyState compact title="Tidak ada tenggat" description="Tidak ada tugas yang jatuh tempo dalam waktu dekat." />
            ) : (
              <div className="divide-y divide-border border-y">
                {data.upcomingDeadlines.map((t) => (
                  <div key={t.id} className="flex items-center gap-2.5 py-2.5">
                    <DueText date={t.dueDate} className="w-20 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        title={t.title}
                        onClick={() => navigate({ name: 'project', projectId: t.projectId, tab: 'board' })}
                        className="block w-full truncate text-left text-sm hover:text-brand"
                      >
                        {t.title}
                      </button>
                      <span className="font-mono text-[10px] text-muted-foreground">{t.projectName}</span>
                    </div>
                    <PriorityMark priority={t.priority} />
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <SectionHeading>Tugas Saya</SectionHeading>
            {myTaskList.length === 0 ? (
              <p className="text-xs text-muted-foreground">Tidak ada tugas yang menunggumu. Selamat menikmati harimu!</p>
            ) : (
              <div className="divide-y divide-border border-y">
                {myTaskList.map((t) => (
                  <div key={t.id} className="flex items-center gap-2.5 py-2.5">
                    <button
                      type="button"
                      aria-label={`Tandai selesai: ${t.title}`}
                      onClick={() => void completeMyTask(t.id)}
                      className="shrink-0 text-muted-foreground/40 transition-colors hover:text-foreground"
                    >
                      <Circle className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate({ name: 'project', projectId: t.projectId, tab: 'board' })}
                      className="min-w-0 flex-1 truncate text-left text-sm hover:text-brand"
                    >
                      {t.title}
                    </button>
                    <DueText date={t.dueDate} />
                  </div>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => navigate({ name: 'my-tasks' })}
              className="text-xs text-muted-foreground transition-colors hover:text-brand"
            >
              Semua tugas →
            </button>
          </section>

          <section className="space-y-3">
            <SectionHeading aside={<span className="font-mono">{totalDone} selesai</span>}>Produktivitas 7 Hari</SectionHeading>
            {weekly.length === 0 ? (
              <p className="text-xs text-muted-foreground">Belum ada data produktivitas.</p>
            ) : (
              <div>
                <div className="flex h-20 items-end gap-1.5">
                  {weekly.map((d) => (
                    <div key={d.date} className="flex h-full flex-1 items-end">
                      <div
                        className={cn(
                          'w-full rounded-sm transition-all',
                          startOfDay(d.date).getTime() === todayKey ? 'bg-brand' : 'bg-foreground/15',
                        )}
                        style={{ height: `${Math.max(6, (d.count / maxCount) * 100)}%` }}
                        title={`${d.count} tugas selesai`}
                      />
                    </div>
                  ))}
                </div>
                <div className="mt-1.5 flex gap-1.5">
                  {weekly.map((d) => (
                    <span key={d.date} className="flex-1 text-center font-mono text-[9px] text-muted-foreground">
                      {weekdayLabel(d.date)}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </section>

          <section className="space-y-3">
            <SectionHeading>Milestone Mendekat</SectionHeading>
            {data.upcomingMilestones.length === 0 ? (
              <EmptyState compact title="Tidak ada milestone" description="Belum ada milestone yang akan jatuh tempo." />
            ) : (
              <div className="divide-y divide-border border-y">
                {data.upcomingMilestones.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => navigate({ name: 'project', projectId: m.projectId, tab: 'milestones' })}
                    className="flex w-full items-center gap-2.5 py-2.5 text-left transition-colors hover:bg-muted/40"
                  >
                    <Flag className={cn('size-3.5 shrink-0', m.overdue ? 'text-brand' : 'text-muted-foreground')} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className={cn('truncate text-sm', m.overdue && 'text-brand')}>{m.name}</p>
                      <span className="font-mono text-[10px] text-muted-foreground">{m.projectName}</span>
                    </div>
                    <DueText date={m.targetDate} />
                  </button>
                ))}
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  )
}
