/**
 * E2E — authentication flows through the real UI.
 */
import { test, expect } from '@playwright/test'
import { DEMO, gotoApp, loginDemo, logout } from '../helpers'

test.describe('auth', () => {
  test('register → lands in onboarding; session survives reload', async ({ page }) => {
    await gotoApp(page)
    await page.getByRole('button', { name: 'Daftar' }).click()
    const email = `e2e-${Date.now()}@test.local`
    await page.getByLabel('Nama lengkap').fill('E2E Pendaftar')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Kata sandi').fill('sandi-aman-123')
    await page.locator('form').getByRole('button', { name: 'Buat Akun' }).click()
    // onboarding wizard appears for a brand-new account (90s — first app-bundle
    // compile in a cold run can be slow on constrained machines)
    await expect(page.getByText('Buat workspace pertamamu')).toBeVisible({ timeout: 90_000 })
    // session persists across reload — the SPA boots back into the app
    // (onboarding, because onboardedAt is still null), NOT the auth screen
    await page.reload()
    await expect(page.getByLabel('Email')).toHaveCount(0, { timeout: 90_000 })
    await expect(page.getByText('Buat workspace pertamamu')).toBeVisible({ timeout: 90_000 })
  })

  test('demo login works and logout returns to the auth screen', async ({ page }) => {
    await loginDemo(page)
    await logout(page)
    await expect(page.locator('form').getByRole('button', { name: 'Masuk' })).toBeVisible()
  })

  test('wrong password shows the generic error (no enumeration)', async ({ page }) => {
    await gotoApp(page)
    await page.getByLabel('Email').fill(DEMO.email)
    await page.getByLabel('Kata sandi').fill('salah-total-999')
    await page.locator('form').getByRole('button', { name: 'Masuk' }).click()
    await expect(page.getByText('Email atau kata sandi salah.')).toBeVisible({ timeout: 15_000 })
  })

  test('demo login button is visible when NEXT_PUBLIC_DEMO_MODE=true', async ({ page }) => {
    await gotoApp(page)
    await expect(page.getByRole('button', { name: 'Masuk sebagai Demo' })).toBeVisible()
  })
})
