import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { parseBody, route } from '@/lib/api-helpers'
import { requireUser } from '@/lib/auth'
import { requireMembership } from '@/lib/permissions'

type Ctx = { params: Promise<{ id: string }> }

/** GET /api/workspaces/:id/labels */
export const GET = route(async (_req: NextRequest, ctx: Ctx) => {
  const user = await requireUser()
  const { id } = await ctx.params
  await requireMembership(id, user)
  const labels = await db.label.findMany({ where: { workspaceId: id }, orderBy: { name: 'asc' } })
  return NextResponse.json({ labels })
})

const schema = z.object({
  name: z.string().trim().min(1, 'Nama label wajib.').max(24),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#7D756A'),
})

/** POST /api/workspaces/:id/labels — MEMBER+. */
export const POST = route(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireUser()
  const { id } = await ctx.params
  await requireMembership(id, user, 'MEMBER')
  const body = await parseBody(req, schema)

  const label = await db.label.create({ data: { workspaceId: id, name: body.name, color: body.color } })
  return NextResponse.json({ label }, { status: 201 })
})
