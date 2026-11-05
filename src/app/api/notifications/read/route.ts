import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { parseBody, route } from '@/lib/api-helpers'
import { requireUser } from '@/lib/auth'

const schema = z.object({ id: z.string().optional(), all: z.boolean().optional() })

/** POST /api/notifications/read — mark one ({id}) or all notifications as read. */
export const POST = route(async (req: NextRequest) => {
  const user = await requireUser()
  const body = await parseBody(req, schema)

  if (body.all) {
    await db.notification.updateMany({ where: { userId: user.id, read: false }, data: { read: true } })
    return NextResponse.json({ ok: true })
  }
  if (body.id) {
    await db.notification.updateMany({
      where: { id: body.id, userId: user.id }, // scoped to owner → no cross-user access
      data: { read: true },
    })
  }
  return NextResponse.json({ ok: true })
})
