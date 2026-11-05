import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { ApiError, parseBody, route } from '@/lib/api-helpers'
import { requireUser } from '@/lib/auth'
import { requireTask } from '@/lib/permissions'
import { logActivity, notify } from '@/lib/activity'
import { TASK_STATUS_LABEL, type TaskStatus } from '@/lib/constants'

type Ctx = { params: Promise<{ id: string }> }

/** GET /api/tasks/:id — task with checklist + comments. */
export const GET = route(async (_req: NextRequest, ctx: Ctx) => {
  const user = await requireUser()
  const { id } = await ctx.params
  await requireTask(id, user)

  const task = await db.task.findUnique({
    where: { id },
    include: {
      assignee: { select: { id: true, name: true, email: true, avatarColor: true } },
      creator: { select: { id: true, name: true, email: true, avatarColor: true } },
      labels: { include: { label: true } },
      checklist: { orderBy: { position: 'asc' } },
      comments: {
        include: { user: { select: { id: true, name: true, avatarColor: true } } },
        orderBy: { createdAt: 'asc' },
      },
      milestone: { select: { id: true, name: true } },
    },
  })
  if (!task) throw new ApiError(404, 'Tugas tidak ditemukan.')

  return NextResponse.json({
    task: {
      ...task,
      labels: task.labels.map((tl) => ({ id: tl.label.id, name: tl.label.name, color: tl.label.color })),
    },
  })
})

