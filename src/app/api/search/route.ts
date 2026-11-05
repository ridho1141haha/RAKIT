import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ApiError, route } from '@/lib/api-helpers'
import { requireUser } from '@/lib/auth'
import { requireMembership } from '@/lib/permissions'

/**
 * GET /api/search?workspaceId=…&q=…
 * Global search across projects, tasks, ideas, documents, milestones —
 * restricted to the caller's workspace membership.
 */
export const GET = route(async (req: NextRequest) => {
  const user = await requireUser()
  const url = new URL(req.url)
  const workspaceId = url.searchParams.get('workspaceId')
  const q = (url.searchParams.get('q') ?? '').trim()

  if (!workspaceId) throw new ApiError(400, 'workspaceId wajib.')
  await requireMembership(workspaceId, user)

  if (q.length < 2) {
    return NextResponse.json({ projects: [], tasks: [], ideas: [], documents: [], milestones: [] })
  }
  const contains = { contains: q }

  const [projects, tasks, ideas, documents, milestones] = await Promise.all([
    db.project.findMany({
      where: { workspaceId, OR: [{ name: contains }, { description: contains }] },
      select: { id: true, name: true, status: true, color: true, workspaceId: true },
      take: 5,
      orderBy: { updatedAt: 'desc' },
    }),
    db.task.findMany({
      where: { project: { workspaceId }, title: contains },
      select: { id: true, title: true, status: true, projectId: true, project: { select: { name: true } } },
      take: 6,
      orderBy: { updatedAt: 'desc' },
    }),
    db.idea.findMany({
      where: { workspaceId, title: contains },
      select: { id: true, title: true, status: true, workspaceId: true },
      take: 4,
      orderBy: { updatedAt: 'desc' },
    }),
    db.document.findMany({
      where: { workspaceId, OR: [{ title: contains }, { content: contains }] },
      select: { id: true, title: true, workspaceId: true, projectId: true },
      take: 4,
      orderBy: { updatedAt: 'desc' },
    }),
    db.milestone.findMany({
      where: { project: { workspaceId }, name: contains },
      select: { id: true, name: true, projectId: true, project: { select: { name: true } }, completed: true },
      take: 4,
    }),
  ])

  return NextResponse.json({
    projects,
    tasks: tasks.map((t) => ({ ...t, projectName: t.project.name })),
    ideas,
    documents,
    milestones: milestones.map((m) => ({ ...m, projectName: m.project.name })),
  })
})
