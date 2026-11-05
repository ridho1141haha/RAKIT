import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { parseBody, route } from '@/lib/api-helpers'
import { requireUser } from '@/lib/auth'
import { logActivity } from '@/lib/activity'

const createSchema = z.object({
  name: z.string().trim().min(2, 'Nama workspace minimal 2 karakter.').max(60),
  description: z.string().trim().max(200).optional().or(z.literal('')),
})

/** GET /api/workspaces — workspaces of the signed-in user. */
export const GET = route(async () => {
  const user = await requireUser()
  const memberships = await db.workspaceMember.findMany({
    where: { userId: user.id },
    include: {
      workspace: {
        include: {
          _count: { select: { projects: true, members: true } },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  })
  return NextResponse.json({
    workspaces: memberships.map((m) => ({
      id: m.workspace.id,
      name: m.workspace.name,
      description: m.workspace.description,
      role: m.role,
      ownerId: m.workspace.ownerId,
      projectCount: m.workspace._count.projects,
      memberCount: m.workspace._count.members,
      createdAt: m.workspace.createdAt,
    })),
  })
})

/** POST /api/workspaces — create a workspace (creator becomes OWNER). */
export const POST = route(async (req: NextRequest) => {
  const user = await requireUser()
  const body = await parseBody(req, createSchema)

  const workspace = await db.workspace.create({
    data: {
      name: body.name,
      description: body.description || null,
      ownerId: user.id,
      members: { create: { userId: user.id, role: 'OWNER' } },
    },
  })

  await logActivity(db, {
    workspaceId: workspace.id,
    userId: user.id,
    type: 'MEMBER_JOINED',
    entityType: 'workspace',
    entityId: workspace.id,
    entityTitle: workspace.name,
  })

  return NextResponse.json({ workspace }, { status: 201 })
})
