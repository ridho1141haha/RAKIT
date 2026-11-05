import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ApiError, route } from '@/lib/api-helpers'
import { requireUser } from '@/lib/auth'
import { requireMembership } from '@/lib/permissions'

const DAY = 24 * 60 * 60 * 1000

/**
 * GET /api/dashboard?workspaceId=…
 * Every number here is derived from real rows — nothing fabricated.
 */
export const GET = route(async (req: NextRequest) => {
  const user = await requireUser()
  const workspaceId = new URL(req.url).searchParams.get('workspaceId')
  if (!workspaceId) throw new ApiError(400, 'workspaceId wajib.')
  await requireMembership(workspaceId, user)

  const weekAgo = new Date(Date.now() - 7 * DAY)
  const activeStatuses = ['PLANNING', 'ACTIVE', 'ON_HOLD']

  const [
    projects,
    myOpenTasks,
    deadlines,
    doneRecent,
    milestones,
    activity,
    unreadCount,
  ] = await Promise.all([
    db.project.findMany({
      where: { workspaceId, status: { in: activeStatuses } },
      include: {
        owner: { select: { id: true, name: true, email: true, avatarColor: true } },
        members: { include: { user: { select: { id: true, name: true, avatarColor: true } } } },
        milestones: { where: { completed: false }, orderBy: { targetDate: 'asc' }, take: 1 },
      },
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
    }),
    db.task.findMany({
      where: { assigneeId: user.id, status: { not: 'DONE' }, project: { workspaceId } },
      include: { project: { select: { id: true, name: true, color: true } } },
      orderBy: [{ dueDate: 'asc' }, { priority: 'desc' }],
      take: 8,
    }),
    db.task.findMany({
      where: {
        status: { not: 'DONE' },
        dueDate: { not: null },
        project: { workspaceId, status: { in: activeStatuses } },
      },
      include: {
        project: { select: { id: true, name: true, color: true } },
        assignee: { select: { id: true, name: true, avatarColor: true } },
      },
      orderBy: { dueDate: 'asc' },
      take: 7,
    }),
    db.task.findMany({
      where: { status: 'DONE', completedAt: { gte: weekAgo }, project: { workspaceId } },
      select: { completedAt: true },
    }),
    db.milestone.findMany({
      where: { completed: false, project: { workspaceId, status: { in: activeStatuses } } },
      include: { project: { select: { id: true, name: true } } },
      orderBy: { targetDate: 'asc' },
      take: 5,
    }),
    db.activityEvent.findMany({
      where: { workspaceId },
      include: {
        user: { select: { id: true, name: true, avatarColor: true } },
        project: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    db.notification.count({ where: { userId: user.id, read: false } }),
  ])

  // task counts per project (single group-by, avoids N+1)
  const grouped = await db.task.groupBy({
    by: ['projectId', 'status'],
    where: { project: { workspaceId } },
    _count: { _all: true },
  })
  const statsFor = (projectId: string) => {
    const rows = grouped.filter((g) => g.projectId === projectId)
    const total = rows.reduce((a, r) => a + r._count._all, 0)
    const done = rows.filter((r) => r.status === 'DONE').reduce((a, r) => a + r._count._all, 0)
    return { total, done }
  }

  // weekly completion buckets (last 7 days, Asia/Jakarta-ish local server time)
  const weeklyDone: Array<{ date: string; label: string; count: number }> = []
  const weekdayFmt = new Intl.DateTimeFormat('id-ID', { weekday: 'short' })
  for (let i = 6; i >= 0; i--) {
    const dayStart = new Date()
    dayStart.setHours(0, 0, 0, 0)
    const start = new Date(dayStart.getTime() - i * DAY)
    const end = new Date(start.getTime() + DAY)
    const count = doneRecent.filter((t) => t.completedAt && t.completedAt >= start && t.completedAt < end).length
    weeklyDone.push({
      date: start.toISOString(),
      label: i === 0 ? 'Hari ini' : weekdayFmt.format(start),
      count,
    })
  }

  const activeProjects = projects.map((p) => ({
    ...p,
    members: p.members.map((m) => ({ id: m.id, role: m.role, user: m.user })),
    taskStats: statsFor(p.id),
    nextMilestone: p.milestones[0] ?? null,
  }))

  const recentlyUpdated = [...projects]
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, 4)
    .map((p) => ({
      id: p.id,
      name: p.name,
      status: p.status,
      color: p.color,
      updatedAt: p.updatedAt,
      taskStats: statsFor(p.id),
    }))

  const overdueTasks = deadlines.filter((t) => t.dueDate && t.dueDate < new Date()).length
  const myOpen = myOpenTasks.length

  return NextResponse.json({
    stats: {
      activeProjects: projects.filter((p) => p.status === 'ACTIVE').length,
      planningProjects: projects.filter((p) => p.status === 'PLANNING').length,
      myOpenTasks: myOpen,
      overdueTasks,
      doneThisWeek: doneRecent.length,
      unreadNotifications: unreadCount,
    },
    activeProjects,
    recentlyUpdated,
    upcomingDeadlines: deadlines.map((t) => ({
      id: t.id,
      title: t.title,
      dueDate: t.dueDate!,
      priority: t.priority,
      status: t.status,
      projectId: t.project.id,
      projectName: t.project.name,
      projectColor: t.project.color,
      assignee: t.assignee,
    })),
    myTasks: myOpenTasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      dueDate: t.dueDate,
      projectId: t.project.id,
      projectName: t.project.name,
      projectColor: t.project.color,
    })),
    weeklyDone,
    upcomingMilestones: milestones.map((m) => ({
      id: m.id,
      name: m.name,
      targetDate: m.targetDate,
      completed: m.completed,
      projectId: m.project.id,
      projectName: m.project.name,
      overdue: Boolean(m.targetDate && m.targetDate < new Date()),
    })),
    recentActivity: activity,
  })
})
