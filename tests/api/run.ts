/**
 * RAKIT API integration test runner.
 *
 * Spins up an ISOLATED test stack and runs the bun test suites against it:
 *   1. creates a throwaway SQLite database (db/test-<runid>.db)
 *   2. applies the Prisma migrations to it (`prisma migrate deploy`)
 *   3. starts `next dev` on a dedicated port with that DATABASE_URL
 *   4. runs tests/api/*.test.ts via `bun test`
 *   5. tears everything down (kills the server, deletes the temp DB)
 *
 * Run: bun run tests/api/run.ts   (or: bun run test)
 * The suites only use accounts they register themselves — production data is
 * never touched because the server runs against the throwaway database.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { closeSync, existsSync, openSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const REPO_ROOT = path.resolve(import.meta.dir, '..', '..')
const PORT = 4311
const BASE_URL = `http://localhost:${PORT}`
const RUN_ID = randomBytes(4).toString('hex')
const TEST_DB = path.join(REPO_ROOT, 'db', `test-${RUN_ID}.db`)
const DATABASE_URL = `file:${TEST_DB}`
const PRISMA_BIN = path.join(REPO_ROOT, 'node_modules', '.bin', 'prisma')

let server: ChildProcess | null = null
let serverLogFd: number | null = null
const serverLogPath = path.join(os.tmpdir(), `rakit-test-server-${RUN_ID}.log`)

function serverLogTail(maxBytes = 3000): string {
  try {
    const content = readFileSync(serverLogPath, 'utf8')
    return content.length > maxBytes ? content.slice(-maxBytes) : content
  } catch {
    return ''
  }
}

function run(cmd: string, args: string[], env: Record<string, string>): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: REPO_ROOT,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let out = ''
    child.stdout.on('data', (d) => (out += d))
    child.stderr.on('data', (d) => (out += d))
    child.on('exit', (code) => (code === 0 ? resolve(0) : reject(new Error(`${cmd} exited ${code}\n${out}`))))
  })
}

async function waitForServer(timeoutMs = 90_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE_URL}/api/auth/me`)
      if (res.status === 401 || res.ok) return // server answers
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`Test server did not become ready in ${timeoutMs}ms.\n${serverLogTail(4000)}`)
}

/** One request per API route so `next dev` compiles everything BEFORE the
 * suites run — otherwise cold route-compile queueing can starve the first
 * tests to hit a route (they time out waiting for the response). */
const WARMUP_PATHS = [
  '/api/auth/me',
  '/api/auth/login',
  '/api/auth/register',
  '/api/workspaces',
  '/api/workspaces/warmup',
  '/api/workspaces/warmup/projects',
  '/api/workspaces/warmup/documents',
  '/api/workspaces/warmup/labels',
  '/api/workspaces/warmup/ideas',
  '/api/workspaces/warmup/members',
  '/api/workspaces/warmup/members/warmup',
  '/api/workspaces/warmup/activity',
  '/api/projects/warmup',
  '/api/projects/warmup/tasks',
  '/api/projects/warmup/tasks/reorder',
  '/api/projects/warmup/milestones',
  '/api/projects/warmup/milestones/warmup',
  '/api/projects/warmup/members',
  '/api/projects/warmup/members/warmup',
  '/api/projects/warmup/activity',
  '/api/tasks/warmup',
  '/api/tasks/warmup/checklist',
  '/api/tasks/warmup/comments',
  '/api/checklist/warmup',
  '/api/documents/warmup',
  '/api/ideas/warmup',
  '/api/ideas/warmup/convert',
  '/api/invitations',
  '/api/notifications',
  '/api/notifications/read',
  '/api/my-tasks',
  '/api/dashboard?workspaceId=warmup',
  '/api/search?workspaceId=warmup&q=warmup',
]

async function warmupRoutes(): Promise<void> {
  const t0 = Date.now()
  for (const p of WARMUP_PATHS) {
    for (const method of ['GET', 'PATCH'] as const) {
      try {
        await fetch(`${BASE_URL}${p}`, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: method === 'PATCH' ? JSON.stringify({}) : undefined,
          signal: AbortSignal.timeout(120_000),
        })
      } catch {
        // warmup best-effort: a route that never answers is still a problem
        // the suites will surface with a clear failure
      }
    }
  }
  console.log(`[test] routes warmed in ${Math.round((Date.now() - t0) / 1000)}s`)
}

async function main(): Promise<number> {
  console.log(`[test] run id: ${RUN_ID}`)
  console.log(`[test] temp database: ${TEST_DB}`)

  // 1+2. fresh database with the versioned migrations
  rmSync(TEST_DB, { force: true })
  await run(PRISMA_BIN, ['migrate', 'deploy'], { DATABASE_URL })
  console.log('[test] migrations applied')

  // 3. dev server against the temp database (dedicated port, demo login on)
  // IMPORTANT: server output goes to a FILE, not pipes. While `Bun.spawnSync`
  // runs the suites, this runner cannot drain pipes — a full pipe buffer
  // would block the dev server mid-request and wedge every test (observed).
  const nextBin = path.join(REPO_ROOT, 'node_modules', '.bin', 'next')
  serverLogFd = openSync(serverLogPath, 'a')
  server = spawn(nextBin, ['dev', '-p', String(PORT)], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      DATABASE_URL,
      NEXT_PUBLIC_DEMO_MODE: 'true',
      // per-IP in-memory limiter would throttle the suites' many registrations
      RATE_LIMIT_DISABLED: '1',
      BROWSER: 'none',
    },
    stdio: ['ignore', serverLogFd, serverLogFd],
  })
  server.unref?.()

  try {
    await waitForServer()
    console.log(`[test] server ready at ${BASE_URL}`)
    await warmupRoutes()

    // 4. run the suites (60s per test — generous, but no arbitrary sleeps)
    const proc = Bun.spawnSync(
      ['bun', 'test', 'tests/api', '--timeout', '60000'],
      {
        cwd: REPO_ROOT,
        env: { ...process.env, TEST_BASE_URL: BASE_URL, TEST_RUN_ID: RUN_ID },
        stdout: 'inherit',
        stderr: 'inherit',
      },
    )
    return proc.exitCode ?? 1
  } finally {
    // 5. teardown
    if (server?.pid) {
      server.kill('SIGTERM')
      await new Promise((r) => setTimeout(r, 800))
      try {
        server.kill('SIGKILL')
      } catch {
        /* already gone */
      }
    }
    if (serverLogFd !== null) {
      closeSync(serverLogFd)
      serverLogFd = null
    }
    // .next dev artifacts are shared with interactive dev — leave them alone.
    if (existsSync(TEST_DB)) {
      rmSync(TEST_DB, { force: true })
      console.log('[test] temp database removed')
    }
    const tail = serverLogTail()
    if (tail.trim()) {
      console.log(`──── test server log: ${serverLogPath} (tail) ────`)
      console.log(tail)
    }
  }
}

process.exitCode = await main()
