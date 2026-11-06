import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { badRequest, forbidden, notFound, parseBody, route } from '@/lib/api-helpers'
import { requireUser } from '@/lib/auth'
import { requireMembership, roleAtLeast } from '@/lib/permissions'
import { logActivity } from '@/lib/activity'

type Ctx = { params: Promise<{ id: string }> }

const creatorSelect = { id: true, name: true, avatarColor: true } as const

/** GET /api/documents/:id — single document incl. creator + project summary. */
export const GET = route(async (_req: NextRequest, ctx: Ctx) => {
  const user = await requireUser()
  const { id } = await ctx.params

  const document = await db.document.findUnique({
    where: { id },
    include: {
      creator: { select: creatorSelect },
      project: { select: { id: true, name: true } },
    },
  })
  if (!document) throw notFound('Dokumen tidak ditemukan.')
  await requireMembership(document.workspaceId, user)

  return NextResponse.json({ document })
})

const patchSchema = z.object({
  title: z.string().trim().min(2, 'Judul dokumen minimal 2 karakter.').max(140).optional(),
  content: z.string().max(100_000, 'Konten dokumen terlalu panjang (maks 100.000 karakter).').optional(),
  projectId: z.string().nullable().optional(),
})

/** PATCH /api/documents/:id — partial update (MEMBER+). */
export const PATCH = route(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireUser()
  const { id } = await ctx.params

  const existing = await db.document.findUnique({ where: { id } })
  if (!existing) throw notFound('Dokumen tidak ditemukan.')
  await requireMembership(existing.workspaceId, user, 'MEMBER')
  const body = await parseBody(req, patchSchema)

  if (body.projectId) {
    const project = await db.project.findUnique({ where: { id: body.projectId } })
    if (!project || project.workspaceId !== existing.workspaceId) {
      throw badRequest('Proyek tidak valid.')
    }
  }

  const document = await db.document.update({
    where: { id },
    data: {
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.content !== undefined ? { content: body.content } : {}),
      ...(body.projectId !== undefined ? { projectId: body.projectId || null } : {}),
    },
    include: {
      creator: { select: creatorSelect },
      project: { select: { id: true, name: true } },
    },
  })

  // Content edits arrive from autosave every few seconds — logging an activity
  // event for each one would flood the workspace feed. Log only meaningful
  // metadata changes (title / project link).
  const metadataChanged =
    (body.title !== undefined && body.title !== existing.title) ||
    (body.projectId !== undefined && (body.projectId || null) !== existing.projectId)
  if (metadataChanged) {
    await logActivity(db, {
      workspaceId: existing.workspaceId,
      projectId: document.projectId,
      userId: user.id,
      type: 'DOCUMENT_UPDATED',
      entityType: 'document',
      entityId: document.id,
      entityTitle: document.title,
    })
  }

  return NextResponse.json({ document })
})

/** DELETE /api/documents/:id — MEMBER+, but only the creator or ADMIN+ may delete. */
export const DELETE = route(async (_req: NextRequest, ctx: Ctx) => {
  const user = await requireUser()
  const { id } = await ctx.params

  const existing = await db.document.findUnique({ where: { id } })
  if (!existing) throw notFound('Dokumen tidak ditemukan.')
  const membership = await requireMembership(existing.workspaceId, user, 'MEMBER')

  if (!roleAtLeast(membership.role, 'ADMIN') && existing.createdById !== user.id) {
    throw forbidden('Hanya pembuat atau admin yang dapat menghapus dokumen ini.')
  }

  await db.document.delete({ where: { id } })

  await logActivity(db, {
    workspaceId: existing.workspaceId,
    projectId: existing.projectId,
    userId: user.id,
    type: 'DOCUMENT_DELETED',
    entityType: 'document',
    entityId: null,
    entityTitle: existing.title,
  })

  return NextResponse.json({ ok: true })
})
