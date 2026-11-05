import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { route } from '@/lib/api-helpers'
import { requireUser } from '@/lib/auth'
import { requireMembership } from '@/lib/permissions'

type Ctx = { params: Promise<{ id: string }> }

const filterSchema = z
  .enum(['project', 'task', 'idea', 'document', 'member'], {
    message: 'Filter aktivitas tidak valid.',
  })
  .optional()

/** GET /api/workspaces/:id/activity — workspace-wide feed, cursor paginated. */
export const GET = route(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireUser()
  const { id } = await ctx.params
  await requireMembership(id, user)

  const url = new URL(req.url)
  const cursor = url.searchParams.get('cursor')
  const limit = Math.max(1, Math.min(Number(url.searchParams.get('limit')) || 20, 50))
  const filter = filterSchema.parse(url.searchParams.get('filter') ?? undefined)

  const events = await db.activityEvent.findMany({
    where: {
      workspaceId: id,
      ...(filter ? { entityType: filter } : {}),
    },
    include: {
      user: { select: { id: true, name: true, avatarColor: true } },
      project: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
  })

  return NextResponse.json({
    events,
    nextCursor: events.length === limit ? events[events.length - 1].id : null,
  })
})
