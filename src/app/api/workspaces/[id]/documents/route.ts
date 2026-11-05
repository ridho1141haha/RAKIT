import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { badRequest, parseBody, route } from '@/lib/api-helpers'
import { requireUser } from '@/lib/auth'
import { requireMembership } from '@/lib/permissions'
import { logActivity } from '@/lib/activity'

type Ctx = { params: Promise<{ id: string }> }

const creatorSelect = { id: true, name: true, avatarColor: true } as const

const listQuerySchema = z.object({
  projectId: z.string().min(1).optional(),
  q: z.string().trim().max(100).optional(),
})

/** GET /api/workspaces/:id/documents — list documents (VIEWER+). */
export const GET = route(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireUser()
  const { id } = await ctx.params
  await requireMembership(id, user)

  const query = listQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams))

  const documents = await db.document.findMany({
    where: {
      workspaceId: id,
      ...(query.projectId ? { projectId: query.projectId } : {}),
      ...(query.q
        ? { OR: [{ title: { contains: query.q } }, { content: { contains: query.q } }] }
        : {}),
    },
    include: { creator: { select: creatorSelect } },
    orderBy: { updatedAt: 'desc' },
  })

  return NextResponse.json({ documents })
})

const createSchema = z.object({
  title: z.string().trim().min(2, 'Judul dokumen minimal 2 karakter.').max(140),
  content: z.string().max(100_000, 'Konten dokumen terlalu panjang (maks 100.000 karakter).').optional(),
  projectId: z.string().nullable().optional(),
})

/** POST /api/workspaces/:id/documents — create a document (MEMBER+). */
export const POST = route(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireUser()
  const { id } = await ctx.params
  await requireMembership(id, user, 'MEMBER')
  const body = await parseBody(req, createSchema)

  if (body.projectId) {
    const project = await db.project.findUnique({ where: { id: body.projectId } })
    if (!project || project.workspaceId !== id) throw badRequest('Proyek tidak valid.')
  }

  const document = await db.document.create({
    data: {
      workspaceId: id,
      projectId: body.projectId ?? null,
      title: body.title,
      content: body.content ?? '',
      createdById: user.id,
    },
    include: { creator: { select: creatorSelect } },
  })

  await logActivity(db, {
    workspaceId: id,
    projectId: document.projectId,
    userId: user.id,
    type: 'DOCUMENT_CREATED',
    entityType: 'document',
    entityId: document.id,
    entityTitle: document.title,
  })

  return NextResponse.json({ document }, { status: 201 })
})
