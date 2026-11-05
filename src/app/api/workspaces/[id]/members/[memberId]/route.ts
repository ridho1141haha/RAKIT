import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { ApiError, badRequest, parseBody, route } from '@/lib/api-helpers'
import { requireUser } from '@/lib/auth'
import { requireMembership } from '@/lib/permissions'
import { logActivity, notify } from '@/lib/activity'
import { ROLE_LABEL, type Role } from '@/lib/constants'

type Ctx = { params: Promise<{ id: string; memberId: string }> }

const patchSchema = z.object({ role: z.enum(['ADMIN', 'MEMBER', 'VIEWER']) })

/** PATCH — change a member's role (OWNER or ADMIN; cannot touch OWNER). */
export const PATCH = route(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireUser()
  const { id, memberId } = await ctx.params
  const me = await requireMembership(id, user, 'ADMIN')
  const body = await parseBody(req, patchSchema)

  const member = await db.workspaceMember.findUnique({
    where: { id: memberId },
    include: { user: { select: { id: true, name: true } } },
  })
  if (!member || member.workspaceId !== id) throw new ApiError(404, 'Anggota tidak ditemukan.')
  if (member.role === 'OWNER') throw badRequest('Peran pemilik tidak dapat diubah.')
  if (member.userId === user.id) throw badRequest('Kamu tidak bisa mengubah peranmu sendiri.')
  if (me.role === 'ADMIN' && member.role === 'ADMIN') {
    throw badRequest('Admin tidak dapat mengubah peran admin lain.')
  }

  const updated = await db.workspaceMember.update({
    where: { id: memberId },
    data: { role: body.role },
    include: { user: { select: { id: true, name: true, email: true, avatarColor: true } } },
  })

  await logActivity(db, {
    workspaceId: id,
    userId: user.id,
    type: 'MEMBER_ROLE_CHANGED',
    entityType: 'member',
    entityId: member.userId,
    entityTitle: member.user.name,
    metadata: { role: body.role },
  })
  await notify(db, {
    userIds: [member.userId],
    type: 'MEMBER_ROLE_CHANGED',
    title: `Peranmu diubah menjadi ${ROLE_LABEL[body.role as Role]}`,
    body: `oleh ${user.name}.`,
    link: 'members',
    dedupeKey: `role:${memberId}:${body.role}`,
  })

  return NextResponse.json({ member: updated })
})

/** DELETE — remove a member (OWNER/ADMIN, not self, not owner). */
export const DELETE = route(async (_req: NextRequest, ctx: Ctx) => {
  const user = await requireUser()
  const { id, memberId } = await ctx.params
  const me = await requireMembership(id, user, 'ADMIN')

  const member = await db.workspaceMember.findUnique({
    where: { id: memberId },
    include: { user: { select: { id: true, name: true } } },
  })
  if (!member || member.workspaceId !== id) throw new ApiError(404, 'Anggota tidak ditemukan.')
  if (member.role === 'OWNER') throw badRequest('Pemilik tidak dapat dikeluarkan.')
  if (member.userId === user.id) throw badRequest('Gunakan keluar dari workspace untuk meninggalkan.')
  if (me.role === 'ADMIN' && member.role === 'ADMIN') {
    throw badRequest('Admin tidak dapat mengeluarkan admin lain.')
  }

  await db.workspaceMember.delete({ where: { id: memberId } })
  await logActivity(db, {
    workspaceId: id,
    userId: user.id,
    type: 'MEMBER_REMOVED',
    entityType: 'member',
    entityId: member.userId,
    entityTitle: member.user.name,
  })
  return NextResponse.json({ ok: true })
})
