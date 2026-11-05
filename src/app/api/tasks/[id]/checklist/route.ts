import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { parseBody, route } from '@/lib/api-helpers'
import { requireUser } from '@/lib/auth'
import { requireTask } from '@/lib/permissions'
import { logActivity } from '@/lib/activity'

type Ctx = { params: Promise<{ id: string }> }

const schema = z.object({ content: z.string().trim().min(1, 'Isi checklist tidak boleh kosong.').max(200) })

/** POST /api/tasks/:id/checklist — append an item. */
export const POST = route(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireUser()
  const { id } = await ctx.params
  const { task } = await requireTask(id, user, 'MEMBER')
  const body = await parseBody(req, schema)

  const last = await db.checklistItem.findFirst({
    where: { taskId: id },
    orderBy: { position: 'desc' },
    select: { position: true },
  })
  const item = await db.checklistItem.create({
    data: { taskId: id, content: body.content, position: (last?.position ?? -1) + 1 },
  })

  await logActivity(db, {
    workspaceId: task.project.workspaceId, projectId: task.projectId, userId: user.id,
    type: 'CHECKLIST_UPDATED', entityType: 'task', entityId: id, entityTitle: task.title,
    metadata: { detail: `menambah butir "${body.content.slice(0, 40)}"` },
  })

  return NextResponse.json({ item }, { status: 201 })
})
