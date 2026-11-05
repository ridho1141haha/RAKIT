import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { parseBody, route } from '@/lib/api-helpers'
import { requireUser } from '@/lib/auth'
import { requireProject } from '@/lib/permissions'
import { logActivity, notify } from '@/lib/activity'
import { PROJECT_STATUS_LABEL, type ProjectStatus } from '@/lib/constants'

type Ctx = { params: Promise<{ id: string }> }

/** GET /api/projects/:id — full detail for the project page. */
export const GET = route(async (_req: NextRequest, ctx: Ctx) => {
  const user = await requireUser()
  const { id } = await ctx.params
  const { project, membership } = await requireProject(id, user)

  const full = await db.project.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, name: true, email: true, avatarColor: true } },
      members: { include: { user: { select: { id: true, name: true, email: true, avatarColor: true } } }, orderBy: { createdAt: 'asc' } },
      milestones: { orderBy: [{ completed: 'asc' }, { targetDate: 'asc' }] },
      _count: { select: { tasks: true, documents: true } },
    },
  })

  const tasks = await db.task.findMany({
    where: { projectId: id },
    select: { status: true, dueDate: true },
  })
  const done = tasks.filter((t) => t.status === 'DONE').length
  const overdue = tasks.filter((t) => t.status !== 'DONE' && t.dueDate && t.dueDate < new Date()).length

  return NextResponse.json({
    project: {
      ...full,
      members: full!.members.map((m) => ({ id: m.id, role: m.role, user: m.user })),
    },
    taskStats: {
      total: tasks.length,
      done,
      overdue,
      progress: tasks.length === 0 ? 0 : Math.round((done / tasks.length) * 100),
      byStatus: {
        BACKLOG: tasks.filter((t) => t.status === 'BACKLOG').length,
        TODO: tasks.filter((t) => t.status === 'TODO').length,
        IN_PROGRESS: tasks.filter((t) => t.status === 'IN_PROGRESS').length,
        IN_REVIEW: tasks.filter((t) => t.status === 'IN_REVIEW').length,
        DONE: done,
      },
    },
    myRole: membership.role,
  })
})

const patchSchema = z.object({
  name: z.string().trim().min(2, 'Nama proyek minimal 2 karakter.').max(80).optional(),
  description: z.string().trim().max(500).optional(),
  status: z.enum(['PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  startDate: z.string().datetime().nullable().optional(),
  targetDate: z.string().datetime().nullable().optional(),
})

/** PATCH /api/projects/:id — update (MEMBER+). */
export const PATCH = route(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireUser()
  const { id } = await ctx.params
  const { project } = await requireProject(id, user, 'MEMBER')
  const body = await parseBody(req, patchSchema)

  const data: Record<string, unknown> = {}
  if (body.name !== undefined) data.name = body.name
  if (body.description !== undefined) data.description = body.description || null
  if (body.priority !== undefined) data.priority = body.priority
  if (body.color !== undefined) data.color = body.color
  if (body.startDate !== undefined) data.startDate = body.startDate ? new Date(body.startDate) : null
  if (body.targetDate !== undefined) data.targetDate = body.targetDate ? new Date(body.targetDate) : null
  if (body.status !== undefined) {
    data.status = body.status
    data.completedAt = body.status === 'COMPLETED' ? new Date() : null
  }

  const updated = await db.project.update({ where: { id }, data })

  const changes: string[] = []
  if (body.name !== undefined && body.name !== project.name) changes.push(`nama → ${body.name}`)
  if (body.status !== undefined && body.status !== project.status) {
    changes.push(`status → ${PROJECT_STATUS_LABEL[body.status as ProjectStatus]}`)
  }
  if (body.priority !== undefined && body.priority !== project.priority) changes.push('prioritas diperbarui')
  if (body.targetDate !== undefined) changes.push('tanggal target diperbarui')
  if (body.description !== undefined) changes.push('deskripsi diperbarui')

  await logActivity(db, {
    workspaceId: project.workspaceId,
    projectId: project.id,
    userId: user.id,
    type:
      body.status === 'COMPLETED' && project.status !== 'COMPLETED'
        ? 'PROJECT_COMPLETED'
        : body.status && body.status !== project.status
          ? 'PROJECT_STATUS_CHANGED'
          : 'PROJECT_UPDATED',
    entityType: 'project',
    entityId: project.id,
    entityTitle: updated.name,
    metadata: changes.length ? { detail: changes.join(' · ') } : undefined,
  })

  return NextResponse.json({ project: updated })
})

/** DELETE /api/projects/:id — ADMIN+. */
export const DELETE = route(async (_req: NextRequest, ctx: Ctx) => {
  const user = await requireUser()
  const { id } = await ctx.params
  const { project } = await requireProject(id, user, 'ADMIN')

  const members = await db.projectMember.findMany({ where: { projectId: id } })
  await db.project.delete({ where: { id } })
  await notify(db, {
    userIds: members.map((m) => m.userId).filter((uid) => uid !== user.id),
    type: 'PROJECT_UPDATED',
    title: `Proyek "${project.name}" dihapus`,
    body: `oleh ${user.name}.`,
    link: 'projects',
    dedupeKey: `project-deleted:${id}`,
  })
  return NextResponse.json({ ok: true })
})
