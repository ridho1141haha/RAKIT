import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { route } from '@/lib/api-helpers'
import { requireUser } from '@/lib/auth'
import { requireProject } from '@/lib/permissions'

type Ctx = { params: Promise<{ id: string }> }

/** GET /api/projects/:id/activity — project-scoped feed, paginated. */
export const GET = route(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireUser()
  const { id } = await ctx.params
  await requireProject(id, user)

  const url = new URL(req.url)
  const cursor = url.searchParams.get('cursor')
  const limit = Math.min(Number(url.searchParams.get('limit')) || 20, 50)

  const events = await db.activityEvent.findMany({
    where: { projectId: id },
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
