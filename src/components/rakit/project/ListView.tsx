'use client'

/**
 * ListView — filterable/sortable hairline table of tasks with a complete toggle.
 * Toggle = optimistic status flip (DONE ⇄ IN_PROGRESS) persisted via PATCH /api/tasks/:id.
 */

import * as React from 'react'
import { cn } from '@/lib/utils'
import type { Task, UserInfo } from '@/components/rakit/types'
import { PRIORITIES, PRIORITY_LABEL, TASK_STATUSES } from '@/lib/constants'
import { formatHours } from '@/components/rakit/format'
import {
  DueText,
  EmptyState,
  LabelChip,
  PriorityMark,
  TaskStatusBadge,
  UserAvatar,
} from '@/components/rakit/ui-primitives'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ArrowUpDown, CalendarDays, CheckCircle2, Circle, MessageSquare, Plus } from 'lucide-react'
import { PRIORITY_RANK, startOfMs } from './shared'

type ListSortKey = 'due' | 'priority' | 'status' | 'created'

export function ListView({
  tasks,
  members,
  canEdit,
  onOpenTask,
  onToggle,
  onCreate,
}: {
  tasks: Task[]
  members: UserInfo[]
  canEdit: boolean
  onOpenTask: (taskId: string) => void
  onToggle: (task: Task) => void
  onCreate: () => void
}) {
  const [q, setQ] = React.useState('')
  const [assignee, setAssignee] = React.useState<string>('all')
  const [priority, setPriority] = React.useState<string>('all')
  const [sortBy, setSortBy] = React.useState<ListSortKey>('due')
  const [dir, setDir] = React.useState<'asc' | 'desc'>('asc')

  const rows = React.useMemo(() => {
    const needle = q.trim().toLowerCase()
    const filtered = tasks.filter((t) => {
      if (needle && !t.title.toLowerCase().includes(needle)) return false
      if (assignee === 'none' && t.assigneeId !== null) return false
      if (assignee !== 'all' && assignee !== 'none' && t.assigneeId !== assignee) return false
      if (priority !== 'all' && t.priority !== priority) return false
      return true
    })
    const mul = dir === 'asc' ? 1 : -1
    return filtered.sort((a, b) => {
      switch (sortBy) {
        case 'due': {
          const av = a.dueDate ? startOfMs(a.dueDate) : Number.POSITIVE_INFINITY
          const bv = b.dueDate ? startOfMs(b.dueDate) : Number.POSITIVE_INFINITY
          return (av - bv) * mul
        }
        case 'priority':
          return (PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]) * mul
        case 'status':
          return (TASK_STATUSES.indexOf(a.status) - TASK_STATUSES.indexOf(b.status)) * mul
        case 'created':
          return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * mul
      }
    })
  }, [tasks, q, assignee, priority, sortBy, dir])

  function headerSort(key: ListSortKey) {
    if (sortBy === key) setDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortBy(key)
      setDir('asc')
    }
  }

  const hasTasks = tasks.length > 0

  return (
    <div>
      {/* toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari judul tugas…"
          aria-label="Cari tugas"
          className="h-8 w-full text-sm sm:w-52"
        />
        <Select value={assignee} onValueChange={setAssignee}>
          <SelectTrigger aria-label="Filter penanggung jawab" className="h-8 w-[168px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua penanggung jawab</SelectItem>
            <SelectItem value="none">Belum ditugaskan</SelectItem>
            {members.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={priority} onValueChange={setPriority}>
          <SelectTrigger aria-label="Filter prioritas" className="h-8 w-[132px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua prioritas</SelectItem>
            {PRIORITIES.map((p) => (
              <SelectItem key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-1.5">
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as ListSortKey)}>
            <SelectTrigger aria-label="Urutkan" className="h-8 w-[120px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="due">Tenggat</SelectItem>
              <SelectItem value="priority">Prioritas</SelectItem>
              <SelectItem value="status">Status</SelectItem>
              <SelectItem value="created">Dibuat</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            aria-label={dir === 'asc' ? 'Urutan menaik' : 'Urutan menurun'}
            onClick={() => setDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
          >
            <ArrowUpDown className={cn('size-3.5 transition-transform', dir === 'desc' && 'rotate-180')} />
          </Button>
        </div>
      </div>

      {!hasTasks ? (
        <EmptyState
          icon={<CalendarDays className="size-8" />}
          title="Belum ada tugas"
          description="Pecah proyek ini menjadi tugas-tugas kecil yang bisa dikerjakan."
          action={
            canEdit ? (
              <Button size="sm" onClick={onCreate}>
                <Plus className="size-3.5" />
                Tugas Baru
              </Button>
            ) : undefined
          }
        />
      ) : rows.length === 0 ? (
        <EmptyState compact title="Tidak ada tugas yang cocok" description="Coba ubah filter atau kata kunci pencarian." />
      ) : (
        <div className="divide-y divide-border border-y border-border">
          {/* header */}
          <div className="flex items-center gap-3 py-2">
            <span className="w-9 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Tugas
            </span>
            <HeaderCell label="Status" active={sortBy === 'status'} onClick={() => headerSort('status')} className="hidden w-24 sm:block" />
            <HeaderCell label="Prioritas" active={sortBy === 'priority'} onClick={() => headerSort('priority')} className="hidden w-24 md:block" />
            <HeaderCell label="Tenggat" active={sortBy === 'due'} onClick={() => headerSort('due')} className="w-24" />
            <span className="hidden w-14 shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted-foreground lg:block">
              Est.
            </span>
            <span className="w-6 shrink-0" aria-hidden />
            <span className="hidden w-32 shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted-foreground xl:block">
              Label
            </span>
            <span className="hidden w-20 shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted-foreground md:block">
              Info
            </span>
          </div>

          {rows.map((task) => {
            const done = task.status === 'DONE'
            const comments = task._count?.comments ?? 0
            const checklistTotal = task._count?.checklist ?? 0
            const checklistDone = task._count?.checklistDone ?? 0
            return (
              <div key={task.id} className="group flex items-center gap-3 py-2.5 transition-colors hover:bg-muted/40">
                <span className="w-9 shrink-0">
                  <button
                    type="button"
                    disabled={!canEdit}
                    onClick={() => onToggle(task)}
                    aria-label={done ? 'Tandai belum selesai' : 'Tandai selesai'}
                    className="flex size-9 items-center justify-center rounded-full text-muted-foreground/40 transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {done ? (
                      <CheckCircle2 className="size-[18px] text-success" />
                    ) : (
                      <Circle className="size-[18px]" />
                    )}
                  </button>
                </span>
                <button
                  type="button"
                  onClick={() => onOpenTask(task.id)}
                  className="min-w-0 flex-1 truncate text-left text-sm font-medium transition-colors hover:text-brand"
                >
                  {task.title}
                </button>
                <span className="hidden w-24 shrink-0 sm:block">
                  <TaskStatusBadge status={task.status} />
                </span>
                <span className="hidden w-24 shrink-0 md:block">
                  <PriorityMark priority={task.priority} />
                </span>
                <span className="w-24 shrink-0">
                  <DueText date={task.dueDate} />
                </span>
                <span className="hidden w-14 shrink-0 font-mono text-[11px] text-muted-foreground lg:block">
                  {task.estimate != null ? formatHours(task.estimate) : '—'}
                </span>
                <span className="w-6 shrink-0">
                  <UserAvatar user={task.assignee} size={20} />
                </span>
                <span className="hidden w-32 shrink-0 gap-1 overflow-hidden xl:flex">
                  {task.labels?.slice(0, 2).map((l) => <LabelChip key={l.id} label={l} />) ?? null}
                </span>
                <span className="hidden w-20 shrink-0 items-center gap-2.5 font-mono text-[10px] text-muted-foreground md:flex">
                  {comments > 0 ? (
                    <span className="inline-flex items-center gap-1">
                      <MessageSquare className="size-3" />
                      {comments}
                    </span>
                  ) : null}
                  {checklistTotal > 0 ? (
                    <span>
                      {checklistDone}/{checklistTotal}
                    </span>
                  ) : null}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function HeaderCell({
  label,
  active,
  onClick,
  className,
}: {
  label: string
  active: boolean
  onClick: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'shrink-0 font-mono text-[10px] uppercase tracking-wider transition-colors',
        active ? 'font-semibold text-foreground' : 'text-muted-foreground hover:text-foreground',
        className,
      )}
    >
      {label}
      {active ? <span className="ml-0.5 text-brand">·</span> : null}
    </button>
  )
}
