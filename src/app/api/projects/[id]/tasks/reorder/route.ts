import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { ApiError, parseBody, route } from '@/lib/api-helpers'
import { requireUser } from '@/lib/auth'
import { requireProject } from '@/lib/permissions'
import { logActivity } from '@/lib/activity'
import { TASK_STATUS_LABEL, type TaskStatus } from '@/lib/constants'

type Ctx = { params: Promise<{ id: string }> }

/**
 * POST /api/projects/:id/tasks/reorder — kanban drag persistence (MEMBER+).
 *
 * The client sends the COMPLETE ordered task-id list for every affected column
 * (source column(s) of a drag, target column). The server:
 *   1. validates that every submitted task id belongs to THIS project
 *      (also rejects duplicates within the payload),
 *   2. inside ONE transaction, rewrites the ordering of every affected column:
 *      submitted order first, then any DB task missing from the payload appended
 *      (so concurrent creations are never orphaned),
 *   3. only writes tasks whose status/position actually changed,
 *   4. maintains completedAt for DONE transitions.
 *
 * Compact 0..n-1 positions per column make the state self-healing: gaps and
 * duplicates from earlier writes are normalized away on the next reorder.
 * SQLite serializes writers, so the transaction is the concurrency boundary.
 */

const columnSchema = z.object({
  status: z.enum(['BACKLOG', 'TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE']),
  taskIds: z.array(z.string()).max(500),
})

const bodySchema = z.object({
  movedTaskId: z.string().optional(),
  columns: z.array(columnSchema).min(1).max(5),
})

export const POST = route(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireUser()
  const { id } = await ctx.params
  const { project } = await requireProject(id, user, 'MEMBER')
  const body = await parseBody(req, bodySchema)

  // Payload sanity: a column appears at most once; ids are unique across columns.
  const seenStatuses = new Set<string>()
  for (const col of body.columns) {
    if (seenStatuses.has(col.status)) throw new ApiError(400, 'Kolom dikirim dua kali pada reorder.')
    seenStatuses.add(col.status)
  }
  const allIds = body.columns.flatMap((c) => c.taskIds)
  const idSet = new Set(allIds)
  if (idSet.size !== allIds.length) throw new ApiError(400, 'ID tugas duplikat pada reorder.')

  const txResult = await db.$transaction(async (tx) => {
    const current = await tx.task.findMany({
      where: { projectId: id },
      select: { id: true, status: true, position: true, completedAt: true },
    })
    const byId = new Map(current.map((t) => [t.id, t]))

    // Every submitted id must belong to THIS project — no cross-project leakage.
    for (const tid of idSet) {
      if (!byId.has(tid)) throw new ApiError(400, 'Tugas tidak valid untuk proyek ini.')
    }

    // Final ordering per affected column: payload first, then DB leftovers (stable).
    const finalState = new Map<string, { status: string; position: number }>()
    for (const col of body.columns) {
      const payloadSet = new Set(col.taskIds)
      const leftovers = current
        .filter((t) => t.status === col.status && !payloadSet.has(t.id))
        .sort((a, b) => a.position - b.position)
        .map((t) => t.id)
      ;[...col.taskIds, ...leftovers].forEach((tid, index) => {
        finalState.set(tid, { status: col.status, position: index })
      })
    }

    // Diff against current state; only persist actual changes.
    const updates: Array<{ id: string; status?: string; position: number; completedAt?: Date | null }> = []
    for (const t of current) {
      const next = finalState.get(t.id)
      if (!next) continue
      if (next.status === t.status && next.position === t.position) continue
      const wasDone = t.status === 'DONE'
      const nowDone = next.status === 'DONE'
      updates.push({
        id: t.id,
        position: next.position,
        ...(next.status !== t.status ? { status: next.status } : {}),
        ...(nowDone && !wasDone ? { completedAt: new Date() } : {}),
        ...(wasDone && !nowDone ? { completedAt: null } : {}),
        // self-heal legacy rows sitting in DONE without a timestamp
        ...(nowDone && wasDone && !t.completedAt ? { completedAt: new Date() } : {}),
      })
    }

    for (const u of updates) {
      await tx.task.update({
        where: { id: u.id },
        data: {
          ...(u.status !== undefined ? { status: u.status } : {}),
          position: u.position,
          ...(u.completedAt !== undefined ? { completedAt: u.completedAt } : {}),
        },
      })
    }

    const moved = body.movedTaskId ? byId.get(body.movedTaskId) : undefined
    return {
      applied: updates.length,
      movedBefore: moved?.status,
      movedAfter: body.movedTaskId ? finalState.get(body.movedTaskId)?.status : undefined,
    }
  })

  // ── side effects (outside the tx) ──
  if (body.movedTaskId && txResult.movedAfter) {
    const movedTask = await db.task.findUnique({
      where: { id: body.movedTaskId },
      select: { id: true, title: true, status: true },
    })
    if (movedTask) {
      const before = txResult.movedBefore
      const after = txResult.movedAfter
      if (before !== after) {
        if (after === 'DONE') {
          await logActivity(db, {
            workspaceId: project.workspaceId, projectId: id, userId: user.id,
            type: 'TASK_COMPLETED', entityType: 'task', entityId: movedTask.id, entityTitle: movedTask.title,
          })
        } else {
          await logActivity(db, {
            workspaceId: project.workspaceId, projectId: id, userId: user.id,
            type: 'TASK_REOPENED', entityType: 'task', entityId: movedTask.id, entityTitle: movedTask.title,
            metadata: { detail: `status → ${TASK_STATUS_LABEL[after as TaskStatus]}` },
          })
        }
      } else if (before) {
        await logActivity(db, {
          workspaceId: project.workspaceId, projectId: id, userId: user.id,
          type: 'TASK_MOVED', entityType: 'task', entityId: movedTask.id, entityTitle: movedTask.title,
          metadata: { detail: `urutan diperbarui di ${TASK_STATUS_LABEL[before as TaskStatus]}` },
        })
      }
    }
  }

  return NextResponse.json({ ok: true, applied: txResult.applied })
})
