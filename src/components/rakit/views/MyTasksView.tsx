'use client'

/**
 * MyTasksView — every task assigned to the current user in this workspace,
 * grouped into editorial buckets (Terlambat / Hari Ini / 7 Hari / Nanti /
 * Tanpa Tenggat / Selesai). Completing a task is optimistic.
 */

import * as React from 'react'
import { Circle, CheckCircle2, MessageSquare } from 'lucide-react'
import { useRakit } from '@/components/rakit/store'
import { apiGet, apiPatch, ApiClientError } from '@/components/rakit/api-client'
import type { Task } from '@/components/rakit/types'
import {
  Masthead,
  SectionHeading,
  PriorityMark,
  DueText,
  LabelChip,
  EmptyState,
  ViewSkeleton,
} from '@/components/rakit/ui-primitives'
import { Button } from '@/components/ui/button'
import { daysUntil } from '@/components/rakit/format'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

/** The my-tasks endpoint enriches Task with a lightweight project. */
type MyTask = Task & { project: { id: string; name: string; color: string } }

type BucketKey = 'late' | 'today' | 'week' | 'later' | 'someday' | 'done'

const BUCKET_TITLES: Record<BucketKey, string> = {
  late: 'Terlambat',
  today: 'Hari Ini',
  week: '7 Hari Ke Depan',
  later: 'Nanti',
  someday: 'Tanpa Tenggat',
  done: 'Selesai (7 hari terakhir)',
}

export function MyTasksView() {
  const workspaceId = useRakit((s) => s.workspaceId)
  const dataVersion = useRakit((s) => s.dataVersion)
  const navigate = useRakit((s) => s.navigate)
  const openOverlay = useRakit((s) => s.openOverlay)
  const bump = useRakit((s) => s.bumpDataVersion)

  const [tasks, setTasks] = React.useState<MyTask[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    if (!workspaceId) return
    setLoading(true)
    setError(null)
    try {
      const res = await apiGet<{ tasks: MyTask[] }>(`/api/my-tasks?workspaceId=${workspaceId}&includeDone=1`)
      setTasks(res.tasks)
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : 'Gagal memuat tugas.')
    } finally {
      setLoading(false)
    }
  }, [workspaceId])

  React.useEffect(() => {
    void load()
  }, [load, dataVersion])

  async function toggleTask(t: MyTask) {
    const reopening = t.status === 'DONE'
    // optimistic: flip status locally, reconcile on refetch (bump → dataVersion)
    setTasks((prev) =>
      prev.map((x) =>
        x.id === t.id
          ? {
              ...x,
              status: reopening ? 'IN_PROGRESS' : 'DONE',
              completedAt: reopening ? null : new Date().toISOString(),
            }
          : x,
      ),
    )
    try {
      await apiPatch(`/api/tasks/${t.id}`, { status: reopening ? 'IN_PROGRESS' : 'DONE' })
      toast({ title: reopening ? 'Tugas dibuka kembali' : 'Tugas diselesaikan', description: t.title })
      bump()
    } catch (e) {
      toast({
        title: 'Gagal memperbarui tugas',
        description: e instanceof ApiClientError ? e.message : 'Coba lagi.',
        variant: 'destructive',
      })
      void load()
    }
  }

  const grouped = React.useMemo(() => {
    const buckets: Record<BucketKey, MyTask[]> = { late: [], today: [], week: [], later: [], someday: [], done: [] }
    for (const t of tasks) {
      if (t.status === 'DONE') {
        buckets.done.push(t)
        continue
      }
      if (!t.dueDate) {
        buckets.someday.push(t)
        continue
      }
      const d = daysUntil(t.dueDate)
      if (d < 0) buckets.late.push(t)
      else if (d === 0) buckets.today.push(t)
      else if (d <= 7) buckets.week.push(t)
      else buckets.later.push(t)
    }
    return buckets
  }, [tasks])

  if (error && !loading && tasks.length === 0) {
    return (
      <EmptyState
        title="Tugas gagal dimuat"
        description={error}
        action={
          <Button variant="outline" size="sm" onClick={() => void load()}>
            Coba Lagi
          </Button>
        }
      />
    )
  }

  if (loading && tasks.length === 0) return <ViewSkeleton rows={7} />

  return (
    <div>
      <Masthead
        kicker="Pribadi"
        title="Tugas Saya"
        description="Semua tugas yang ditugaskan kepadamu di workspace ini."
      />

      {tasks.length === 0 ? (
        <EmptyState
          title="Belum ada tugas untukmu"
          description="Tugas yang ditugaskan kepadamu akan muncul di sini, dikelompokkan berdasarkan tenggat."
          action={
            <Button size="sm" onClick={() => openOverlay({ kind: 'task-create' })}>
              Buat Tugas
            </Button>
          }
        />
      ) : (
        (Object.keys(BUCKET_TITLES) as BucketKey[]).map((key) => {
          const list = grouped[key]
          if (list.length === 0) return null
          return (
            <section key={key} className="mb-8">
              <SectionHeading aside={<span className="font-mono">{list.length}</span>}>
                {BUCKET_TITLES[key]}
              </SectionHeading>
              <div className="divide-y divide-border border-y">
                {list.map((t) => (
                  <div key={t.id} className="flex items-center gap-3 py-3">
                    <button
                      type="button"
                      aria-label={t.status === 'DONE' ? `Buka kembali: ${t.title}` : `Tandai selesai: ${t.title}`}
                      onClick={() => void toggleTask(t)}
                      className="shrink-0"
                    >
                      {t.status === 'DONE' ? (
                        <CheckCircle2 className="size-[18px] text-success" />
                      ) : (
                        <Circle className="size-[18px] text-muted-foreground/40 transition-colors hover:text-foreground" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate({ name: 'project', projectId: t.projectId, tab: 'board' })}
                      className={cn(
                        'min-w-0 flex-1 truncate text-left text-sm hover:text-brand',
                        t.status === 'DONE' && 'text-muted-foreground line-through',
                      )}
                    >
                      {t.title}
                    </button>
                    <PriorityMark priority={t.priority} className="hidden md:inline-flex" />
                    <DueText date={t.dueDate} className="w-20 shrink-0 text-right" />
                    <button
                      type="button"
                      onClick={() => navigate({ name: 'project', projectId: t.project.id, tab: 'board' })}
                      className="hidden w-28 shrink-0 truncate text-left font-mono text-[11px] text-muted-foreground hover:text-brand lg:block"
                    >
                      {t.project.name}
                    </button>
                    <div className="hidden shrink-0 items-center gap-1 lg:flex">
                      {(t.labels ?? []).slice(0, 2).map((l) => (
                        <LabelChip key={l.id} label={l} />
                      ))}
                    </div>
                    {(t._count?.comments ?? 0) > 0 ? (
                      <span
                        className="hidden shrink-0 items-center gap-1 font-mono text-[11px] text-muted-foreground sm:flex"
                        title="Jumlah komentar"
                      >
                        <MessageSquare className="size-3" aria-hidden />
                        {t._count?.comments}
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          )
        })
      )}
    </div>
  )
}
