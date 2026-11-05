import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { route } from '@/lib/api-helpers'
import { getSessionUser } from '@/lib/auth'

/** Current user + workspaces (with role) + unread notification count. */
export const GET = route(async () => {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ user: null })

  const [memberships, unreadCount] = await Promise.all([
    db.workspaceMember.findMany({
      where: { userId: user.id },
      include: {
        workspace: {
          select: {
            id: true,
            name: true,
            description: true,
            ownerId: true,
            _count: { select: { projects: { where: { status: { in: ['ACTIVE', 'PLANNING', 'ON_HOLD'] } } } } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    }),
    db.notification.count({ where: { userId: user.id, read: false } }),
  ])

  return NextResponse.json({
    user,
    workspaces: memberships.map((m) => ({
      id: m.workspace.id,
      name: m.workspace.name,
      description: m.workspace.description,
      role: m.role,
      ownerId: m.workspace.ownerId,
      activeProjects: m.workspace._count.projects,
    })),
    unreadCount,
  })
})
