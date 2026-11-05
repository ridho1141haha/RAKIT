import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { ApiError, parseBody, route } from '@/lib/api-helpers'
import { requireUser } from '@/lib/auth'
import { logActivity, notify } from '@/lib/activity'

/** GET /api/invitations — pending invitations addressed to my email. */
export const GET = route(async () => {
  const user = await requireUser()
  const invitations = await db.invitation.findMany({
    where: { email: user.email, status: 'PENDING' },
    include: {
      workspace: { select: { id: true, name: true, description: true } },
      invitedBy: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json({ invitations })
})

const acceptSchema = z.object({
  invitationId: z.string().min(1),
  action: z.enum(['ACCEPT', 'DECLINE']),
})

/** POST /api/invitations — accept or decline an invitation. */
export const POST = route(async (req: NextRequest) => {
  const user = await requireUser()
  const body = await parseBody(req, acceptSchema)

  const invitation = await db.invitation.findUnique({
    where: { id: body.invitationId },
    include: { workspace: true, invitedBy: { select: { id: true } } },
  })
  if (!invitation || invitation.email !== user.email) {
    throw new ApiError(404, 'Undangan tidak ditemukan.')
  }
  if (invitation.status !== 'PENDING') throw new ApiError(409, 'Undangan ini sudah diproses.')

  if (body.action === 'DECLINE') {
    await db.invitation.update({ where: { id: invitation.id }, data: { status: 'REVOKED' } })
    return NextResponse.json({ ok: true, joined: false })
  }

  // Accept → membership (or re-activate if previously removed)
  const existing = await db.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: invitation.workspaceId, userId: user.id } },
  })
  if (!existing) {
    await db.workspaceMember.create({
      data: { workspaceId: invitation.workspaceId, userId: user.id, role: invitation.role },
    })
  }

  await db.invitation.update({ where: { id: invitation.id }, data: { status: 'ACCEPTED' } })

  await db.$transaction([
    db.activityEvent.create({
      data: {
        workspaceId: invitation.workspaceId,
        userId: user.id,
        type: 'MEMBER_JOINED',
        entityType: 'member',
        entityId: user.id,
        entityTitle: user.name,
      },
    }),
  ])

  await notify(db, {
    userIds: [invitation.invitedById],
    type: 'MEMBER_JOINED',
    title: `${user.name} bergabung ke ${invitation.workspace.name}`,
    link: 'members',
    dedupeKey: `joined:${invitation.id}`,
  })

  return NextResponse.json({ ok: true, joined: true, workspaceId: invitation.workspaceId })
})
