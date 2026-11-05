import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { ApiError, parseBody, route } from '@/lib/api-helpers'
import { requireUser } from '@/lib/auth'
import { requireProject } from '@/lib/permissions'
import { logActivity } from '@/lib/activity'

type Ctx = { params: Promise<{ id: string }> }

/** GET /api/projects/:id/members + eligible workspace members. */
export const GET = route(async (_req: NextRequest, ctx: Ctx) => {
  const user = await requireUser()
  const { id } = await ctx.params
  const { project } = await requireProject(id, user)

  const [members, workspaceMembers] = await Promise.all([
    db.projectMember.findMany({
      where: { projectId: id },
      include: { user: { select: { id: true, name: true, email: true, avatarColor: true } } },
      orderBy: { createdAt: 'asc' },
    }),
    db.workspaceMember.findMany({
      where: { workspaceId: project.workspaceId },
      include: { user: { select: { id: true, name: true, email: true, avatarColor: true } } },
      orderBy: { createdAt: 'asc' },
    }),
  ])

  const memberIds = new Set(members.map((m) => m.userId))
  return NextResponse.json({
    members: members.map((m) => ({ id: m.id, role: m.role, user: m.user })),
    eligible: workspaceMembers.filter((m) => !memberIds.has(m.userId)).map((m) => m.user),
  })
})

const schema = z.object({
  userId: z.string().min(1),
  role: z.enum(['LEAD', 'MEMBER']).default('MEMBER'),
})

/** POST /api/projects/:id/members — add a workspace member (MEMBER+). */
export const POST = route(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireUser()
  const { id } = await ctx.params
  const { project } = await requireProject(id, user, 'MEMBER')
  const body = await parseBody(req, schema)

  const wsMember = await db.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: project.workspaceId, userId: body.userId } },
    include: { user: { select: { id: true, name: true, email: true, avatarColor: true } } },
  })
  if (!wsMember) throw new ApiError(400, 'Pengguna bukan anggota workspace ini.')

  const existing = await db.projectMember.findUnique({
    where: { projectId_userId: { projectId: id, userId: body.userId } },
  })
  if (existing) throw new ApiError(409, 'Sudah menjadi anggota proyek.')

  const member = await db.projectMember.create({
    data: { projectId: id, userId: body.userId, role: body.role },
  })

  await logActivity(db, {
    workspaceId: project.workspaceId, projectId: id, userId: user.id,
    type: 'MEMBER_JOINED', entityType: 'member', entityId: body.userId, entityTitle: wsMember.user.name,
    metadata: { scope: 'project' },
  })

  return NextResponse.json({ member: { id: member.id, role: member.role, user: wsMember.user } }, { status: 201 })
})
