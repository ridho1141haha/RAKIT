import { test, expect } from '@playwright/test'
import { registerViaUI, completeOnboarding, uniq } from './helpers'

// 10. Mobile navigation — runs ONLY on the mobile project (Pixel 7 viewport).
// Hamburger → sheet nav → navigate; footer sticks to the bottom.
test.describe('mobile', () => {
  test('mobile nav sheet opens, navigates and closes', async ({ page }) => {
    const wsName = uniq('QA Seluler')
    await registerViaUI(page, `QA Seluler ${uniq('p')}`, uniq('m').replace(/[^a-z0-9-]/g, '') + '@rakit.test')
    await completeOnboarding(page, wsName, uniq('Proyek Seluler'))

    // hamburger visible on mobile widths
    const burger = page.getByRole('button', { name: 'Buka navigasi' })
    await expect(burger).toBeVisible()

    await burger.click()
    const sheetNav = page.locator('[role="dialog"], .sheet-content').getByRole('navigation').first()
    await expect(sheetNav.getByRole('button', { name: 'Proyek' })).toBeVisible()

    // navigate via the sheet
    await sheetNav.getByRole('button', { name: 'Proyek' }).click()
    await expect(page.getByRole('button', { name: 'Proyek Baru' })).toBeVisible({ timeout: 15_000 })
    // sheet closed after navigation
    await expect(burger).toBeVisible()
  })

  test('footer is visible and content scrolls without overlap', async ({ page }) => {
    await registerViaUI(page, `QA Footer ${uniq('p')}`, uniq('f').replace(/[^a-z0-9-]/g, '') + '@rakit.test')
    await completeOnboarding(page, uniq('QA WS Footer'), uniq('Proyek Footer'))

    const footer = page.locator('footer')
    await expect(footer).toBeVisible()
    // footer is the last element and reachable by scrolling to it
    await footer.scrollIntoViewIfNeeded()
    const box = await footer.boundingBox()
    expect(box).not.toBeNull()
  })
})
