import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { route } from '@/lib/api-helpers'
import { requireUser } from '@/lib/auth'

/** GET /api/notifications?cursor=&limit=50 — newest first + unread count. */
export const GET = route(async (req: NextRequest) => {
  const user = await requireUser()
  const url = new URL(req.url)
  const cursor = url.searchParams.get('cursor')
  const limit = Math.min(Number(url.searchParams.get('limit')) || 50, 100)

  const notifications = await db.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: limit,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
  })

  const unreadCount = await db.notification.count({ where: { userId: user.id, read: false } })

  return NextResponse.json({
    notifications,
    unreadCount,
    nextCursor: notifications.length === limit ? notifications[notifications.length - 1].id : null,
  })
})

/** DELETE /api/notifications — clear all read notifications. */
export const DELETE = route(async () => {
  const user = await requireUser()
  await db.notification.deleteMany({ where: { userId: user.id, read: true } })
  return NextResponse.json({ ok: true })
})
