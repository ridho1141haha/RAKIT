import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { ApiError, parseBody, route } from '@/lib/api-helpers'
import { requireUser } from '@/lib/auth'
import { requireProject } from '@/lib/permissions'
import { logActivity, notify } from '@/lib/activity'
import type { TaskStatus } from '@/lib/constants'

type Ctx = { params: Promise<{ id: string }> }

const taskInclude = {
  assignee: { select: { id: true, name: true, email: true, avatarColor: true } },
  creator: { select: { id: true, name: true, email: true, avatarColor: true } },
  labels: { include: { label: true } },
  _count: { select: { comments: true, checklist: true } },
} as const

/** GET /api/projects/:id/tasks — all tasks incl. checklist aggregates. */
export const GET = route(async (_req: NextRequest, ctx: Ctx) => {
  const user = await requireUser()
  const { id } = await ctx.params
  await requireProject(id, user)

  const [tasks, checklistAgg] = await Promise.all([
    db.task.findMany({
      where: { projectId: id },
      include: taskInclude,
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    }),
    db.checklistItem.groupBy({
      by: ['taskId', 'done'],
      where: { task: { projectId: id } },
      _count: { _all: true },
    }),
  ])

  const doneBy = new Map<string, number>()
  const totalBy = new Map<string, number>()
  for (const c of checklistAgg) {
    totalBy.set(c.taskId, (totalBy.get(c.taskId) ?? 0) + c._count._all)
    if (c.done) doneBy.set(c.taskId, c._count._all)
  }

  return NextResponse.json({
    tasks: tasks.map((t) => ({
      ...t,
      labels: t.labels.map((tl) => ({ id: tl.label.id, name: tl.label.name, color: tl.label.color })),
      _count: {
        comments: t._count.comments,
        checklist: t._count.checklist,
        checklistDone: doneBy.get(t.id) ?? 0,
      },
      checklistTotal: totalBy.get(t.id) ?? 0,
    })),
  })
})

const createSchema = z.object({
  title: z.string().trim().min(2, 'Judul tugas minimal 2 karakter.').max(140),
  description: z.string().trim().max(2000).optional().or(z.literal('')),
  status: z.enum(['BACKLOG', 'TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE']).default('BACKLOG'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  assigneeId: z.string().nullable().optional(),
  milestoneId: z.string().nullable().optional(),
  startDate: z.string().datetime().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  estimate: z.number().min(0).max(1000).nullable().optional(),
  labelIds: z.array(z.string()).optional(),
})

/** POST /api/projects/:id/tasks — create (MEMBER+). */
export const POST = route(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireUser()
  const { id } = await ctx.params
  const { project } = await requireProject(id, user, 'MEMBER')
  const body = await parseBody(req, createSchema)

  const last = await db.task.findFirst({
    where: { projectId: id, status: body.status },
    orderBy: { position: 'desc' },
    select: { position: true },
  })

  // validate assignee/milestone belong to this project/workspace
  if (body.assigneeId) {
    const member = await db.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: project.workspaceId, userId: body.assigneeId } },
    })
    if (!member) throw new ApiError(400, 'Assignee bukan anggota workspace.')
  }
  if (body.milestoneId) {
    const ms = await db.milestone.findUnique({ where: { id: body.milestoneId } })
    if (!ms || ms.projectId !== id) throw new ApiError(400, 'Milestone tidak valid.')
  }

  const created = await db.task.create({
    data: {
      projectId: id,
      title: body.title,
      description: body.description || null,
      status: body.status,
      priority: body.priority,
      assigneeId: body.assigneeId || null,
      milestoneId: body.milestoneId || null,
      startDate: body.startDate ? new Date(body.startDate) : null,
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      estimate: body.estimate ?? null,
      position: (last?.position ?? -1) + 1,
      createdById: user.id,
      completedAt: body.status === 'DONE' ? new Date() : null,
      ...(body.labelIds?.length
        ? { labels: { create: body.labelIds.map((labelId) => ({ labelId })) } }
        : {}),
    },
    include: taskInclude,
  })

  await logActivity(db, {
    workspaceId: project.workspaceId,
    projectId: id,
    userId: user.id,
    type: 'TASK_CREATED',
    entityType: 'task',
    entityId: created.id,
    entityTitle: created.title,
  })

  if (created.assigneeId && created.assigneeId !== user.id) {
    await notify(db, {
      userIds: [created.assigneeId],
      type: 'TASK_ASSIGNED',
      title: `Tugas baru untukmu: ${created.title}`,
      body: `${project.name} · oleh ${user.name}`,
      link: `project:${id}?task=${created.id}`,
      dedupeKey: `task-assigned:${created.id}:${created.assigneeId}`,
    })
    await logActivity(db, {
      workspaceId: project.workspaceId,
      projectId: id,
      userId: user.id,
      type: 'TASK_ASSIGNED',
      entityType: 'task',
      entityId: created.id,
      entityTitle: created.title,
      metadata: { assignee: created.assignee?.name },
    })
  }

  return NextResponse.json(
    {
      task: {
        ...created,
        labels: created.labels.map((tl) => ({ id: tl.label.id, name: tl.label.name, color: tl.label.color })),
        _count: { comments: created._count.comments, checklist: created._count.checklist, checklistDone: 0 },
      },
    },
    { status: 201 },
  )
})
