import { test, expect } from '@playwright/test'
import { loginViaUI, loginApi, uniq, DEMO } from './helpers'

const BASE = 'http://localhost:3000'

// 9. Notifications — assigning a task generates a real notification for the
// assignee; marking all as read clears the unread badge.
test.describe('notifications', () => {
  test('task assignment notifies the assignee and can be marked read', async ({ page, playwright }) => {
    // ── arrange via API (the same endpoints the UI uses) ──
    const demo = await playwright.request.newContext({ baseURL: BASE })
    await loginApi(demo, DEMO.email, DEMO.password)

    const me = await (await demo.get(`${BASE}/api/auth/me`)).json()
    expect(me.user, 'demo API login must yield a user').toBeTruthy()
    const wsId = me.workspaces[0].id as string
    const projects = await (await demo.get(`${BASE}/api/workspaces/${wsId}/projects`)).json()
    expect(projects.projects.length, 'seed workspace must have projects').toBeGreaterThan(0)
    const projectId = projects.projects[0].id as string

    // sari must be a workspace member eligible as assignee
    const members = await (await demo.get(`${BASE}/api/projects/${projectId}/members`)).json()
    const sariMember = (members.eligible ?? members.members ?? []).find(
      (m: { email?: string; user?: { email?: string } }) =>
        m.email === 'sari@rakit.id' || m.user?.email === 'sari@rakit.id',
    )
    const sariId =
      (sariMember?.userId as string | undefined) ??
      (sariMember?.user?.id as string | undefined) ??
      (sariMember?.id as string | undefined)
    if (!sariId) {
      // fall back to /api/auth/me as sari via a second API context
      const sariCtx = await playwright.request.newContext({ baseURL: BASE })
      await loginApi(sariCtx, 'sari@rakit.id', 'demo123')
      const sariMe = await (await sariCtx.get(`${BASE}/api/auth/me`)).json()
      expect(sariMe.user).toBeTruthy()
      const created0 = await demo.post(`${BASE}/api/projects/${projectId}/tasks`, {
        data: { title: uniq('Tugas Notifikasi'), assigneeId: sariMe.user.id as string },
      })
      expect(created0.status(), JSON.stringify(await created0.json())).toBe(201)
      await sariCtx.dispose()
    } else {
      const taskTitle = uniq('Tugas Notifikasi')
      const created = await demo.post(`${BASE}/api/projects/${projectId}/tasks`, {
        data: { title: taskTitle, assigneeId: sariId },
      })
      expect(created.status(), JSON.stringify(await created.json())).toBe(201)
    }

    // ── act & assert through the UI as sari ──
    await loginViaUI(page, 'sari@rakit.id', 'demo123')

    // the bell's aria-label carries the unread count ("Notifikasi, N belum dibaca");
    // scoped to <header> — once unread hits 0 the sidebar item matches the same name
    const bell = page.locator('header').getByRole('button', { name: /^Notifikasi(, \d+ belum dibaca)?$/ })
    await expect(bell).toBeVisible()
    await expect(bell).toHaveAttribute('aria-label', /belum dibaca/)
    await bell.click()
    await expect(page.locator('div').getByText(/Tugas Notifikasi|Tugas baru untukmu/).first()).toBeVisible({ timeout: 10_000 })

    // mark all read → unread marker disappears
    await page.getByRole('button', { name: 'Tandai semua dibaca' }).click()
    await expect(bell, 'unread marker should be gone').not.toHaveAttribute('aria-label', /belum dibaca/, {
      timeout: 10_000,
    })
    await page.keyboard.press('Escape')

    await demo.dispose()
  })
})
