import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { parseBody, route } from '@/lib/api-helpers'
import { requireUser } from '@/lib/auth'
import { requireMembership } from '@/lib/permissions'
import { logActivity } from '@/lib/activity'

type Ctx = { params: Promise<{ id: string }> }

const createSchema = z.object({
  name: z.string().trim().min(2, 'Nama proyek minimal 2 karakter.').max(80),
  description: z.string().trim().max(500).optional().or(z.literal('')),
  status: z.enum(['PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED']).default('PLANNING'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#D9481F'),
  startDate: z.string().datetime().nullable().optional(),
  targetDate: z.string().datetime().nullable().optional(),
  memberIds: z.array(z.string()).optional(),
})

/** GET /api/workspaces/:id/projects — list with real task stats. */
export const GET = route(async (_req: NextRequest, ctx: Ctx) => {
  const user = await requireUser()
  const { id } = await ctx.params
  await requireMembership(id, user)

  const projects = await db.project.findMany({
    where: { workspaceId: id },
    include: {
      owner: { select: { id: true, name: true, email: true, avatarColor: true } },
      members: { include: { user: { select: { id: true, name: true, avatarColor: true } } } },
      _count: { select: { tasks: true, milestones: true, documents: true, members: true } },
    },
    orderBy: { updatedAt: 'desc' },
  })

  const tasks = await db.task.groupBy({
    by: ['projectId', 'status'],
    where: { project: { workspaceId: id } },
    _count: { _all: true },
  })

  const statsByProject = new Map<string, { total: number; done: number }>()
  for (const t of tasks) {
    const agg = statsByProject.get(t.projectId) ?? { total: 0, done: 0 }
    agg.total += t._count._all
    if (t.status === 'DONE') agg.done += t._count._all
    statsByProject.set(t.projectId, agg)
  }

  return NextResponse.json({
    projects: projects.map((p) => ({
      ...p,
      taskStats: statsByProject.get(p.id) ?? { total: 0, done: 0 },
      members: p.members.map((m) => ({ id: m.id, role: m.role, user: m.user })),
    })),
  })
})

/** POST /api/workspaces/:id/projects — create (MEMBER+). */
export const POST = route(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireUser()
  const { id } = await ctx.params
  await requireMembership(id, user, 'MEMBER')
  const body = await parseBody(req, createSchema)

  const memberIds = (body.memberIds ?? []).filter((mid) => mid !== user.id)
  const validMembers = memberIds.length
    ? await db.workspaceMember.findMany({ where: { workspaceId: id, userId: { in: memberIds } } })
    : []

  const project = await db.project.create({
    data: {
      workspaceId: id,
      name: body.name,
      description: body.description || null,
      color: body.color,
      status: body.status,
      priority: body.priority,
      startDate: body.startDate ? new Date(body.startDate) : null,
      targetDate: body.targetDate ? new Date(body.targetDate) : null,
      completedAt: body.status === 'COMPLETED' ? new Date() : null,
      ownerId: user.id,
      members: {
        create: [
          { userId: user.id, role: 'LEAD' },
          ...validMembers.map((m) => ({ userId: m.userId, role: 'MEMBER' })),
        ],
      },
    },
    include: { owner: { select: { id: true, name: true, email: true, avatarColor: true } } },
  })

  await logActivity(db, {
    workspaceId: id,
    projectId: project.id,
    userId: user.id,
    type: 'PROJECT_CREATED',
    entityType: 'project',
    entityId: project.id,
    entityTitle: project.name,
  })

  return NextResponse.json({ project }, { status: 201 })
})
