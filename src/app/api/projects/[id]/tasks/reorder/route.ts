import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { ApiError, conflict, parseBody, route } from '@/lib/api-helpers'
import { requireUser } from '@/lib/auth'
import { requireProject } from '@/lib/permissions'
import { logActivity } from '@/lib/activity'
import { TASK_STATUS_LABEL, type TaskStatus } from '@/lib/constants'

type Ctx = { params: Promise<{ id: string }> }

/**
 * PATCH /api/projects/:id/tasks/reorder — batch kanban persistence (P1.1).
 *
 * The client submits the FULL, post-drop task ordering of every affected
 * column. The server verifies each submitted column exactly matches the set
 * of tasks currently in that status (staleness → 409), then persists all
 * position (and status) changes in ONE transaction. Columns the client did
 * not submit are untouched, so their ordering is preserved.
 *
 * Request shape (illustrative contract from the engineering brief):
 * {
 *   "columns": [
 *     { "status": "TODO",        "taskIds": ["task-a", "task-b"] },
 *     { "status": "IN_PROGRESS", "taskIds": ["task-c", "task-d"] }
 *   ],
 *   "movedTaskId": "task-c"          // optional — for the activity record
 * }
 */
const reorderSchema = z
  .object({
    columns: z
      .array(
        z.object({
          status: z.enum(['BACKLOG', 'TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE']),
          taskIds: z.array(z.string().min(1)),
        }),
      )
      .min(1, 'Minimal satu kolom harus dikirim.')
      .max(5),
    movedTaskId: z.string().min(1).optional(),
  })
  .superRefine((body, ctx) => {
    // Duplicate task IDs — across the whole payload — would make the write
    // order ambiguous. Reject instead of silently picking a winner.
    const seen = new Set<string>()
    for (const col of body.columns) {
      for (const id of col.taskIds) {
        if (seen.has(id)) {
          ctx.addIssue({ code: 'custom', message: 'ID tugas duplikat dalam payload reorder.' })
          return
        }
        seen.add(id)
      }
    }
    // A status may appear at most once.
    const statuses = new Set(body.columns.map((c) => c.status))
    if (statuses.size !== body.columns.length) {
      ctx.addIssue({ code: 'custom', message: 'Status kolom duplikat dalam payload reorder.' })
    }
  })

export const PATCH = route(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireUser()
  const { id } = await ctx.params
  const { project } = await requireProject(id, user, 'MEMBER')
  const body = await parseBody(req, reorderSchema)

  const movedTaskId = body.movedTaskId
  if (movedTaskId && !body.columns.some((c) => c.taskIds.includes(movedTaskId))) {
    throw new ApiError(400, 'movedTaskId tidak ada di dalam payload kolom.')
  }

  const result = await db.$transaction(async (tx) => {
    // Load the project's tasks as they are RIGHT NOW, inside the transaction.
    const current = await tx.task.findMany({
      where: { projectId: id },
      select: { id: true, status: true, position: true, title: true },
    })
    const byId = new Map(current.map((t) => [t.id, t]))

    const moved = movedTaskId ? byId.get(movedTaskId) : undefined
    if (movedTaskId && !moved) {
      throw new ApiError(400, 'movedTaskId tidak valid untuk proyek ini.')
    }
    // The column the payload assigns the moved task to (its new status).
    const movedTargetStatus = moved
      ? body.columns.find((c) => c.taskIds.includes(moved.id))?.status
      : undefined

    for (const col of body.columns) {
      for (const taskId of col.taskIds) {
        const task = byId.get(taskId)
        if (!task) {
          // Not in this project → cross-project manipulation attempt or stale.
          throw new ApiError(400, 'Tugas tidak valid untuk proyek ini.')
        }
        const isMoved = moved != null && task.id === moved.id
        // A non-moved task can only appear in the column it currently lives in;
        // the moved task may appear in its new column only.
        if (task.status !== col.status && !isMoved) {
          // Client's snapshot is stale (task moved elsewhere meanwhile).
          throw conflict('Urutan papan sudah berubah. Muat ulang lalu coba lagi.')
        }
        if (isMoved && col.status !== movedTargetStatus) {
          throw new ApiError(400, 'Tugas yang dipindah muncul di lebih dari satu kolom.')
        }
      }
    }

    // Completeness: for every submitted status, the submitted list must equal
    // the tasks currently in that status, adjusted for the moved task
    // (removed from its source column, added to its target column). Otherwise
    // positions of unsubmitted tasks in the same column would be silently lost.
    for (const col of body.columns) {
      const expected = new Set(
        current.filter((t) => t.status === col.status).map((t) => t.id),
      )
      if (moved) {
        if (col.status === moved.status) expected.delete(moved.id) // source column
        if (col.status === movedTargetStatus) expected.add(moved.id) // target column
      }
      const submitted = new Set(col.taskIds)
      const same =
        expected.size === submitted.size && [...expected].every((tid) => submitted.has(tid))
      if (!same) {
        throw conflict('Urutan papan sudah berubah. Muat ulang lalu coba lagi.')
      }
    }

    // Persist: sequential positions per column; status only changes for tasks
    // whose column assignment differs from their current status (cross-column).
    let movedTitle: string | null = null
    let movedFrom: TaskStatus | null = null
    let movedTo: TaskStatus | null = null
    let reorderedCount = 0

    for (const col of body.columns) {
      for (let i = 0; i < col.taskIds.length; i++) {
        const task = byId.get(col.taskIds[i])!
        const data: { position: number; status?: string } = { position: i }
        if (task.status !== col.status) data.status = col.status
        await tx.task.update({ where: { id: task.id }, data })
        reorderedCount++
        if (moved && task.id === moved.id) {
          movedTitle = task.title
          movedFrom = task.status as TaskStatus
          movedTo = col.status
        }
      }
    }

    return { movedTitle, movedFrom, movedTo, reorderedCount }
  })

  // ── activity: one meaningful event per reorder action ──
  const detail = movedTaskId
    ? `→ ${TASK_STATUS_LABEL[(result.movedTo ?? 'TODO') as TaskStatus]}`
    : `${result.reorderedCount} tugas diurutkan ulang`
  await logActivity(db, {
    workspaceId: project.workspaceId,
    projectId: id,
    userId: user.id,
    type: movedTaskId ? 'TASK_MOVED' : 'TASK_REORDERED',
    entityType: 'task',
    entityId: movedTaskId ?? null,
    entityTitle: result.movedTitle,
    metadata: { detail },
  })

  return NextResponse.json({ ok: true })
})
