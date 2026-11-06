import { test, expect, type Page } from '@playwright/test'
import { loginViaUI, navButton, uniq, dragCardToColumn, columnTitles, DEMO } from './helpers'

// 4. Task creation + 5. Kanban reorder with reload persistence.
// NOTE: RAKIT is a single-route SPA (view state lives in the store, not the
// URL), so after page.reload() we must navigate back into the project before
// inspecting the board.
test.describe('kanban', () => {
  let projName: string

  test.beforeEach(async ({ page }) => {
    await loginViaUI(page, DEMO.email, DEMO.password)
    projName = uniq('QA Papan')
    await navButton(page, 'Proyek').click()
    await page.getByRole('button', { name: 'Proyek Baru' }).first().click()
    await page.getByLabel('Nama proyek').fill(projName)
    await page.getByRole('button', { name: 'Buat Proyek' }).click()
    await expect(page.getByText(projName).first()).toBeVisible()
    await page.getByText(projName).first().click()
    await expect(page.getByRole('button', { name: 'Tugas Baru' })).toBeVisible()
  })

  async function createTask(page: Page, column: string, title: string) {
    await page.getByRole('button', { name: `Tambah tugas di ${column}` }).click()
    await page.getByLabel('Judul').fill(title)
    await page.getByRole('button', { name: 'Buat Tugas' }).click()
    await expect(page.getByLabel('Judul')).toBeHidden()
    await expect(page.locator(`section[aria-label="Kolom ${column}"]`).getByText(title)).toBeVisible()
  }

  /** After reload the SPA lands on the dashboard — navigate back into the project. */
  async function reopenProject(page: Page) {
    await expect(page.locator('nav[aria-label="Navigasi utama"]')).toBeVisible({ timeout: 15_000 })
    await navButton(page, 'Proyek').click()
    await page.getByText(projName).first().click()
    await expect(page.getByRole('button', { name: 'Tugas Baru' })).toBeVisible({ timeout: 15_000 })
  }

  test('task creation appears on the board', async ({ page }) => {
    const a = uniq('Tugas Buat')
    await createTask(page, 'To Do', a)
    await expect(page.locator(`section[aria-label="Kolom To Do"]`).getByText(a)).toBeVisible()
  })

  test('same-column reorder persists across reload', async ({ page }) => {
    const [a, b, c] = [uniq('Kartu A'), uniq('Kartu B'), uniq('Kartu C')]
    await createTask(page, 'To Do', a)
    await createTask(page, 'To Do', b)
    await createTask(page, 'To Do', c)
    await expect.poll(() => columnTitles(page, 'To Do')).toEqual([a, b, c])

    // drag C to the top of To Do
    await dragCardToColumn(page, c, 'To Do', 'top')
    await expect.poll(() => columnTitles(page, 'To Do')).toEqual([c, a, b])

    // reload → navigate back → order must survive (server persisted all positions)
    await page.reload()
    await reopenProject(page)
    await expect.poll(() => columnTitles(page, 'To Do')).toEqual([c, a, b])
  })

  test('cross-column drag persists across reload (source column compacts)', async ({ page }) => {
    const [a, b] = [uniq('Pindah A'), uniq('Pindah B')]
    await createTask(page, 'To Do', a)
    await createTask(page, 'To Do', b)
    await expect.poll(() => columnTitles(page, 'To Do')).toEqual([a, b])

    // drag A into Dikerjakan
    await dragCardToColumn(page, a, 'Dikerjakan', 'bottom')
    await expect.poll(() => columnTitles(page, 'Dikerjakan')).toEqual([a])
    await expect.poll(() => columnTitles(page, 'To Do')).toEqual([b])

    await page.reload()
    await reopenProject(page)
    await expect.poll(() => columnTitles(page, 'Dikerjakan')).toEqual([a])
    await expect.poll(() => columnTitles(page, 'To Do')).toEqual([b])

    // drag it back into To Do → appended, order [b, a]
    await dragCardToColumn(page, a, 'To Do', 'bottom')
    await expect.poll(() => columnTitles(page, 'To Do')).toEqual([b, a])
    await page.reload()
    await reopenProject(page)
    await expect.poll(() => columnTitles(page, 'To Do')).toEqual([b, a])
  })

  test('keyboard-accessible move menu persists (Selesai keeps completedAt)', async ({ page }) => {
    const a = uniq('Menu Pindah')
    await createTask(page, 'To Do', a)

    // open the card's "Pindah ke" menu and choose Selesai
    const col = page.locator('section[aria-label="Kolom To Do"]')
    await col.locator('article', { hasText: a }).getByRole('button', { name: 'Pindahkan tugas ke kolom lain' }).click()
    await page.getByRole('menuitem', { name: 'Selesai', exact: true }).click()
    await expect.poll(() => columnTitles(page, 'Selesai')).toContain(a)

    await page.reload()
    await reopenProject(page)
    await expect.poll(() => columnTitles(page, 'Selesai')).toContain(a)
    await expect.poll(() => columnTitles(page, 'To Do')).not.toContain(a)
  })
})
