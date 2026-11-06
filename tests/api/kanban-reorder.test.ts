/**
 * P1.1 — Kanban batch reorder contract and persistence.
 */
import { describe, it, expect } from 'bun:test'
import { api, createProject, createTask, getTasks, userWithWorkspace } from './helpers'

async function setupProjectWithTasks(taskCount = 4) {
  const owner = await registerUserSafe()
  const { user, workspaceId } = owner
  const projectId = await createProject(user, workspaceId, `Papan Uji ${Date.now()}`)
  const tasks = []
  for (let i = 0; i < taskCount; i++) {
    const status = i < 2 ? 'TODO' : 'IN_PROGRESS'
    tasks.push(await createTask(user, projectId, `Tugas ${i + 1}`, { status }))
  }
  return { user, workspaceId, projectId, tasks }
}

let seq = 0
async function registerUserSafe() {
  seq += 1
  return userWithWorkspace(`Papan ${seq}`)
}

describe('kanban reorder (P1.1)', () => {
  it('persists a SAME-COLUMN reorder for every affected card after refresh', async () => {
    const { user, projectId, tasks } = await setupProjectWithTasks()
    const [a, b] = tasks.filter((t) => t.status === 'TODO')

    // move b to the front of TODO (client sends the full post-drop column)
    const res = await api(user, 'PATCH', `/api/projects/${projectId}/tasks/reorder`, {
      columns: [{ status: 'TODO', taskIds: [b.id, a.id] }],
      movedTaskId: b.id,
    })
    expect(res.status).toBe(200)

    // refresh — order must match what the user saw
    const after = await getTasks(user, projectId)
    const todo = after.filter((t) => t.status === 'TODO')
    expect(todo.map((t) => t.id)).toEqual([b.id, a.id])
    expect(todo.map((t) => t.position)).toEqual([0, 1])
  })

  it('persists a CROSS-COLUMN move for both columns after refresh', async () => {
    const { user, projectId, tasks } = await setupProjectWithTasks()
    const todo = tasks.filter((t) => t.status === 'TODO')
    const prog = tasks.filter((t) => t.status === 'IN_PROGRESS')
    const moved = todo[0]

    const res = await api(user, 'PATCH', `/api/projects/${projectId}/tasks/reorder`, {
      columns: [
        { status: 'TODO', taskIds: [todo[1].id] },
        { status: 'IN_PROGRESS', taskIds: [moved.id, prog[0].id, prog[1].id] },
      ],
      movedTaskId: moved.id,
    })
    expect(res.status).toBe(200)

    const after = await getTasks(user, projectId)
    const afterTodo = after.filter((t) => t.status === 'TODO')
    const afterProg = after.filter((t) => t.status === 'IN_PROGRESS')
    expect(afterTodo.map((t) => t.id)).toEqual([todo[1].id])
    expect(afterProg.map((t) => t.id)).toEqual([moved.id, prog[0].id, prog[1].id])
    expect(afterProg.map((t) => t.position)).toEqual([0, 1, 2])
    // the moved task's status really changed
    expect(after.find((t) => t.id === moved.id)?.status).toBe('IN_PROGRESS')
  })

  it('preserves the ordering of UNAFFECTED columns', async () => {
    const { user, projectId, tasks } = await setupProjectWithTasks()
    const prog = tasks.filter((t) => t.status === 'IN_PROGRESS')
    const todo = tasks.filter((t) => t.status === 'TODO')

    // reorder TODO only
    const res = await api(user, 'PATCH', `/api/projects/${projectId}/tasks/reorder`, {
      columns: [{ status: 'TODO', taskIds: [todo[1].id, todo[0].id] }],
    })
    expect(res.status).toBe(200)

    const after = await getTasks(user, projectId)
    const afterProg = after.filter((t) => t.status === 'IN_PROGRESS')
    expect(afterProg.map((t) => t.id)).toEqual(prog.map((t) => t.id))
  })

  it('rejects duplicate task IDs with 422', async () => {
    const { user, projectId, tasks } = await setupProjectWithTasks()
    const todo = tasks.filter((t) => t.status === 'TODO')
    const res = await api(user, 'PATCH', `/api/projects/${projectId}/tasks/reorder`, {
      columns: [{ status: 'TODO', taskIds: [todo[0].id, todo[1].id, todo[0].id] }],
    })
    expect(res.status).toBe(422)
  })

  it('rejects invalid statuses with 422', async () => {
    const { user, projectId, tasks } = await setupProjectWithTasks()
    const res = await api(user, 'PATCH', `/api/projects/${projectId}/tasks/reorder`, {
      columns: [{ status: 'HACKED', taskIds: [tasks[0].id] }],
    })
    expect(res.status).toBe(422)
  })

  it('rejects task IDs that belong to a DIFFERENT project (400)', async () => {
    const { user, workspaceId, projectId, tasks } = await setupProjectWithTasks()
    const otherProject = await createProject(user, workspaceId, 'Proyek Lain')
    const otherTask = await createTask(user, otherProject, 'Tugas Proyek Lain')

    const res = await api(user, 'PATCH', `/api/projects/${projectId}/tasks/reorder`, {
      columns: [{ status: 'TODO', taskIds: [tasks[0].id, otherTask.id] }],
    })
    expect(res.status).toBe(400)

    // the other project's task is untouched
    const other = await getTasks(user, otherProject)
    expect(other.find((t) => t.id === otherTask.id)?.status).toBe('BACKLOG')
  })

  it('rejects STALE payloads that omit a task currently in the column (409)', async () => {
    const { user, projectId, tasks } = await setupProjectWithTasks()
    const todo = tasks.filter((t) => t.status === 'TODO')

    // omit todo[1] even though it is currently in the TODO column
    const res = await api(user, 'PATCH', `/api/projects/${projectId}/tasks/reorder`, {
      columns: [{ status: 'TODO', taskIds: [todo[0].id] }],
    })
    expect(res.status).toBe(409)

    // nothing changed
    const after = await getTasks(user, projectId)
    expect(after.filter((t) => t.status === 'TODO').map((t) => t.id)).toEqual([todo[0].id, todo[1].id])
  })

  it('rejects payloads that claim a task is in the WRONG column (409)', async () => {
    const { user, projectId, tasks } = await setupProjectWithTasks()
    const prog = tasks.filter((t) => t.status === 'IN_PROGRESS')
    const res = await api(user, 'PATCH', `/api/projects/${projectId}/tasks/reorder`, {
      columns: [{ status: 'TODO', taskIds: [prog[0].id] }],
    })
    expect(res.status).toBe(409)
  })

  it('rejects movedTaskId that is absent from the payload (400)', async () => {
    const { user, projectId, tasks } = await setupProjectWithTasks()
    const todo = tasks.filter((t) => t.status === 'TODO')
    const res = await api(user, 'PATCH', `/api/projects/${projectId}/tasks/reorder`, {
      columns: [{ status: 'TODO', taskIds: todo.map((t) => t.id) }],
      movedTaskId: 'task-tidak-ada',
    })
    expect(res.status).toBe(400)
  })

  it('generates a meaningful activity record for the move', async () => {
    const { user, projectId, tasks } = await setupProjectWithTasks()
    const todo = tasks.filter((t) => t.status === 'TODO')
    await api(user, 'PATCH', `/api/projects/${projectId}/tasks/reorder`, {
      columns: [{ status: 'TODO', taskIds: [todo[1].id, todo[0].id] }],
      movedTaskId: todo[1].id,
    })
    const activity = await api(user, 'GET', `/api/projects/${projectId}/activity`)
    expect(activity.status).toBe(200)
    const events = activity.body.events as Array<{ type: string; entityType: string }>
    expect(events.some((e) => e.type === 'TASK_MOVED' && e.entityType === 'task')).toBe(true)
  })

  it('is rejected for members of OTHER workspaces (404 via requireProject)', async () => {
    const { user: owner, projectId, tasks } = await setupProjectWithTasks()
    const outsider = await userWithWorkspace('Papan Orang Luar')
    const todo = tasks.filter((t) => t.status === 'TODO')
    const res = await api(outsider.user, 'PATCH', `/api/projects/${projectId}/tasks/reorder`, {
      columns: [{ status: 'TODO', taskIds: todo.map((t) => t.id) }],
    })
    expect(res.status).toBe(404)
    void owner
  })
})
