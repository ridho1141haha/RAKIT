import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { ApiError, parseBody, route } from '@/lib/api-helpers'
import { requireUser } from '@/lib/auth'
import { requireProject } from '@/lib/permissions'
import { logActivity, notify } from '@/lib/activity'

type Ctx = { params: Promise<{ id: string }> }

/** GET /api/projects/:id/milestones — with live task stats. */
export const GET = route(async (_req: NextRequest, ctx: Ctx) => {
  const user = await requireUser()
  const { id } = await ctx.params
  await requireProject(id, user)

  const milestones = await db.milestone.findMany({
    where: { projectId: id },
    orderBy: [{ completed: 'asc' }, { targetDate: 'asc' }],
  })
  const tasks = await db.task.groupBy({
    by: ['milestoneId', 'status'],
    where: { projectId: id, milestoneId: { not: null } },
    _count: { _all: true },
  })

  return NextResponse.json({
    milestones: milestones.map((m) => {
      const rows = tasks.filter((t) => t.milestoneId === m.id)
      const total = rows.reduce((acc, r) => acc + r._count._all, 0)
      const done = rows.filter((r) => r.status === 'DONE').reduce((acc, r) => acc + r._count._all, 0)
      return { ...m, taskStats: { total, done } }
    }),
  })
})

const schema = z.object({
  name: z.string().trim().min(2, 'Nama milestone minimal 2 karakter.').max(100),
  description: z.string().trim().max(500).optional().or(z.literal('')),
  targetDate: z.string().datetime().nullable().optional(),
})

/** POST /api/projects/:id/milestones — MEMBER+. */
export const POST = route(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireUser()
  const { id } = await ctx.params
  const { project } = await requireProject(id, user, 'MEMBER')
  const body = await parseBody(req, schema)

  const milestone = await db.milestone.create({
    data: {
      projectId: id,
      name: body.name,
      description: body.description || null,
      targetDate: body.targetDate ? new Date(body.targetDate) : null,
    },
  })

  await logActivity(db, {
    workspaceId: project.workspaceId, projectId: id, userId: user.id,
    type: 'MILESTONE_CREATED', entityType: 'milestone', entityId: milestone.id, entityTitle: milestone.name,
  })

  return NextResponse.json({ milestone }, { status: 201 })
})
