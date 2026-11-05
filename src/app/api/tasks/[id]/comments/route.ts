import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { parseBody, route } from '@/lib/api-helpers'
import { requireUser } from '@/lib/auth'
import { requireTask } from '@/lib/permissions'
import { logActivity, notify } from '@/lib/activity'

type Ctx = { params: Promise<{ id: string }> }

/** GET /api/tasks/:id/comments */
export const GET = route(async (_req: NextRequest, ctx: Ctx) => {
  const user = await requireUser()
  const { id } = await ctx.params
  await requireTask(id, user)
  const comments = await db.taskComment.findMany({
    where: { taskId: id },
    include: { user: { select: { id: true, name: true, avatarColor: true } } },
    orderBy: { createdAt: 'asc' },
  })
  return NextResponse.json({ comments })
})

const schema = z.object({ content: z.string().trim().min(1, 'Komentar tidak boleh kosong.').max(2000) })

/** POST /api/tasks/:id/comments — MEMBER+. Notifies assignee + creator. */
export const POST = route(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireUser()
  const { id } = await ctx.params
  const { task } = await requireTask(id, user, 'MEMBER')
  const body = await parseBody(req, schema)

  const comment = await db.taskComment.create({
    data: { taskId: id, userId: user.id, content: body.content },
    include: { user: { select: { id: true, name: true, avatarColor: true } } },
  })

  await logActivity(db, {
    workspaceId: task.project.workspaceId, projectId: task.projectId, userId: user.id,
    type: 'COMMENT_ADDED', entityType: 'task', entityId: id, entityTitle: task.title,
  })

  const recipients = [task.assigneeId, task.createdById].filter(
    (uid): uid is string => Boolean(uid) && uid !== user.id,
  )
  if (recipients.length) {
    await notify(db, {
      userIds: recipients,
      type: 'COMMENT_ADDED',
      title: `${user.name} berkomentar di "${task.title}"`,
      body: body.content.length > 90 ? `${body.content.slice(0, 90)}…` : body.content,
      link: `project:${task.projectId}?task=${id}`,
      dedupeKey: `comment:${comment.id}`,
    })
  }

  return NextResponse.json({ comment }, { status: 201 })
})
