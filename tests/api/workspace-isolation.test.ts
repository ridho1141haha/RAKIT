/**
 * Workspace security: cross-workspace isolation, role enforcement,
 * guessed-ID manipulation, label workspace isolation (P1.2).
 */
import { describe, it, expect } from 'bun:test'
import {
  api,
  authHeaders,
  createProject,
  createTask,
  getTasks,
  registerUser,
  userWithWorkspace,
} from './helpers'
import { BASE_URL } from './helpers'

describe('workspace isolation', () => {
  it('outsiders get 404 (not 403/200) on another workspace’s projects, tasks, dashboard', async () => {
    const ownerCtx = await userWithWorkspace('Pemilik Data')
    const owner = ownerCtx.user
    const outsider = await registerUser('Orang Luar')
    const projectId = await createProject(owner, ownerCtx.workspaceId, 'Proyek Rahasia')
    await createTask(owner, projectId, 'Tugas rahasia')

    // direct project access
    const project = await api(outsider, 'GET', `/api/projects/${projectId}`)
    expect(project.status).toBe(404)

    // tasks list
    const tasks = await api(outsider, 'GET', `/api/projects/${projectId}/tasks`)
    expect(tasks.status).toBe(404)

    // dashboard scoped to the owner's workspace
    const dash = await api(outsider, 'GET', `/api/dashboard?workspaceId=${ownerCtx.workspaceId}`)
    expect(dash.status).toBe(404)

    // workspace members list
    const members = await api(outsider, 'GET', `/api/workspaces/${ownerCtx.workspaceId}/members`)
    expect(members.status).toBe(404)
  })

  it('unauthenticated requests to protected APIs return 401', async () => {
    const { user, workspaceId } = await userWithWorkspace('Tanpa Sesi')
    const projectId = await createProject(user, workspaceId, 'Proyek Sesi')

    const bare = [
      ['GET', `/api/projects/${projectId}`],
      ['GET', `/api/projects/${projectId}/tasks`],
      ['GET', `/api/workspaces/${workspaceId}/projects`],
      ['GET', '/api/notifications'],
      ['GET', `/api/dashboard?workspaceId=${workspaceId}`],
    ] as const
    for (const [method, path] of bare) {
      const res = await fetch(`${BASE_URL}${path}`, { method })
      expect(res.status).toBe(401)
    }
  })

  it('guessed task IDs from another workspace cannot be mutated', async () => {
    const ownerCtx = await userWithWorkspace('Pemilik Tugas')
    const owner = ownerCtx.user
    const attacker = await registerUser('Penyerang Tebak')
    const projectId = await createProject(owner, ownerCtx.workspaceId, 'Proyek Korban')
    const task = await createTask(owner, projectId, 'Tugas Korban')

    const patch = await api(attacker, 'PATCH', `/api/tasks/${task.id}`, { title: 'Direbut' })
    expect(patch.status).toBe(404)
    const del = await api(attacker, 'DELETE', `/api/tasks/${task.id}`)
    expect(del.status).toBe(404)

    // the task is untouched
    const tasks = await getTasks(owner, projectId)
    expect(tasks.find((t) => t.id === task.id)?.title).toBe('Tugas Korban')
  })
})

describe('roles & permissions', () => {
  async function inviteAndAccept(
    owner: { cookie: string },
    workspaceId: string,
    inviteeEmail: string,
    role: 'ADMIN' | 'MEMBER' | 'VIEWER',
  ): Promise<void> {
    const invite = await api(owner as never, 'POST', `/api/workspaces/${workspaceId}/members`, {
      email: inviteeEmail,
      role,
    })
    expect(invite.status).toBe(201)
  }

  it('VIEWER can read but not create tasks; MEMBER can create (invitation flow)', async () => {
    const ownerCtx = await userWithWorkspace('Owner Peran')
    const owner = ownerCtx.user
    const viewer = await registerUser('Viewer Peran')
    const member = await registerUser('Member Peran')
    const { workspaceId } = ownerCtx

    await inviteAndAccept(owner, workspaceId, viewer.email, 'VIEWER')
    await inviteAndAccept(owner, workspaceId, member.email, 'MEMBER')

    // invitees accept via /api/invitations (matched by email)
    for (const invitee of [viewer, member]) {
      const list = await api(invitee, 'GET', '/api/invitations')
      expect(list.status).toBe(200)
      const pending = list.body.invitations.find(
        (i: { email: string; status: string }) => i.email === invitee.email && i.status === 'PENDING',
      )
      expect(pending).toBeDefined()
      const accept = await api(invitee, 'POST', '/api/invitations', {
        invitationId: pending.id,
        action: 'ACCEPT',
      })
      expect(accept.status).toBe(200)
    }

    const projectId = await createProject(owner, workspaceId, 'Proyek Peran')

    // viewer reads fine…
    const read = await api(viewer, 'GET', `/api/projects/${projectId}/tasks`)
    expect(read.status).toBe(200)
    // …but cannot create
    const viewerCreate = await api(viewer, 'POST', `/api/projects/${projectId}/tasks`, {
      title: 'Tugas dari viewer',
    })
    expect(viewerCreate.status).toBe(403)

    // member creates fine
    const memberCreate = await api(member, 'POST', `/api/projects/${projectId}/tasks`, {
      title: 'Tugas dari member',
    })
    expect(memberCreate.status).toBe(201)

    // viewer cannot update a task either
    const patch = await api(viewer, 'PATCH', `/api/tasks/${memberCreate.body.task.id}`, {
      title: 'Diubah viewer',
    })
    expect(patch.status).toBe(403)
  })

  it('a member of workspace A cannot read workspace B data via search', async () => {
    const ownerCtxA = await userWithWorkspace('Cari A')
    const ownerB = await registerUser('Cari B')
    await createProject(ownerCtxA.user, ownerCtxA.workspaceId, 'NamaUnikRahasiaXYZ')

    const search = await api(ownerB, 'GET', `/api/search?workspaceId=${ownerCtxA.workspaceId}&q=NamaUnikRahasia`)
    expect(search.status).toBe(404) // not a member → no access
  })
})

