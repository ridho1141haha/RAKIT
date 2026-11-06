import { test, expect } from '@playwright/test'
import { loginViaUI, navButton, sidebar, uniq, DEMO } from './helpers'

// 2. Workspace creation + 3. Project creation — through the real UI.
test.describe('workspace & project', () => {
  test('create workspace via switcher', async ({ page }) => {
    await loginViaUI(page, DEMO.email, DEMO.password)
    const wsName = uniq('QA Ruang Kerja')

    // open workspace switcher (desktop sidebar)
    await page.locator('aside').first().getByRole('button').first().click()
    await page.getByRole('menuitem', { name: 'Workspace baru' }).click()
    await page.getByLabel('Nama workspace').fill(wsName)
    await page.getByRole('button', { name: /Buat Workspace|Buat workspace/ }).click()

    // the switcher (and dialog success) reflects the new workspace
    await expect(page.getByText(wsName).first()).toBeVisible({ timeout: 15_000 })
  })

  test('create project and open its board', async ({ page }) => {
    await loginViaUI(page, DEMO.email, DEMO.password)
    const projName = uniq('QA Proyek UI')

    await navButton(page, 'Proyek').click()
    await page.getByRole('button', { name: 'Proyek Baru' }).first().click()
    await page.getByLabel('Nama proyek').fill(projName)
    await page.getByRole('button', { name: /Buat Proyek|Buat proyek/ }).click()

    // project card appears in the list
    await expect(page.getByText(projName).first()).toBeVisible({ timeout: 15_000 })

    // open the project → board with the five kanban columns
    await page.getByText(projName).first().click()
    await expect(page.getByRole('button', { name: 'Tugas Baru' })).toBeVisible()
    for (const col of ['Backlog', 'To Do', 'Dikerjakan', 'Ditinjau', 'Selesai']) {
      await expect(page.locator(`section[aria-label="Kolom ${col}"]`)).toBeVisible()
    }
    // back on projects via breadcrumb-like button
    await expect(sidebar(page)).toBeVisible()
  })
})
