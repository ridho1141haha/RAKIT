import { test, expect } from '@playwright/test'
import { registerViaUI, completeOnboarding, loginViaUI, logoutViaUI, uniq } from './helpers'

const DEMO_EMAIL = 'demo@rakit.id'

// 1. Registration and login — full journey: register → onboarding → logout →
// login → failed login shows a safe error.
test.describe('auth', () => {
  test('register → onboard → logout → login', async ({ page }) => {
    const name = `QA Pengguna ${uniq('user')}`
    const email = uniq('qa-user').replace(/[^a-z0-9-]/g, '') + '@rakit.test'
    const password = 'rakit-e2e-passw0rd'
    const wsName = uniq('QA Workspace')
    const projName = uniq('QA Proyek Awal')

    await registerViaUI(page, name, email, password)
    await completeOnboarding(page, wsName, projName)

    // workspace switcher shows the new workspace
    await expect(page.getByText(wsName).first()).toBeVisible()

    await logoutViaUI(page)

    // login again with the same credentials
    await loginViaUI(page, email, password)
    await expect(page.locator('nav[aria-label="Navigasi utama"]')).toBeVisible()
    // the previously created workspace is still there (persistence)
    await expect(page.getByText(wsName).first()).toBeVisible()
  })

  test('login with wrong password shows a generic error', async ({ page }) => {
    await page.goto('/')
    await page.getByLabel('Email').fill(DEMO_EMAIL)
    await page.getByLabel('Kata sandi').fill('bukan-password-benar')
    await page.locator('form').getByRole('button', { name: 'Masuk' }).click()
    // generic error, no stack/data leak
    await expect(page.getByText('Email atau kata sandi salah.')).toBeVisible({ timeout: 15_000 })
    // still on the auth screen
    await expect(page.getByLabel('Email')).toBeVisible()
  })
})
