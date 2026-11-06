/**
 * E2E — Kanban: keyboard-accessible move menu persists across reload (P1.1).
 * Uses the seeded demo workspace ("Studio Nusantara") for deterministic data.
 * NOTE: RAKIT is a single-route SPA — after a reload the app boots on the
 * dashboard, so tests must navigate back into the project.
 */
import { test, expect, type Page } from '@playwright/test'
import { loginDemo } from '../helpers'

async function openFirstProject(page: Page): Promise<string> {
  await page.getByRole('button', { name: 'Proyek', exact: true }).first().click()
  const projectRow = page.locator('button[type="button"]').filter({ has: page.locator('p.text-base') }).first()
  await projectRow.waitFor({ timeout: 30_000 })
  const projectName = (await projectRow.locator('p.text-base').first().textContent())!.trim()
  await projectRow.click()
  await expect(page.getByText(projectName).first()).toBeVisible({ timeout: 30_000 })
  return projectName
}

test.describe('kanban persistence', () => {
  test('moving a task to another column survives a reload', async ({ page }) => {
    await loginDemo(page)
    await openFirstProject(page)

    // read the first column (BACKLOG) and its first card title
    const firstColumn = page.locator('section[aria-label="Kolom Backlog"]')
    await firstColumn.waitFor({ state: 'visible', timeout: 30_000 })
    const sourceCard = firstColumn.locator('[data-task-id]').first()
    await sourceCard.waitFor({ timeout: 30_000 })
    const cardTitle = (await sourceCard.locator('button').first().textContent())!.trim()

    // open the per-card move menu (keyboard-accessible alternative to dragging)
    await sourceCard.getByRole('button', { name: 'Pindahkan tugas ke kolom lain' }).click()
    // move to DONE — a cross-column move through the batch reorder endpoint.
    // Wait for the persistence request to complete (a reload racing an
    // in-flight mutation is exactly the bug class this suite guards against).
    const reorderResponse = page.waitForResponse(
      (r) => r.url().includes('/tasks/reorder') && r.request().method() === 'PATCH',
      { timeout: 30_000 },
    )
    await page.getByRole('menuitem', { name: 'Selesai' }).click()
    const response = await reorderResponse
    expect(response.status()).toBe(200)

    // optimistic UI: the card disappears from the first column
    await expect(firstColumn).not.toContainText(cardTitle)

    // reload → SPA boots on the dashboard → navigate back to the project
    await page.reload()
    await loginDemo(page) // no-op if the session persisted; returns fast when already signed in
    await openFirstProject(page)

    const firstColumnAfter = page.locator('section[aria-label="Kolom Backlog"]')
    await firstColumnAfter.waitFor({ state: 'visible', timeout: 30_000 })
    await expect(firstColumnAfter).not.toContainText(cardTitle)

    // and the card now lives in the DONE column
    const doneColumn = page.locator('section[aria-label="Kolom Selesai"]')
    await expect(doneColumn).toContainText(cardTitle)
  })
})
