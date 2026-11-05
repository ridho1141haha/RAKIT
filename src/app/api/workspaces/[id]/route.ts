import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { badRequest, parseBody, route } from '@/lib/api-helpers'
import { requireUser } from '@/lib/auth'
import { requireMembership } from '@/lib/permissions'

type Ctx = { params: Promise<{ id: string }> }

/** GET /api/workspaces/:id — detail + members + my role. */
export const GET = route(async (_req: NextRequest, ctx: Ctx) => {
  const user = await requireUser()
  const { id } = await ctx.params
  const membership = await requireMembership(id, user)

  const workspace = await db.workspace.findUnique({
    where: { id },
    include: {
      members: {
        include: { user: { select: { id: true, name: true, email: true, avatarColor: true } } },
        orderBy: { createdAt: 'asc' },
      },
      invitations: {
        where: { status: 'PENDING' },
        include: { invitedBy: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
      },
      _count: { select: { projects: true, ideas: true, documents: true } },
    },
  })
  if (!workspace) throw badRequest('Workspace tidak ditemukan.')

  return NextResponse.json({
    workspace: {
      id: workspace.id,
      name: workspace.name,
      description: workspace.description,
      ownerId: workspace.ownerId,
      createdAt: workspace.createdAt,
      members: workspace.members.map((m) => ({
        id: m.id,
        role: m.role,
        joinedAt: m.createdAt,
        user: m.user,
      })),
      invitations: workspace.invitations.map((i) => ({
        id: i.id,
        email: i.email,
        role: i.role,
        status: i.status,
        invitedBy: i.invitedBy.name,
        createdAt: i.createdAt,
      })),
      counts: workspace._count,
    },
    myRole: membership.role,
  })
})

const patchSchema = z.object({
  name: z.string().trim().min(2, 'Nama minimal 2 karakter.').max(60).optional(),
  description: z.string().trim().max(200).optional(),
})

/** PATCH /api/workspaces/:id — rename/describe (ADMIN+). */
export const PATCH = route(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireUser()
  const { id } = await ctx.params
  await requireMembership(id, user, 'ADMIN')
  const body = await parseBody(req, patchSchema)

  const workspace = await db.workspace.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.description !== undefined ? { description: body.description || null } : {}),
    },
  })
  return NextResponse.json({ workspace })
})

/** DELETE /api/workspaces/:id — OWNER only, cascades everything. */
export const DELETE = route(async (_req: NextRequest, ctx: Ctx) => {
  const user = await requireUser()
  const { id } = await ctx.params
  const workspace = await db.workspace.findUnique({ where: { id } })
  if (!workspace) throw badRequest('Workspace tidak ditemukan.')
  if (workspace.ownerId !== user.id) {
    throw badRequest('Hanya pemilik workspace yang dapat menghapusnya.')
  }
  await db.workspace.delete({ where: { id } })
  return NextResponse.json({ ok: true })
})