describe('P1.2 — label workspace isolation', () => {
  it('rejects attaching a label from ANOTHER workspace to a task', async () => {
    const ctxA = await userWithWorkspace('Label A')
    const ctxB = await userWithWorkspace('Label B')
    const ownerA = ctxA.user
    const ownerB = ctxB.user

    const projectIdA = await createProject(ownerA, ctxA.workspaceId, 'Proyek Label A')
    const projectIdB = await createProject(ownerB, ctxB.workspaceId, 'Proyek Label B')

    // label lives in workspace A…
    const labelRes = await api(ownerA, 'POST', `/api/workspaces/${ctxA.workspaceId}/labels`, {
      name: 'LabelLuar',
    })
    expect(labelRes.status).toBe(201)
    const foreignLabelId = labelRes.body.label.id

    // …task lives in workspace B
    const task = await createTask(ownerB, projectIdB, 'Tugas Label B')

    const attach = await api(ownerB, 'PATCH', `/api/tasks/${task.id}`, {
      labelIds: [foreignLabelId],
    })
    expect(attach.status).toBe(403)
    expect(attach.body.error).toContain('Label tidak valid')

    // the foreign label was NOT attached
    const taskDetail = await api(ownerB, 'GET', `/api/tasks/${task.id}`)
    expect(taskDetail.body.task.labels).toHaveLength(0)

    // also rejected at task CREATION
    const createWithForeign = await api(ownerB, 'POST', `/api/projects/${projectIdB}/tasks`, {
      title: 'Tugas dengan label luar',
      labelIds: [foreignLabelId],
    })
    expect(createWithForeign.status).toBe(403)

    // and unknown label IDs are rejected too
    const createWithBogus = await api(ownerB, 'POST', `/api/projects/${projectIdB}/tasks`, {
      title: 'Tugas dengan label palsu',
      labelIds: ['label-tidak-ada-123'],
    })
    expect(createWithBogus.status).toBe(403)
  })

  it('attaching a label from the SAME workspace still works (no regression)', async () => {
    const { user, workspaceId } = await userWithWorkspace('Label Own')
    const projectId = await createProject(user, workspaceId, 'Proyek Label Own')

    const labelRes = await api(user, 'POST', `/api/workspaces/${workspaceId}/labels`, {
      name: 'LabelDalam',
    })
    const labelId = labelRes.body.label.id
    const task = await createTask(user, projectId, 'Tugas Label Own', { labelIds: [labelId] })

    const detail = await api(user, 'GET', `/api/tasks/${task.id}`)
    expect(detail.status).toBe(200)
    expect(detail.body.task.labels).toHaveLength(1)
    expect(detail.body.task.labels[0].id).toBe(labelId)
  })

  it('rejects milestone IDs from another project (guessed-ID manipulation)', async () => {
    const { user, workspaceId } = await userWithWorkspace('Milestone Guard')
    const projectA = await createProject(user, workspaceId, 'Proyek M A')
    const projectB = await createProject(user, workspaceId, 'Proyek M B')

    const msRes = await api(user, 'POST', `/api/projects/${projectA}/milestones`, {
      name: 'Milestone A',
    })
    expect(msRes.status).toBe(201)
    const foreignMilestoneId = msRes.body.milestone.id

    const task = await createTask(user, projectB, 'Tugas M B')
    const patch = await api(user, 'PATCH', `/api/tasks/${task.id}`, {
      milestoneId: foreignMilestoneId,
    })
    expect(patch.status).toBe(400)
  })

  it('rejects assigning a user who is not a member of the workspace', async () => {
    const outsider = await registerUser('Bukan Anggota')
    const { user, workspaceId } = await userWithWorkspace('Assign Guard')
    const projectId = await createProject(user, workspaceId, 'Proyek Assign')

    const task = await createTask(user, projectId, 'Tugas Assign')
    const patch = await api(user, 'PATCH', `/api/tasks/${task.id}`, { assigneeId: outsider.id })
    expect(patch.status).toBe(400)
  })
})
