import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { ApiError, parseBody, route } from '@/lib/api-helpers'
import { requireUser } from '@/lib/auth'
import { requireProject } from '@/lib/permissions'
import { logActivity } from '@/lib/activity'

type Ctx = { params: Promise<{ id: string; userId: string }> }

const patchSchema = z.object({ role: z.enum(['LEAD', 'MEMBER']) })

/** PATCH /api/projects/:id/members/:userId — change project role. */
export const PATCH = route(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireUser()
  const { id, userId } = await ctx.params
  const { project } = await requireProject(id, user, 'ADMIN')
  const body = await parseBody(req, patchSchema)

  const member = await db.projectMember.findUnique({
    where: { projectId_userId: { projectId: id, userId } },
    include: { user: { select: { id: true, name: true, email: true, avatarColor: true } } },
  })
  if (!member) throw new ApiError(404, 'Anggota proyek tidak ditemukan.')

  const updated = await db.projectMember.update({ where: { id: member.id }, data: { role: body.role } })
  await logActivity(db, {
    workspaceId: project.workspaceId, projectId: id, userId: user.id,
    type: 'MEMBER_ROLE_CHANGED', entityType: 'member', entityId: userId, entityTitle: member.user.name,
    metadata: { scope: 'project', role: body.role },
  })
  return NextResponse.json({ member: { id: updated.id, role: updated.role, user: member.user } })
})

/** DELETE /api/projects/:id/members/:userId — remove from project. */
export const DELETE = route(async (_req: NextRequest, ctx: Ctx) => {
  const user = await requireUser()
  const { id, userId } = await ctx.params
  const { project } = await requireProject(id, user, 'MEMBER')
  if (project.ownerId === userId) throw new ApiError(400, 'Pemilik proyek tidak dapat dikeluarkan.')

  const member = await db.projectMember.findUnique({
    where: { projectId_userId: { projectId: id, userId } },
    include: { user: { select: { id: true, name: true } } },
  })
  if (!member) throw new ApiError(404, 'Anggota proyek tidak ditemukan.')

  await db.projectMember.delete({ where: { id: member.id } })
  await logActivity(db, {
    workspaceId: project.workspaceId, projectId: id, userId: user.id,
    type: 'MEMBER_REMOVED', entityType: 'member', entityId: userId, entityTitle: member.user.name,
    metadata: { scope: 'project' },
  })
  return NextResponse.json({ ok: true })
})
