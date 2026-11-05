import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { ApiError, parseBody, route } from '@/lib/api-helpers'
import { requireUser } from '@/lib/auth'
import { requireTask } from '@/lib/permissions'

type Ctx = { params: Promise<{ id: string }> }

const patchSchema = z.object({
  done: z.boolean().optional(),
  content: z.string().trim().min(1).max(200).optional(),
})

/** PATCH /api/checklist/:id — toggle or rename. */
export const PATCH = route(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireUser()
  const { id } = await ctx.params
  const item = await db.checklistItem.findUnique({ where: { id }, include: { task: true } })
  if (!item) throw new ApiError(404, 'Butir checklist tidak ditemukan.')
  await requireTask(item.taskId, user, 'MEMBER')
  const body = await parseBody(req, patchSchema)

  const updated = await db.checklistItem.update({ where: { id }, data: body })
  return NextResponse.json({ item: updated })
})

/** DELETE /api/checklist/:id */
export const DELETE = route(async (_req: NextRequest, ctx: Ctx) => {
  const user = await requireUser()
  const { id } = await ctx.params
  const item = await db.checklistItem.findUnique({ where: { id } })
  if (!item) throw new ApiError(404, 'Butir checklist tidak ditemukan.')
  await requireTask(item.taskId, user, 'MEMBER')
  await db.checklistItem.delete({ where: { id } })
  return NextResponse.json({ ok: true })
})
