'use client'

/**
 * ProjectDetailView — project workspace shell: masthead (status select, new task,
 * overflow menu with delete), editorial tab nav, and the tab views
 * (Papan/Daftar/Timeline/Milestone in this folder; Dokumen/Aktivitas placeholders).
 * Task forms live in the global TaskDialog (opened via store overlays).
 */

import * as React from 'react'
import { useRakit, roleAtLeast } from '@/components/rakit/store'
import type { ProjectTab } from '@/components/rakit/store'
import { apiGet, apiPatch, apiDelete, ApiClientError } from '@/components/rakit/api-client'
import type { Milestone, Project, ProjectStatus, Role, Task, TaskStatus } from '@/components/rakit/types'
import { PRIORITY_LABEL, PROJECT_STATUSES, PROJECT_STATUS_LABEL } from '@/lib/constants'
import {
  AvatarStack,
  ConfirmDialog,
  EmptyState,
  Kicker,
  Masthead,
  ProgressBar,
  UserAvatar,
  ViewSkeleton,
} from '@/components/rakit/ui-primitives'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from '@/hooks/use-toast'
import { Activity, AlertCircle, FileText, MoreHorizontal, Plus } from 'lucide-react'
import { errMessage } from './shared'
import { BoardView } from './BoardView'
import { ListView } from './ListView'
import { TimelineView } from './TimelineView'
import { MilestonesView } from './MilestonesView'

interface TaskStats {
  total: number
  done: number
  overdue: number
  progress: number
  byStatus: Record<TaskStatus, number>
}

interface DetailData {
  project: Project
  taskStats: TaskStats
  myRole: Role | null
  tasks: Task[]
  milestones: Milestone[]
}

const PROJECT_TABS: Array<{ key: ProjectTab; label: string }> = [
  { key: 'board', label: 'Papan' },
  { key: 'list', label: 'Daftar' },
  { key: 'timeline', label: 'Timeline' },
  { key: 'milestones', label: 'Milestone' },
  { key: 'docs', label: 'Dokumen' },
  { key: 'activity', label: 'Aktivitas' },
]

