/**
 * Shared helpers for the RAKIT API integration tests.
 * The server under test runs against a throwaway database (see run.ts);
 * every suite registers its own accounts — no shared fixtures, no prod data.
 */
export const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:4311'
export const RUN_ID = process.env.TEST_RUN_ID ?? 'dev'

export type TestUser = {
  id: string
  email: string
  name: string
  /** Cookie value ("rakit_session=…") for authenticated requests. */
  cookie: string
}

let counter = 0
export function uniqueEmail(prefix: string): string {
  counter += 1
  return `${prefix}-${RUN_ID}-${counter}-${randomSuffix()}@test.local`
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8)
}

/** Register a fresh user; returns the user plus a usable session cookie. */
export async function registerUser(name: string): Promise<TestUser> {
  const email = uniqueEmail(name.toLowerCase().replace(/\s+/g, '.'))
  const res = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password: 'test-password-123' }),
  })
  if (res.status !== 200) {
    throw new Error(`registerUser failed: ${res.status} ${await res.text()}`)
  }
  const data = (await res.json()) as { user: { id: string; email: string; name: string } }
  const setCookie = res.headers.get('set-cookie') ?? ''
  const cookie = setCookie.split(';')[0]
  if (!cookie.startsWith('rakit_session=')) {
    throw new Error('register did not return a rakit_session cookie')
  }
  return { id: data.user.id, email, name, cookie }
}

export async function login(email: string, password: string): Promise<{ status: number; cookie: string; body: unknown }> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]
  const body = await res.json().catch(() => null)
  return { status: res.status, cookie, body }
}

export function authHeaders(user: TestUser, json = true): Record<string, string> {
  return {
    Cookie: user.cookie,
    ...(json ? { 'Content-Type': 'application/json' } : {}),
  }
}

export async function api(
  user: TestUser | null,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<{ status: number; body: any; headers: Headers }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: user ? authHeaders(user) : { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  if (process.env.TEST_TRACE) console.log(`  [trace] ${method} ${path} -> ${res.status}`)
  let parsed: any = null
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    parsed = text
  }
  return { status: res.status, body: parsed, headers: res.headers }
}

/** Convenience: register a user and create a workspace owned by them. */
export async function userWithWorkspace(name: string): Promise<{ user: TestUser; workspaceId: string }> {
  const user = await registerUser(name)
  const res = await api(user, 'POST', '/api/workspaces', { name: `${name} Workspace` })
  if (res.status !== 201) throw new Error(`workspace create failed: ${res.status} ${JSON.stringify(res.body)}`)
  return { user, workspaceId: res.body.workspace.id }
}

/** Convenience: create a project inside a workspace. */
export async function createProject(
  user: TestUser,
  workspaceId: string,
  projectName: string,
): Promise<string> {
  const res = await api(user, 'POST', `/api/workspaces/${workspaceId}/projects`, { name: projectName })
  if (res.status !== 201) throw new Error(`project create failed: ${res.status} ${JSON.stringify(res.body)}`)
  return res.body.project.id
}

/** Convenience: create a task in a project. */
export async function createTask(
  user: TestUser,
  projectId: string,
  title: string,
  extra: Record<string, unknown> = {},
): Promise<{ id: string; status: string; position: number }> {
  const res = await api(user, 'POST', `/api/projects/${projectId}/tasks`, { title, ...extra })
  if (res.status !== 201) throw new Error(`task create failed: ${res.status} ${JSON.stringify(res.body)}`)
  return res.body.task
}

/** Fetch a project's tasks, ordered like the board does. */
export async function getTasks(
  user: TestUser,
  projectId: string,
): Promise<Array<{ id: string; title: string; status: string; position: number }>> {
  const res = await api(user, 'GET', `/api/projects/${projectId}/tasks`)
  if (res.status !== 200) throw new Error(`tasks fetch failed: ${res.status}`)
  return res.body.tasks
}
