import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { forbidden, notFound, parseBody, route } from '@/lib/api-helpers'
import { requireUser } from '@/lib/auth'
import { requireMembership, roleAtLeast } from '@/lib/permissions'
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

/** GET /api/ideas/:id — single idea (membership resolved through the idea). */
export const GET = route(async (_req: NextRequest, ctx: Ctx) => {
  const user = await requireUser()
  const { id } = await ctx.params

  const idea = await db.idea.findUnique({
    where: { id },
    include: { creator: { select: creatorSelect } },
  })
  if (!idea) throw notFound('Ide tidak ditemukan.')
  await requireMembership(idea.workspaceId, user)

  return NextResponse.json({ idea: { ...idea, tags: parseTags(idea.tags) } })
})

const patchSchema = z.object({
  title: z.string().trim().min(2, 'Judul ide minimal 2 karakter.').max(120).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  category: z.string().trim().min(1).max(40).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  tags: z.array(z.string().trim().min(1).max(30)).max(6, 'Maksimal 6 tag.').optional(),
  status: z.enum(['ACTIVE', 'ARCHIVED']).optional(),
})

/** PATCH /api/ideas/:id — partial update (MEMBER+). */
export const PATCH = route(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireUser()
  const { id } = await ctx.params

  const existing = await db.idea.findUnique({ where: { id } })
  if (!existing) throw notFound('Ide tidak ditemukan.')
  await requireMembership(existing.workspaceId, user, 'MEMBER')
  const body = await parseBody(req, patchSchema)

  const idea = await db.idea.update({
    where: { id },
    data: {
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.description !== undefined ? { description: body.description || null } : {}),
      ...(body.category !== undefined ? { category: body.category } : {}),
      ...(body.priority !== undefined ? { priority: body.priority } : {}),
      ...(body.tags !== undefined ? { tags: JSON.stringify(body.tags) } : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
    },
    include: { creator: { select: creatorSelect } },
  })

  if (body.status === 'ARCHIVED' && existing.status !== 'ARCHIVED') {
    await logActivity(db, {
      workspaceId: existing.workspaceId,
      userId: user.id,
      type: 'IDEA_ARCHIVED',
      entityType: 'idea',
      entityId: idea.id,
      entityTitle: idea.title,
    })
  }

  return NextResponse.json({ idea: { ...idea, tags: parseTags(idea.tags) } })
})

/** DELETE /api/ideas/:id — MEMBER+, but only the creator or ADMIN+ may delete. */
export const DELETE = route(async (_req: NextRequest, ctx: Ctx) => {
  const user = await requireUser()
  const { id } = await ctx.params

  const existing = await db.idea.findUnique({ where: { id } })
  if (!existing) throw notFound('Ide tidak ditemukan.')
  const membership = await requireMembership(existing.workspaceId, user, 'MEMBER')

  if (!roleAtLeast(membership.role, 'ADMIN') && existing.createdById !== user.id) {
    throw forbidden('Hanya pembuat atau admin yang dapat menghapus ide ini.')
  }

  await db.idea.delete({ where: { id } })
  return NextResponse.json({ ok: true })
})
