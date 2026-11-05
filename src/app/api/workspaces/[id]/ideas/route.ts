import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { parseBody, route } from '@/lib/api-helpers'
import { requireUser } from '@/lib/auth'
import { requireMembership } from '@/lib/permissions'
import { logActivity } from '@/lib/activity'

type Ctx = { params: Promise<{ id: string }> }

const creatorSelect = { id: true, name: true, email: true, avatarColor: true } as const

/** Parse the JSON string stored in the Idea.tags column into a string[]. */
function parseTags(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === 'string') : []
  } catch {
    return []
  }
}

const listQuerySchema = z.object({
  status: z.enum(['ACTIVE', 'ARCHIVED', 'CONVERTED'], { message: 'Status ide tidak valid.' }).optional(),
  category: z.string().trim().min(1).max(40).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT'], { message: 'Prioritas tidak valid.' }).optional(),
  q: z.string().trim().max(100).optional(),
})

/** GET /api/workspaces/:id/ideas — idea inbox list (VIEWER+). */
export const GET = route(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireUser()
  const { id } = await ctx.params
  await requireMembership(id, user)

  const query = listQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams))

  const ideas = await db.idea.findMany({
    where: {
      workspaceId: id,
      ...(query.status ? { status: query.status } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.q ? { title: { contains: query.q } } : {}),
    },
    include: { creator: { select: creatorSelect } },
    orderBy: { updatedAt: 'desc' },
  })

  return NextResponse.json({
    ideas: ideas.map((idea) => ({ ...idea, tags: parseTags(idea.tags) })),
  })
})

const createSchema = z.object({
  title: z.string().trim().min(2, 'Judul ide minimal 2 karakter.').max(120),
  description: z.string().trim().max(2000).optional().or(z.literal('')),
  category: z.string().trim().min(1).max(40).default('Umum'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  tags: z.array(z.string().trim().min(1).max(30)).max(6, 'Maksimal 6 tag.').optional(),
})

/** POST /api/workspaces/:id/ideas — capture a new idea (MEMBER+). */
export const POST = route(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireUser()
  const { id } = await ctx.params
  await requireMembership(id, user, 'MEMBER')
  const body = await parseBody(req, createSchema)

  const idea = await db.idea.create({
    data: {
      workspaceId: id,
      title: body.title,
      description: body.description || null,
      category: body.category,
      priority: body.priority,
      tags: JSON.stringify(body.tags ?? []),
      createdById: user.id,
    },
    include: { creator: { select: creatorSelect } },
  })

  await logActivity(db, {
    workspaceId: id,
    userId: user.id,
    type: 'IDEA_CREATED',
    entityType: 'idea',
    entityId: idea.id,
    entityTitle: idea.title,
    metadata: { category: idea.category },
  })

  return NextResponse.json({ idea: { ...idea, tags: parseTags(idea.tags) } }, { status: 201 })
})
