import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { ApiError, parseBody, route } from '@/lib/api-helpers'
import { requireUser } from '@/lib/auth'
import { requireProject } from '@/lib/permissions'
import { logActivity, notify } from '@/lib/activity'

type Ctx = { params: Promise<{ id: string }> }

const patchSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  targetDate: z.string().datetime().nullable().optional(),
  completed: z.boolean().optional(),
})

/** PATCH /api/milestones/:id — update / toggle completion. */
export const PATCH = route(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireUser()
  const { id } = await ctx.params
  const milestone = await db.milestone.findUnique({ where: { id }, include: { project: true } })
  if (!milestone) throw new ApiError(404, 'Milestone tidak ditemukan.')
  await requireProject(milestone.projectId, user, 'MEMBER')
  const body = await parseBody(req, patchSchema)

  const updated = await db.milestone.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.description !== undefined ? { description: body.description || null } : {}),
      ...(body.targetDate !== undefined ? { targetDate: body.targetDate ? new Date(body.targetDate) : null } : {}),
      ...(body.completed !== undefined
        ? { completed: body.completed, completedAt: body.completed ? new Date() : null }
        : {}),
    },
  })

  if (body.completed === true && !milestone.completed) {
    await logActivity(db, {
      workspaceId: milestone.project.workspaceId, projectId: milestone.projectId, userId: user.id,
      type: 'MILESTONE_COMPLETED', entityType: 'milestone', entityId: id, entityTitle: updated.name,
    })
    const members = await db.projectMember.findMany({ where: { projectId: milestone.projectId } })
    await notify(db, {
      userIds: members.map((m) => m.userId).filter((uid) => uid !== user.id),
      type: 'MILESTONE_COMPLETED',
      title: `Milestone tercapai: ${updated.name}`,
      body: `${milestone.project.name} · oleh ${user.name}`,
      link: `project:${milestone.projectId}?tab=milestones`,
      dedupeKey: `milestone-done:${id}`,
    })
  }

  return NextResponse.json({ milestone: updated })
})

/** DELETE /api/milestones/:id — tasks keep existing (milestoneId → null). */
export const DELETE = route(async (_req: NextRequest, ctx: Ctx) => {
  const user = await requireUser()
  const { id } = await ctx.params
  const milestone = await db.milestone.findUnique({ where: { id }, include: { project: true } })
  if (!milestone) throw new ApiError(404, 'Milestone tidak ditemukan.')
  await requireProject(milestone.projectId, user, 'MEMBER')
  await db.milestone.delete({ where: { id } })
  await logActivity(db, {
    workspaceId: milestone.project.workspaceId, projectId: milestone.projectId, userId: user.id,
    type: 'MILESTONE_DELETED', entityType: 'milestone', entityId: null, entityTitle: milestone.name,
  })
  return NextResponse.json({ ok: true })
})
