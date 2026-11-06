/**
 * Search scoping + notifications (dedupe, read state).
 */
import { describe, it, expect } from 'bun:test'
import { api, createProject, createTask, registerUser, userWithWorkspace } from './helpers'

describe('global search', () => {
  it('returns scoped results for members and requires membership', async () => {
    const { user, workspaceId } = await userWithWorkspace('Cari Pemilik')
    const projectId = await createProject(user, workspaceId, 'Laporan Keuangan Q3')
    await createTask(user, projectId, 'Hitung pajak warung')

    const res = await api(user, 'GET', `/api/search?workspaceId=${workspaceId}&q=pajak`)
    expect(res.status).toBe(200)
    expect(res.body.tasks.length).toBeGreaterThan(0)

    const outsider = await registerUser('Cari Orang Luar')
    const denied = await api(outsider, 'GET', `/api/search?workspaceId=${workspaceId}&q=pajak`)
    expect(denied.status).toBe(404)

    // short queries return empty, not an error
    const short = await api(user, 'GET', `/api/search?workspaceId=${workspaceId}&q=a`)
    expect(short.status).toBe(200)
    expect(short.body.tasks).toHaveLength(0)
  })
})

describe('notifications', () => {
  it('notifies the assignee exactly ONCE per assignment event (dedupeKey)', async () => {
    const owner = await userWithWorkspace('Notif Owner')
    const member = await registerUser('Notif Member')

    // member joins owner's workspace via invitation
    const invite = await api(owner.user, 'POST', `/api/workspaces/${owner.workspaceId}/members`, {
      email: member.email,
      role: 'MEMBER',
    })
    expect(invite.status).toBe(201)
    const list = await api(member, 'GET', '/api/invitations')
    const pending = list.body.invitations[0]
    await api(member, 'POST', '/api/invitations', { invitationId: pending.id, action: 'ACCEPT' })

    const projectId = await createProject(owner.user, owner.workspaceId, 'Proyek Notif')
    const task = await createTask(owner.user, projectId, 'Tugas Notif')

    // assign → notification
    const assign1 = await api(owner.user, 'PATCH', `/api/tasks/${task.id}`, { assigneeId: member.id })
    expect(assign1.status).toBe(200)
    // re-assign the same person → dedupeKey must prevent a duplicate
    const assign2 = await api(owner.user, 'PATCH', `/api/tasks/${task.id}`, { assigneeId: member.id })
    expect(assign2.status).toBe(200)

    const notif = await api(member, 'GET', '/api/notifications')
    expect(notif.status).toBe(200)
    const assigned = notif.body.notifications.filter(
      (n: { type: string; dedupeKey: string | null }) =>
        n.type === 'TASK_ASSIGNED' && n.dedupeKey === `task-assigned:${task.id}:${member.id}`,
    )
    expect(assigned).toHaveLength(1)
    expect(notif.body.unreadCount).toBeGreaterThan(0)
  })

  it('mark-as-read and mark-all-read update unread state', async () => {
    const owner = await userWithWorkspace('Notif Read')
    const member = await registerUser('Notif Read Member')
    const invite = await api(owner.user, 'POST', `/api/workspaces/${owner.workspaceId}/members`, {
      email: member.email,
      role: 'MEMBER',
    })
    expect(invite.status).toBe(201)
    const pending = (await api(member, 'GET', '/api/invitations')).body.invitations[0]
    await api(member, 'POST', '/api/invitations', { invitationId: pending.id, action: 'ACCEPT' })

    const projectId = await createProject(owner.user, owner.workspaceId, 'Proyek Notif Read')
    const t1 = await createTask(owner.user, projectId, 'Tugas Notif A')
    const t2 = await createTask(owner.user, projectId, 'Tugas Notif B')
    await api(owner.user, 'PATCH', `/api/tasks/${t1.id}`, { assigneeId: member.id })
    await api(owner.user, 'PATCH', `/api/tasks/${t2.id}`, { assigneeId: member.id })

    const before = await api(member, 'GET', '/api/notifications')
    const unreadBefore = before.body.unreadCount
    expect(unreadBefore).toBeGreaterThanOrEqual(2)

    // mark all read
    const markAll = await api(member, 'POST', '/api/notifications/read', { all: true })
    expect(markAll.status).toBe(200)
    const after = await api(member, 'GET', '/api/notifications')
    expect(after.body.unreadCount).toBe(0)
  })

  it('users only ever see their own notifications', async () => {
    const a = await registerUser('Notif Milik A')
    const b = await registerUser('Notif Milik B')
    const listA = await api(a, 'GET', '/api/notifications')
    const listB = await api(b, 'GET', '/api/notifications')
    expect(listA.status).toBe(200)
    expect(listB.status).toBe(200)
    // no cross-leak: every returned notification belongs to the caller
    for (const n of listB.body.notifications) {
      expect(n.userId).toBe(b.id)
    }
  })
})
