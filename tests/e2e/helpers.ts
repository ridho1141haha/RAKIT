/**
 * Shared helpers for E2E specs: demo login + common selectors.
 */
import { expect, type Page } from '@playwright/test'

export const DEMO = { email: 'demo@rakit.id', password: 'demo123' }

export async function gotoApp(page: Page): Promise<void> {
  await page.goto('/')
  // wait until the JS bundles settle — clicking before hydration would submit
  // the auth form natively (full page reload, fields cleared)
  await page.waitForLoadState('networkidle')
}

/** Fill + submit the login form, retrying if the click beat hydration. */
export async function loginDemo(page: Page): Promise<void> {
  await gotoApp(page)
  // already signed in? (session cookie persisted) → skip the form
  if ((await page.getByLabel('Email').count()) === 0) return

  for (let attempt = 1; attempt <= 3; attempt++) {
    await page.getByLabel('Email').fill(DEMO.email)
    await page.getByLabel('Kata sandi').fill(DEMO.password)
    // the tabs also read "Masuk" — target the form's submit button
    await page.locator('form').getByRole('button', { name: 'Masuk' }).click()
    try {
      // the app shell replaces the auth screen once the session resolves.
      // 90s: the FIRST navigation in a run compiles the whole app bundle on
      // slow machines.
      await expect(page.getByText('Studio Nusantara').first()).toBeVisible({
        timeout: attempt === 1 ? 90_000 : 30_000,
      })
      return
    } catch (e) {
      // hydration race → the form may have been natively reloaded; retry
      if (attempt === 3) throw e
      await gotoApp(page)
      if ((await page.getByLabel('Email').count()) === 0) return // session landed anyway
    }
  }
}

export async function logout(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Menu pengguna' }).click()
  await page.getByRole('menuitem', { name: 'Keluar' }).click()
  await expect(page.getByLabel('Email')).toBeVisible({ timeout: 15_000 })
}
