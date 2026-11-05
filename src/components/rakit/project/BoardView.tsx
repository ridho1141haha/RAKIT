'use client'

/**
 * BoardView — Kanban with 5 status columns and native HTML5 drag & drop.
 * Drop position is computed from pointer Y against card midpoints; the move is
 * applied optimistically, then persisted with PATCH /api/tasks/:id { status, position }.
 * Keyboard fallback: per-card "Pindah ke →" menu (same PATCH contract).
 */

import * as React from 'react'
import { cn } from '@/lib/utils'
import { useRakit } from '@/components/rakit/store'
import { apiPatch } from '@/components/rakit/api-client'
import type { Task, TaskStatus } from '@/components/rakit/types'
import { TASK_STATUSES, TASK_STATUS_LABEL } from '@/lib/constants'
import { formatHours } from '@/components/rakit/format'
import { DueText, LabelChip, PriorityMark, UserAvatar } from '@/components/rakit/ui-primitives'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from '@/hooks/use-toast'
import { ArrowRightLeft, MessageSquare, Plus } from 'lucide-react'
import { errMessage } from './shared'

export function BoardView({
  tasks,
  setTasks,
  canEdit,
  onOpenTask,
  onCreate,
}: {
  tasks: Task[]
  setTasks: (updater: (prev: Task[]) => Task[]) => void
  canEdit: boolean
  onOpenTask: (taskId: string) => void
  onCreate: (status: TaskStatus) => void
}) {
  const bump = useRakit((s) => s.bumpDataVersion)

  const [draggingId, setDraggingId] = React.useState<string | null>(null)
  const draggingRef = React.useRef<string | null>(null)
  const [drop, setDrop] = React.useState<{ status: TaskStatus; index: number } | null>(null)
  const bodyRefs = React.useRef<Partial<Record<TaskStatus, HTMLDivElement | null>>>({})

  function clearDrag() {
    draggingRef.current = null
    setDraggingId(null)
    setDrop(null)
  }

  /** Reassign status + sequential positions locally (optimistic reorder). */
  function applyMove(all: Task[], dragId: string, status: TaskStatus, index: number): Task[] {
    const moved = all.find((t) => t.id === dragId)
    if (!moved) return all
    const others = all.filter((t) => t.status === status && t.id !== dragId)
    const patch = new Map<string, { status?: TaskStatus; position: number }>()
    others.forEach((t, i) => patch.set(t.id, { position: i < index ? i : i + 1 }))
    patch.set(dragId, { status, position: index })
    return all.map((t) => {
      const p = patch.get(t.id)
      return p ? { ...t, status: p.status ?? t.status, position: p.position } : t
    })
  }

  /** Optimistic move + PATCH { status, position }; failure → toast + refetch revert. */
  function moveTask(dragId: string, status: TaskStatus, index: number) {
    const task = tasks.find((t) => t.id === dragId)
    if (!task) return
    const curIndex = tasks.filter((t) => t.status === task.status).findIndex((t) => t.id === dragId)
    if (task.status === status && index === curIndex) return // no-op
    setTasks((prev) => applyMove(prev, dragId, status, index))
    apiPatch(`/api/tasks/${dragId}`, { status, position: index })
      .then(() => bump())
      .catch((e: unknown) => {
        toast({ title: 'Gagal memindahkan tugas', description: errMessage(e), variant: 'destructive' })
        bump() // refetch reverts optimistic state
      })
  }

  function handleDragStart(e: React.DragEvent, taskId: string) {
    if (!canEdit) {
      e.preventDefault()
      return
    }
    draggingRef.current = taskId
    setDraggingId(taskId)
    e.dataTransfer.setData('text/plain', taskId)
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDragOver(e: React.DragEvent, status: TaskStatus) {
    if (!draggingRef.current) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const body = bodyRefs.current[status]
    if (!body) return
    // insertion index = first card whose midpoint is below the pointer
    const cards = Array.from(body.querySelectorAll<HTMLElement>('[data-task-id]')).filter(
      (el) => el.dataset.taskId !== draggingRef.current,
    )
    let index = cards.length
    for (let i = 0; i < cards.length; i++) {
      const r = cards[i].getBoundingClientRect()
      if (e.clientY < r.top + r.height / 2) {
        index = i
        break
      }
    }
    setDrop((prev) => (prev && prev.status === status && prev.index === index ? prev : { status, index }))
  }

  function handleDrop(status: TaskStatus) {
    const id = draggingRef.current
    const d = drop
    clearDrag()
    if (!id || !d || d.status !== status) return
    moveTask(id, status, d.index)
  }

  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10">
      <div className="flex items-start gap-4">
        {TASK_STATUSES.map((status) => {
          const colTasks = tasks.filter((t) => t.status === status)
          // visible cards exclude the one being dragged (drop index refers to this array)
          const visible = colTasks.filter((t) => t.id !== draggingId)
          const isTargetCol = drop !== null && drop.status === status && draggingId !== null
          const endIndicator = isTargetCol && drop !== null && drop.index >= visible.length
          return (
            <section
              key={status}
              className="flex w-[272px] min-w-[272px] shrink-0 flex-col"
              aria-label={`Kolom ${TASK_STATUS_LABEL[status]}`}
            >
              <div className="flex items-center justify-between gap-2 px-1 pb-2">
                <span className="kicker">
                  {TASK_STATUS_LABEL[status]}
                  <span className="ml-1.5 font-mono text-foreground/60">{colTasks.length}</span>
                </span>
                {canEdit ? (
                  <button
                    type="button"
                    onClick={() => onCreate(status)}
                    className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    aria-label={`Tambah tugas di ${TASK_STATUS_LABEL[status]}`}
                  >
                    <Plus className="size-3.5" />
                  </button>
                ) : null}
              </div>
              <div
                ref={(el) => {
                  bodyRefs.current[status] = el
                }}
                onDragOver={(e) => handleDragOver(e, status)}
                onDragLeave={(e) => {
                  const body = bodyRefs.current[status]
                  if (body && e.relatedTarget instanceof Node && body.contains(e.relatedTarget)) return
                  setDrop(null)
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  handleDrop(status)
                }}
                className="min-h-24 flex-1 space-y-2 rounded-lg bg-muted/40 p-2"
              >
                {colTasks.length === 0 ? (
                  <p className="py-6 text-center text-xs text-muted-foreground/50">Kosong</p>
                ) : null}
                {visible.map((task, i) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    canEdit={canEdit}
                    dragging={draggingId === task.id}
                    dropBefore={isTargetCol && drop !== null && drop.index === i}
                    onOpen={() => onOpenTask(task.id)}
                    onMove={(next) =>
                      moveTask(task.id, next, tasks.filter((t) => t.status === next).length)
                    }
                    onDragStart={(e) => handleDragStart(e, task.id)}
                    onDragEnd={clearDrag}
                  />
                ))}
                {endIndicator ? <div aria-hidden className="h-0.5 rounded-full bg-brand" /> : null}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}

function TaskCard({
  task,
  canEdit,
  dragging,
  dropBefore,
  onOpen,
  onMove,
  onDragStart,
  onDragEnd,
}: {
  task: Task
  canEdit: boolean
  dragging: boolean
  dropBefore: boolean
  onOpen: () => void
  onMove: (status: TaskStatus) => void
  onDragStart: (e: React.DragEvent) => void
  onDragEnd: () => void
}) {
  const checklistTotal = task._count?.checklist ?? 0
  const checklistDone = task._count?.checklistDone ?? 0
  const comments = task._count?.comments ?? 0

  return (
    <article
      data-task-id={task.id}
      draggable={canEdit}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        'cursor-grab rounded-lg border border-border bg-card p-3 text-left shadow-none transition-colors hover:border-foreground/25 active:cursor-grabbing',
        !canEdit && 'cursor-default',
        dragging && 'opacity-50',
        dropBefore && 'drop-above',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <PriorityMark priority={task.priority} />
        <DueText date={task.dueDate} />
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation() // title click must not interfere with drag handlers
          onOpen()
        }}
        className="mt-1.5 block w-full text-left text-sm font-medium leading-snug transition-colors hover:text-brand"
      >
        {task.title}
      </button>
      {task.labels && task.labels.length > 0 ? (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {task.labels.slice(0, 2).map((l) => (
            <LabelChip key={l.id} label={l} />
          ))}
        </div>
      ) : null}
      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5 font-mono text-[10px] text-muted-foreground">
          {task.estimate != null ? <span>{formatHours(task.estimate)}</span> : null}
          {comments > 0 ? (
            <span className="inline-flex items-center gap-1" title={`${comments} komentar`}>
              <MessageSquare className="size-3" />
              {comments}
            </span>
          ) : null}
          {checklistTotal > 0 ? (
            <span title="Progres checklist">
              {checklistDone}/{checklistTotal}
            </span>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {canEdit ? <CardMoveMenu status={task.status} onMove={onMove} /> : null}
          <UserAvatar user={task.assignee} size={20} />
        </div>
      </div>
    </article>
  )
}

/** Keyboard-accessible alternative to dragging: "Pindah ke →". */
function CardMoveMenu({ status, onMove }: { status: TaskStatus; onMove: (status: TaskStatus) => void }) {
  const others = TASK_STATUSES.filter((s) => s !== status)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="flex size-5 items-center justify-center rounded text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Pindahkan tugas ke kolom lain"
        >
          <ArrowRightLeft className="size-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-36">
        <div className="px-2 py-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Pindah ke
        </div>
        {others.map((s) => (
          <DropdownMenuItem key={s} onSelect={() => onMove(s)}>
            {TASK_STATUS_LABEL[s]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
