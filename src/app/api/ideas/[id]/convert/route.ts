import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { badRequest, notFound, parseBody, route } from '@/lib/api-helpers'
import { requireUser } from '@/lib/auth'
import { requireMembership } from '@/lib/permissions'
import { logActivity } from '@/lib/activity'

type Ctx = { params: Promise<{ id: string }> }

const convertSchema = z.object({
  mode: z.enum(['project', 'task']),
  projectId: z.string().optional(),
  projectStatus: z.enum(['PLANNING', 'ACTIVE']).optional(),
})

/**
 * POST /api/ideas/:id/convert — turn an idea into a full project (mode 'project')
 * or into a backlog task inside an existing project (mode 'task'). MEMBER+.
 * The idea is marked CONVERTED and linked via convertedProjectId.
 */
export const POST = route(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireUser()
  const { id } = await ctx.params
  const body = await parseBody(req, convertSchema)

  const idea = await db.idea.findUnique({ where: { id } })
  if (!idea) throw notFound('Ide tidak ditemukan.')
  await requireMembership(idea.workspaceId, user, 'MEMBER')

  if (idea.status === 'CONVERTED') {
    throw badRequest('Ide ini sudah dikonversi sebelumnya.')
  }

  if (body.mode === 'project') {
    const project = await db.$transaction(async (tx) => {
      const created = await tx.project.create({
        data: {
          workspaceId: idea.workspaceId,
          name: idea.title.slice(0, 80),
          description: idea.description,
          status: body.projectStatus ?? 'PLANNING',
          priority: idea.priority,
          ownerId: user.id,
          color: '#B9541B',
          members: { create: [{ userId: user.id, role: 'LEAD' }] },
        },
      })
      await tx.idea.update({
        where: { id: idea.id },
        data: { status: 'CONVERTED', convertedProjectId: created.id },
      })
      await logActivity(tx, {
        workspaceId: idea.workspaceId,
        projectId: created.id,
        userId: user.id,
        type: 'IDEA_CONVERTED',
        entityType: 'idea',
        entityId: idea.id,
        entityTitle: idea.title,
        metadata: { mode: 'project', projectId: created.id, projectName: created.name },
      })
      return created
    })

    return NextResponse.json({ project }, { status: 201 })
  }

  // ── mode 'task' — requires a project in the same workspace ──
  const target = body.projectId
    ? await db.project.findUnique({ where: { id: body.projectId } })
    : null
  if (!target || target.workspaceId !== idea.workspaceId) {
    throw badRequest('Proyek tidak valid.')
  }

  const task = await db.$transaction(async (tx) => {
    const last = await tx.task.findFirst({
      where: { projectId: target.id, status: 'BACKLOG' },
      orderBy: { position: 'desc' },
      select: { position: true },
    })
    const created = await tx.task.create({
      data: {
        projectId: target.id,
        title: idea.title,
        description: idea.description,
        status: 'BACKLOG',
        priority: idea.priority,
        assigneeId: user.id,
        createdById: user.id,
        position: (last?.position ?? -1) + 1,
      },
    })
    await tx.idea.update({
      where: { id: idea.id },
      data: { status: 'CONVERTED', convertedProjectId: target.id },
    })
    await logActivity(tx, {
      workspaceId: idea.workspaceId,
      projectId: target.id,
      userId: user.id,
      type: 'IDEA_CONVERTED',
      entityType: 'idea',
      entityId: idea.id,
      entityTitle: idea.title,
      metadata: { mode: 'task', projectId: target.id, projectName: target.name, taskId: created.id },
    })
    return created
  })

  return NextResponse.json({ task }, { status: 201 })
})
