import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ApiError, route } from '@/lib/api-helpers'
import { requireUser } from '@/lib/auth'
import { requireMembership } from '@/lib/permissions'

/**
 * GET /api/my-tasks?workspaceId=&includeDone=1
 * Every open task assigned to me in the workspace, grouped client-side by due bucket.
 */
export const GET = route(async (req: NextRequest) => {
  const user = await requireUser()
  const url = new URL(req.url)
  const workspaceId = url.searchParams.get('workspaceId')
  if (!workspaceId) throw new ApiError(400, 'workspaceId wajib.')
  await requireMembership(workspaceId, user)

  const includeDone = url.searchParams.get('includeDone') === '1'
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const tasks = await db.task.findMany({
    where: {
      assigneeId: user.id,
      project: { workspaceId },
      ...(includeDone
        ? { OR: [{ status: { not: 'DONE' } }, { completedAt: { gte: sevenDaysAgo } }] }
        : { status: { not: 'DONE' } }),
    },
    include: {
      project: { select: { id: true, name: true, color: true } },
      labels: { include: { label: true } },
      _count: { select: { comments: true, checklist: true } },
    },
    orderBy: [{ dueDate: 'asc' }, { priority: 'desc' }, { createdAt: 'desc' }],
  })

  return NextResponse.json({
    tasks: tasks.map((t) => ({
      ...t,
      labels: t.labels.map((tl) => ({ id: tl.label.id, name: tl.label.name, color: tl.label.color })),
    })),
  })
})