const patchSchema = z.object({
  title: z.string().trim().min(2).max(140).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  status: z.enum(['BACKLOG', 'TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  assigneeId: z.string().nullable().optional(),
  milestoneId: z.string().nullable().optional(),
  startDate: z.string().datetime().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  estimate: z.number().min(0).max(1000).nullable().optional(),
  position: z.number().int().min(0).optional(),
  labelIds: z.array(z.string()).optional(),
})

/**
 * PATCH /api/tasks/:id — the workhorse: field edits AND kanban drag persistence
 * (status + position). Side effects: completion timestamps, activity, assignee
 * notifications. All inside one transaction.
 */
export const PATCH = route(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireUser()
  const { id } = await ctx.params
  const { task: existing, membership } = await requireTask(id, user, 'MEMBER')
  const body = await parseBody(req, patchSchema)

  const wasDone = existing.status === 'DONE'
  const nowDone = body.status ? body.status === 'DONE' : wasDone

  // Validate referential integrity for cross-entity changes.
  if (body.assigneeId) {
    const member = await db.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: existing.project.workspaceId, userId: body.assigneeId } },
    })
    if (!member) throw new ApiError(400, 'Assignee bukan anggota workspace.')
  }
  if (body.milestoneId) {
    const ms = await db.milestone.findUnique({ where: { id: body.milestoneId } })
    if (!ms || ms.projectId !== existing.projectId) throw new ApiError(400, 'Milestone tidak valid.')
  }

  const result = await db.$transaction(async (tx) => {
    // ── labels sync ──
    if (body.labelIds) {
      await tx.taskLabel.deleteMany({ where: { taskId: id } })
      if (body.labelIds.length) {
        await tx.taskLabel.createMany({ data: body.labelIds.map((labelId) => ({ taskId: id, labelId })) })
      }
    }

    const updated = await tx.task.update({
      where: { id },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.description !== undefined ? { description: body.description || null } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.priority !== undefined ? { priority: body.priority } : {}),
        ...(body.assigneeId !== undefined ? { assigneeId: body.assigneeId || null } : {}),
        ...(body.milestoneId !== undefined ? { milestoneId: body.milestoneId || null } : {}),
        ...(body.startDate !== undefined ? { startDate: body.startDate ? new Date(body.startDate) : null } : {}),
        ...(body.dueDate !== undefined ? { dueDate: body.dueDate ? new Date(body.dueDate) : null } : {}),
        ...(body.estimate !== undefined ? { estimate: body.estimate } : {}),
        ...(body.position !== undefined ? { position: body.position } : {}),
        completedAt: nowDone ? (wasDone ? existing.completedAt : new Date()) : null,
      },
      include: {
        assignee: { select: { id: true, name: true, email: true, avatarColor: true } },
        creator: { select: { id: true, name: true, email: true, avatarColor: true } },
        labels: { include: { label: true } },
        _count: { select: { comments: true, checklist: true } },
      },
    })
    return updated
  })

  // ── side effects (activity + notifications) ──
  const changes: string[] = []
  if (body.status && body.status !== existing.status) {
    changes.push(`status → ${TASK_STATUS_LABEL[body.status as TaskStatus]}`)
  }
  if (body.title && body.title !== existing.title) changes.push('judul diperbarui')
  if (body.priority && body.priority !== existing.priority) changes.push('prioritas diperbarui')
  if (body.dueDate !== undefined) changes.push('tenggat diperbarui')
  if (body.description !== undefined) changes.push('deskripsi diperbarui')

  if (body.status && body.status !== existing.status) {
    if (body.status === 'DONE') {
      await logActivity(db, {
        workspaceId: existing.project.workspaceId, projectId: existing.projectId, userId: user.id,
        type: 'TASK_COMPLETED', entityType: 'task', entityId: id, entityTitle: result.title,
      })
    } else {
      await logActivity(db, {
        workspaceId: existing.project.workspaceId, projectId: existing.projectId, userId: user.id,
        type: 'TASK_REOPENED', entityType: 'task', entityId: id, entityTitle: result.title,
        metadata: { detail: `status → ${TASK_STATUS_LABEL[body.status as TaskStatus]}` },
      })
    }
  } else if (body.position !== undefined && !changes.length) {
    await logActivity(db, {
      workspaceId: existing.project.workspaceId, projectId: existing.projectId, userId: user.id,
      type: 'TASK_MOVED', entityType: 'task', entityId: id, entityTitle: result.title,
      metadata: body.status ? { detail: `→ ${TASK_STATUS_LABEL[body.status as TaskStatus]}` } : undefined,
    })
  } else if (changes.length) {
    await logActivity(db, {
      workspaceId: existing.project.workspaceId, projectId: existing.projectId, userId: user.id,
      type: 'TASK_UPDATED', entityType: 'task', entityId: id, entityTitle: result.title,
      metadata: { detail: changes.join(' · ') },
    })
  }

  if (body.assigneeId !== undefined && body.assigneeId !== existing.assigneeId) {
    await logActivity(db, {
      workspaceId: existing.project.workspaceId, projectId: existing.projectId, userId: user.id,
      type: 'TASK_ASSIGNED', entityType: 'task', entityId: id, entityTitle: result.title,
      metadata: body.assigneeId ? { assignee: result.assignee?.name } : { assignee: null },
    })
    if (body.assigneeId && body.assigneeId !== user.id) {
      await notify(db, {
        userIds: [body.assigneeId],
        type: 'TASK_ASSIGNED',
        title: `Kamu ditugaskan: ${result.title}`,
        body: `${existing.project.name} · oleh ${user.name}`,
        link: `project:${existing.projectId}?task=${id}`,
        dedupeKey: `task-assigned:${id}:${body.assigneeId}`,
      })
    }
  }

  return NextResponse.json({
    task: {
      ...result,
      labels: result.labels.map((tl) => ({ id: tl.label.id, name: tl.label.name, color: tl.label.color })),
      _count: { ...result._count, checklistDone: undefined },
    },
  })
})

/** DELETE /api/tasks/:id — MEMBER+. */
export const DELETE = route(async (_req: NextRequest, ctx: Ctx) => {
  const user = await requireUser()
  const { id } = await ctx.params
  const { task } = await requireTask(id, user, 'MEMBER')
  await db.task.delete({ where: { id } })
  await logActivity(db, {
    workspaceId: task.project.workspaceId, projectId: task.projectId, userId: user.id,
    type: 'TASK_DELETED', entityType: 'task', entityId: null, entityTitle: task.title,
  })
  return NextResponse.json({ ok: true })
})
