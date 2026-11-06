import { test, expect } from '@playwright/test'

// 6. Cross-workspace isolation — enforced SERVER-SIDE (UI never even offers
// another workspace's labels, so this is tested at the API level with real
// authenticated sessions; the same path the frontend fetch layer uses).

const BASE = 'http://localhost:3000'

type Ctx = Awaited<ReturnType<typeof import('@playwright/test').request.newContext>>

async function registerAndLogin(request: Ctx, name: string): Promise<{ userId: string }> {
  const email = `iso-${name.replace(/[^a-z0-9]/gi, '').toLowerCase()}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}@rakit.test`
  const reg = await request.post(`${BASE}/api/auth/register`, { data: { name, email, password: 'rakit-e2e-passw0rd' } })
  const regJson = await reg.json()
  if (!reg.ok()) throw new Error(`register failed: ${JSON.stringify(regJson)}`)
  return { userId: regJson.user.id as string }
}

async function createWorkspace(request: Ctx, name: string): Promise<string> {
  const res = await request.post(`${BASE}/api/workspaces`, { data: { name } })
  const json = await res.json()
  expect(res.ok()).toBeTruthy()
  return json.workspace.id as string
}

async function createProject(request: Ctx, wsId: string, name: string): Promise<string> {
  const res = await request.post(`${BASE}/api/workspaces/${wsId}/projects`, { data: { name } })
  const json = await res.json()
  expect(res.ok()).toBeTruthy()
  return json.project.id as string
}

async function createTask(request: Ctx, projectId: string, title: string): Promise<string> {
  const res = await request.post(`${BASE}/api/projects/${projectId}/tasks`, { data: { title } })
  const json = await res.json()
  expect(res.ok()).toBeTruthy()
  return json.task.id as string
}

async function createLabel(request: Ctx, wsId: string, name: string): Promise<string> {
  const res = await request.post(`${BASE}/api/workspaces/${wsId}/labels`, { data: { name } })
  const json = await res.json()
  expect(res.ok()).toBeTruthy()
  return json.label.id as string
}

test.describe('isolation', () => {
  test('label from another workspace is rejected on task create and update', async ({ playwright }) => {
    const ctxA = await playwright.request.newContext({ baseURL: BASE })
    const ctxB = await playwright.request.newContext({ baseURL: BASE })

    const userA = await registerAndLogin(ctxA, 'Pengguna A')
    const userB = await registerAndLogin(ctxB, 'Pengguna B')

    const wsA = await createWorkspace(ctxA, `WS A ${Date.now()}`)
    const wsB = await createWorkspace(ctxB, `WS B ${Date.now()}`)

    const projA = await createProject(ctxA, wsA, 'Proyek A')
    const taskA = await createTask(ctxA, projA, 'Tugas target di WS A')
    const labelB = await createLabel(ctxB, wsB, 'Label ilegal dari WS B')

    // CREATE with cross-workspace labelId → 400
    const createRes = await ctxA.post(`${BASE}/api/projects/${projA}/tasks`, {
      data: { title: 'Tugas dengan label asing', labelIds: [labelB] },
    })
    expect(createRes.status()).toBe(400)
    const createJson = await createRes.json()
    expect(createJson.error).toContain('label')

    // UPDATE with cross-workspace labelId → 400, and existing labels untouched
    const patchRes = await ctxA.patch(`${BASE}/api/tasks/${taskA}`, {
      data: { labelIds: [labelB] },
    })
    expect(patchRes.status()).toBe(400)
    const getRes = await ctxA.get(`${BASE}/api/tasks/${taskA}`)
    const getJson = await getRes.json()
    expect(getJson.task.labels).toEqual([]) // no partial modification

    // bogus/nonexistent label id → 400 as well
    const bogusRes = await ctxA.patch(`${BASE}/api/tasks/${taskA}`, {
      data: { labelIds: ['does-not-exist'] },
    })
    expect(bogusRes.status()).toBe(400)

    // sanity: A's own label works
    const labelA = await createLabel(ctxA, wsA, 'Label Sah A')
    const okRes = await ctxA.patch(`${BASE}/api/tasks/${taskA}`, { data: { labelIds: [labelA, labelA] } })
    expect(okRes.ok()).toBeTruthy()
    const okJson = await okRes.json()
    expect(okJson.task.labels).toHaveLength(1) // deduplicated

    await ctxA.dispose()
    await ctxB.dispose()
    void userA
    void userB
  })

  test('users cannot read or reorder other workspaces’ tasks', async ({ playwright }) => {
    const ctxA = await playwright.request.newContext({ baseURL: BASE })
    const ctxB = await playwright.request.newContext({ baseURL: BASE })

    await registerAndLogin(ctxA, 'Pemilik A')
    await registerAndLogin(ctxB, 'Orang Luar B')

    const wsA = await createWorkspace(ctxA, `WS Guard A ${Date.now()}`)
    const projA = await createProject(ctxA, wsA, 'Proyek Guard A')
    const taskA = await createTask(ctxA, projA, 'Tugas rahasia A')

    // B cannot read A's task
    const readRes = await ctxB.get(`${BASE}/api/tasks/${taskA}`)
    expect(readRes.status()).toBe(404)

    // B cannot reorder A's project
    const reorderRes = await ctxB.post(`${BASE}/api/projects/${projA}/tasks/reorder`, {
      data: { columns: [{ status: 'TODO', taskIds: [taskA] }] },
    })
    expect(reorderRes.status()).toBe(404)

    // A cannot smuggle a task id from A's OTHER project into this project's reorder
    const projA2 = await createProject(ctxA, wsA, 'Proyek Guard A2')
    const taskA2 = await createTask(ctxA, projA2, 'Tugas proyek lain A2')
    const crossRes = await ctxA.post(`${BASE}/api/projects/${projA}/tasks/reorder`, {
      data: { columns: [{ status: 'TODO', taskIds: [taskA2] }] },
    })
    expect(crossRes.status()).toBe(400)

    // valid reorder within the project still works
    const taskA3 = await createTask(ctxA, projA, 'Tugas reorder sah')
    const okRes = await ctxA.post(`${BASE}/api/projects/${projA}/tasks/reorder`, {
      data: { movedTaskId: taskA3, columns: [{ status: 'TODO', taskIds: [taskA3, taskA] }] },
    })
    expect(okRes.ok()).toBeTruthy()

    await ctxA.dispose()
    await ctxB.dispose()
  })
})
