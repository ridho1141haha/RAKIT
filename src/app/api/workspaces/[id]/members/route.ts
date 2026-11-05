import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { ApiError, parseBody, route } from '@/lib/api-helpers'
import { requireUser } from '@/lib/auth'
import { requireMembership } from '@/lib/permissions'
import { logActivity, notify } from '@/lib/activity'
import type { Role } from '@/lib/constants'

type Ctx = { params: Promise<{ id: string }> }

/** GET /api/workspaces/:id/members */
export const GET = route(async (_req: NextRequest, ctx: Ctx) => {
  const user = await requireUser()
  const { id } = await ctx.params
  await requireMembership(id, user)
  const members = await db.workspaceMember.findMany({
    where: { workspaceId: id },
    include: { user: { select: { id: true, name: true, email: true, avatarColor: true } } },
    orderBy: { createdAt: 'asc' },
  })
  return NextResponse.json({ members })
})

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email('Format email tidak valid.'),
  role: z.enum(['ADMIN', 'MEMBER', 'VIEWER']).default('MEMBER'),
})

/** POST /api/workspaces/:id/members — invite by email (ADMIN+). */
export const POST = route(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireUser()
  const { id } = await ctx.params
  await requireMembership(id, user, 'ADMIN')
  const body = await parseBody(req, inviteSchema)

  const workspace = await db.workspace.findUnique({ where: { id } })
  if (!workspace) throw new ApiError(404, 'Workspace tidak ditemukan.')

  const invitee = await db.user.findUnique({ where: { email: body.email } })

  // Already a member?
  if (invitee) {
    const existing = await db.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: id, userId: invitee.id } },
    })
    if (existing) throw new ApiError(409, `${invitee.name} sudah menjadi anggota workspace ini.`)
  }

  // Pending invitation already exists?
  const pending = await db.invitation.findFirst({
    where: { workspaceId: id, email: body.email, status: 'PENDING' },
  })
  if (pending) throw new ApiError(409, 'Undangan untuk email ini masih menunggu.')

  const invitation = await db.invitation.create({
    data: {
      workspaceId: id,
      email: body.email,
      role: body.role,
      invitedById: user.id,
    },
  })

  await logActivity(db, {
    workspaceId: id,
    userId: user.id,
    type: 'MEMBER_INVITED',
    entityType: 'invitation',
    entityId: invitation.id,
    entityTitle: body.email,
    metadata: { role: body.role },
  })

  if (invitee) {
    await notify(db, {
      userIds: [invitee.id],
      type: 'INVITATION',
      title: `${user.name} mengundangmu ke ${workspace.name}`,
      body: `Peran: ${body.role.toLowerCase()}. Buka workspace untuk bergabung.`,
      link: 'workspaces',
      dedupeKey: `invite:${invitation.id}`,
    })
  }

  return NextResponse.json({ invitation }, { status: 201 })
})
