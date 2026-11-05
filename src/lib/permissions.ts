import { db } from '@/lib/db'
import { forbidden, notFound } from '@/lib/api-helpers'
import { ROLE_LEVEL, type Role } from '@/lib/constants'
import type { SessionUser } from '@/lib/auth'

export type Membership = {
  id: string
  workspaceId: string
  userId: string
  role: Role
}

/**
 * Resolve the caller's workspace membership and enforce a minimum role.
 * ALWAYS call this server-side before touching workspace-scoped data —
 * client-supplied workspace/project IDs are never trusted on their own.
 */
export async function requireMembership(
  workspaceId: string,
  user: Pick<SessionUser, 'id'>,
  min: Role = 'VIEWER',
): Promise<Membership> {
  const membership = await db.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: user.id } },
  })
  if (!membership) throw notFound('Workspace tidak ditemukan atau kamu bukan anggotanya.')
  if (ROLE_LEVEL[membership.role as Role] < ROLE_LEVEL[min]) {
    throw forbidden(`Aksi ini membutuhkan peran minimal ${min.toLowerCase()}.`)
  }
  return { ...membership, role: membership.role as Role }
}

/**
 * Resolve a project through the caller's workspace membership.
 * Guarantees cross-workspace isolation: a project id from another workspace 404s.
 */
export async function requireProject(
  projectId: string,
  user: Pick<SessionUser, 'id'>,
  min: Role = 'VIEWER',
) {
  const project = await db.project.findUnique({
    where: { id: projectId },
    include: { workspace: { select: { id: true, name: true } } },
  })
  if (!project) throw notFound('Proyek tidak ditemukan.')
  const membership = await requireMembership(project.workspaceId, user, min)
  return { project, membership }
}

/** Resolve a task through its project and the caller's membership. */
export async function requireTask(taskId: string, user: Pick<SessionUser, 'id'>, min: Role = 'VIEWER') {
  const task = await db.task.findUnique({
    where: { id: taskId },
    include: {
      project: { select: { id: true, workspaceId: true, name: true } },
    },
  })
  if (!task) throw notFound('Tugas tidak ditemukan.')
  const membership = await requireMembership(task.project.workspaceId, user, min)
  return { task, membership }
}

export function roleAtLeast(role: string, min: Role): boolean {
  return (ROLE_LEVEL[role as Role] ?? 0) >= ROLE_LEVEL[min]
}