export function ProjectDetailView({ projectId, tab }: { projectId: string; tab: ProjectTab }) {
  const dataVersion = useRakit((s) => s.dataVersion)
  const navigate = useRakit((s) => s.navigate)
  const openOverlay = useRakit((s) => s.openOverlay)
  const bump = useRakit((s) => s.bumpDataVersion)

  const [data, setData] = React.useState<DetailData | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)
  const [changingStatus, setChangingStatus] = React.useState(false)

  // Fetch project detail + tasks + milestones in parallel (mount + dataVersion bump).
  React.useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [detail, tasksRes, msRes] = await Promise.all([
          apiGet<{ project: Project; taskStats: TaskStats; myRole: Role }>(`/api/projects/${projectId}`),
          apiGet<{ tasks: Task[] }>(`/api/projects/${projectId}/tasks`),
          apiGet<{ milestones: Milestone[] }>(`/api/projects/${projectId}/milestones`),
        ])
        if (!alive) return
        setData({
          project: detail.project,
          taskStats: detail.taskStats,
          myRole: detail.myRole,
          tasks: tasksRes.tasks,
          milestones: msRes.milestones,
        })
        setError(null)
      } catch (e) {
        if (!alive) return
        setError(e instanceof ApiClientError ? e.message : 'Gagal memuat proyek.')
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [projectId, dataVersion])

  const canEdit = roleAtLeast(data?.myRole ?? null, 'MEMBER')
  const canDelete = roleAtLeast(data?.myRole ?? null, 'ADMIN')

  // ── optimistic setters ──
  const setTasks = React.useCallback((updater: (prev: Task[]) => Task[]) => {
    setData((cur) => (cur ? { ...cur, tasks: updater(cur.tasks) } : cur))
  }, [])
  const setMilestones = React.useCallback((updater: (prev: Milestone[]) => Milestone[]) => {
    setData((cur) => (cur ? { ...cur, milestones: updater(cur.milestones) } : cur))
  }, [])

  async function changeProjectStatus(status: ProjectStatus) {
    if (!data || data.project.status === status) return
    const prev = data.project.status
    setData({ ...data, project: { ...data.project, status } })
    setChangingStatus(true)
    try {
      await apiPatch(`/api/projects/${projectId}`, { status })
      toast({ title: 'Status proyek diperbarui', description: PROJECT_STATUS_LABEL[status] })
      bump()
    } catch (e) {
      toast({ title: 'Gagal mengubah status', description: errMessage(e), variant: 'destructive' })
      setData((cur) => (cur ? { ...cur, project: { ...cur.project, status: prev } } : cur))
    } finally {
      setChangingStatus(false)
    }
  }

  async function deleteProject() {
    setDeleting(true)
    try {
      await apiDelete(`/api/projects/${projectId}`)
      toast({ title: 'Proyek dihapus', description: data?.project.name })
      setConfirmDelete(false)
      navigate({ name: 'projects' })
      bump()
    } catch (e) {
      toast({ title: 'Gagal menghapus proyek', description: errMessage(e), variant: 'destructive' })
    } finally {
      setDeleting(false)
    }
  }

  /** List-view complete toggle (optimistic). DONE ⇄ IN_PROGRESS. */
  async function toggleTaskComplete(task: Task) {
    if (!canEdit) return
    const next: TaskStatus = task.status === 'DONE' ? 'IN_PROGRESS' : 'DONE'
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: next } : t)))
    try {
      await apiPatch(`/api/tasks/${task.id}`, { status: next })
      toast({
        title: next === 'DONE' ? 'Tugas selesai' : 'Tugas dibuka kembali',
        description: task.title,
      })
      bump()
    } catch (e) {
      toast({ title: 'Gagal memperbarui tugas', description: errMessage(e), variant: 'destructive' })
      bump() // refetch → revert to server state
    }
  }

  // ── loading / error states ──
  if (loading && !data) return <ViewSkeleton rows={7} />

  if (error && !data) {
    return (
      <EmptyState
        icon={<AlertCircle className="size-8" />}
        title="Proyek tidak ditemukan"
        description={error}
        action={
          <Button variant="outline" size="sm" onClick={() => navigate({ name: 'projects' })}>
            ← Kembali ke Proyek
          </Button>
        }
      />
    )
  }
  if (!data) return <ViewSkeleton rows={7} />

  const { project, taskStats } = data
  const memberUsers = project.members?.map((m) => m.user) ?? []

  return (
    <div>
      <Masthead
        kicker={`${PROJECT_STATUS_LABEL[project.status]} · ${PRIORITY_LABEL[project.priority]}`}
        title={project.name}
        description={
          project.description ? <span className="line-clamp-2">{project.description}</span> : undefined
        }
        actions={
          <>
            <Select
              value={project.status}
              onValueChange={(v) => void changeProjectStatus(v as ProjectStatus)}
              disabled={!canEdit || changingStatus}
            >
              <SelectTrigger aria-label="Status proyek" className="h-8 w-[148px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROJECT_STATUSES.map((s) => (
                  <SelectItem key={s} value={s} className="text-xs">
                    {PROJECT_STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {canEdit ? (
              <Button
                size="sm"
                className="h-8"
                onClick={() => openOverlay({ kind: 'task-create', projectId })}
              >
                <Plus className="size-3.5" />
                Tugas Baru
              </Button>
            ) : null}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-8" aria-label="Menu proyek">
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {canEdit ? (
                  <DropdownMenuItem onClick={() => openOverlay({ kind: 'project-edit', projectId })}>
                    Ubah detail
                  </DropdownMenuItem>
                ) : null}
                {canDelete ? (
                  <>
                    {canEdit ? <DropdownMenuSeparator /> : null}
                    <DropdownMenuItem variant="destructive" onClick={() => setConfirmDelete(true)}>
                      Hapus proyek
                    </DropdownMenuItem>
                  </>
                ) : null}
                {!canEdit && !canDelete ? (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">
                    Kamu hanya dapat melihat proyek ini.
                  </div>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      {/* progress + people row (sits right under the title) */}
      <div className="-mt-3 mb-6 flex flex-wrap items-center gap-x-4 gap-y-2">
        <ProgressBar value={taskStats.progress} className="w-64 max-w-full" />
        <span className="font-mono text-[11px] text-muted-foreground">
          {taskStats.done}/{taskStats.total} tugas
        </span>
        {taskStats.overdue > 0 ? (
          <span className="font-mono text-[11px] font-semibold text-brand">
            · {taskStats.overdue} terlambat
          </span>
        ) : null}
        <span className="ml-auto flex items-center gap-1.5" title={`Pemilik: ${project.owner?.name ?? '—'}`}>
          <UserAvatar user={project.owner} size={22} />
          <AvatarStack users={memberUsers} size={22} max={5} />
        </span>
      </div>

      {/* tab nav (editorial underline) */}
      <nav className="mb-6 overflow-x-auto border-b border-border" aria-label="Tab proyek">
        <div className="flex">
          {PROJECT_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              className="tab-ed"
              data-active={tab === t.key}
              aria-current={tab === t.key ? 'page' : undefined}
              onClick={() => navigate({ name: 'project', projectId, tab: t.key })}
            >
              {t.label}
            </button>
          ))}
        </div>
      </nav>

      {tab === 'board' ? (
        <BoardView
          tasks={data.tasks}
          setTasks={setTasks}
          canEdit={canEdit}
          onOpenTask={(taskId) => openOverlay({ kind: 'task-edit', taskId })}
          onCreate={(status) => openOverlay({ kind: 'task-create', projectId, status })}
        />
      ) : null}

      {tab === 'list' ? (
        <ListView
          tasks={data.tasks}
          members={memberUsers}
          canEdit={canEdit}
          onOpenTask={(taskId) => openOverlay({ kind: 'task-edit', taskId })}
          onToggle={(task) => void toggleTaskComplete(task)}
          onCreate={() => openOverlay({ kind: 'task-create', projectId })}
        />
      ) : null}

      {tab === 'timeline' ? (
        <TimelineView
          tasks={data.tasks}
          milestones={data.milestones}
          onOpenTask={(taskId) => openOverlay({ kind: 'task-edit', taskId })}
        />
      ) : null}

      {tab === 'milestones' ? (
        <MilestonesView
          projectId={projectId}
          milestones={data.milestones}
          setMilestones={setMilestones}
          canEdit={canEdit}
        />
      ) : null}

      {tab === 'docs' ? (
        <PlaceholderTab
          icon={<FileText className="size-8" />}
          kicker="Dokumen proyek"
          text="Dikelola lewat menu Dokumen →"
          actionLabel="Buka Dokumen"
          onNavigate={() => navigate({ name: 'documents' })}
        />
      ) : null}

      {tab === 'activity' ? (
        <PlaceholderTab
          icon={<Activity className="size-8" />}
          kicker="Aktivitas proyek"
          text="Riwayat aktivitas tercatat di tingkat workspace →"
          actionLabel="Buka Aktivitas"
          onNavigate={() => navigate({ name: 'activity' })}
        />
      ) : null}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Hapus proyek?"
        description={`Proyek "${project.name}", semua tugas, milestone, dan dokumennya akan dihapus permanen.`}
        confirmLabel="Hapus Proyek"
        pending={deleting}
        requireText={project.name}
        onConfirm={() => void deleteProject()}
      />
    </div>
  )
}

// ─── Docs / activity placeholders (other agents' scope) ──────────────────────

function PlaceholderTab({
  icon,
  kicker,
  text,
  actionLabel,
  onNavigate,
}: {
  icon: React.ReactNode
  kicker: string
  text: string
  actionLabel: string
  onNavigate: () => void
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-8">
      <div className="mx-auto flex max-w-sm flex-col items-center gap-2 text-center">
        <div className="text-muted-foreground/60">{icon}</div>
        <Kicker>{kicker}</Kicker>
        <p className="text-sm text-muted-foreground">{text}</p>
        <Button size="sm" variant="outline" className="mt-2" onClick={onNavigate}>
          {actionLabel}
        </Button>
      </div>
    </div>
  )
}
