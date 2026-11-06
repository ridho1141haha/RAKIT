import { expect, type Page } from '@playwright/test'

/** Unique suffix so parallel runs / repeated runs never collide in the shared dev DB. */
export function uniq(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`
}

export const DEMO = { email: 'demo@rakit.id', password: 'demo123' }

/** Register through the UI. Returns the credentials used. */
export async function registerViaUI(
  page: Page,
  name: string,
  email: string,
  password = 'rakit-e2e-passw0rd',
): Promise<void> {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Daftar' })).toBeVisible()
  await page.getByRole('button', { name: 'Daftar' }).click()
  await page.getByLabel('Nama lengkap').fill(name)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Kata sandi').fill(password)
  await page.getByRole('button', { name: 'Buat Akun' }).click()
  // successful registration lands on onboarding (new user, no workspaces)
  await expect(page.getByText('Buat workspace pertamamu')).toBeVisible({ timeout: 15_000 })
}

/** Complete the 3-step onboarding (workspace → project). */
export async function completeOnboarding(
  page: Page,
  wsName: string,
  projName: string,
): Promise<void> {
  await page.getByLabel('Nama workspace').fill(wsName)
  await page.getByRole('button', { name: 'Lanjut buat proyek' }).click()
  await page.getByLabel('Nama proyek').fill(projName)
  await page.getByRole('button', { name: 'Buat proyek' }).click()
  // after the project is created, refreshMe() drops the user straight into the
  // shell (the 3rd onboarding card is skipped in the current flow). Wait on the
  // topbar search trigger — visible on BOTH desktop and mobile widths (the
  // desktop sidebar nav is display:none on mobile).
  await expect(page.getByRole('button', { name: 'Cari apa saja…' })).toBeVisible({ timeout: 20_000 })
}

/** API login with rate-limit (429) retry. Returns the raw context for further calls. */
export async function loginApi(
  context: { post: (url: string, opts?: unknown) => Promise<{ ok: () => boolean; status: () => number; json: () => Promise<unknown> }> },
  email: string,
  password: string,
): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await context.post('http://localhost:3000/api/auth/login', {
      data: { email, password },
    })
    if (res.ok()) return
    if (res.status() === 429) {
      await new Promise((r) => setTimeout(r, 6000))
      continue
    }
    throw new Error(`API login failed (${res.status()}): ${JSON.stringify(await res.json())}`)
  }
  throw new Error('API login rate-limited after retries')
}

/** Log in through the UI. */
export async function loginViaUI(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Kata sandi').fill(password)
  // the auth screen has a "Masuk" tab AND a "Masuk" submit button — target the form's
  await page.locator('form').getByRole('button', { name: 'Masuk' }).click()
  await expect(page.locator('nav[aria-label="Navigasi utama"]')).toBeVisible({ timeout: 20_000 })
}

/** Log out through the user menu (desktop shell). */
export async function logoutViaUI(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Menu pengguna' }).click()
  await page.getByRole('menuitem', { name: 'Keluar' }).click()
  await expect(page.getByLabel('Email')).toBeVisible({ timeout: 20_000 })
}

export function sidebar(page: Page) {
  return page.locator('nav[aria-label="Navigasi utama"]')
}

export function navButton(page: Page, label: string) {
  return sidebar(page).getByRole('button', { name: label })
}

/**
 * Simulate an HTML5 drag & drop of a board card onto a target column.
 * Two phases with a yield between them because React commits the `drop`
 * indicator state asynchronously — dispatching dragstart/dragover/drop in one
 * synchronous tick would leave the drop handler reading stale state.
 * NOTE: after dragstart the Board removes the dragged card from the DOM
 * (it renders as a ghost), so the drop phase must not look the card up again.
 */
export async function dragCardToColumn(
  page: Page,
  cardTitle: string,
  columnLabel: string,
  position: 'top' | 'bottom' = 'bottom',
): Promise<void> {
  const phase1 = `
    (() => {
      const card = [...document.querySelectorAll('[data-task-id]')]
        .find((el) => el.textContent && el.textContent.includes(${JSON.stringify(cardTitle)}))
      if (!card) throw new Error('card not found: ${cardTitle}')
      const section = [...document.querySelectorAll('section[aria-label^="Kolom "]')]
        .find((el) => el.getAttribute('aria-label') === 'Kolom ${columnLabel}')
      if (!section) throw new Error('column not found: ${columnLabel}')
      const body = section.querySelector('.min-h-24')
      if (!body) throw new Error('column body not found')
      const dt = new DataTransfer()
      card.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }))
      const rect = body.getBoundingClientRect()
      const clientY = ${position === 'top' ? 'rect.top + 2' : 'rect.bottom - 2'}
      body.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, clientY }))
      return true
    })()
  `
  const phase2 = `
    (() => {
      const section = [...document.querySelectorAll('section[aria-label^="Kolom "]')]
        .find((el) => el.getAttribute('aria-label') === 'Kolom ${columnLabel}')
      if (!section) throw new Error('column not found in drop phase: ${columnLabel}')
      const body = section.querySelector('.min-h-24')
      if (!body) throw new Error('column body not found in drop phase')
      const dt = new DataTransfer()
      const rect = body.getBoundingClientRect()
      const clientY = ${position === 'top' ? 'rect.top + 2' : 'rect.bottom - 2'}
      body.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientY }))
      return true
    })()
  `
  await page.evaluate(phase1)
  await page.waitForTimeout(150)
  await page.evaluate(phase2)
  await page.waitForTimeout(150)
}

/** Read the ordered card titles of one board column. */
export async function columnTitles(page: Page, columnLabel: string): Promise<string[]> {
  return page.evaluate((label) => {
    const section = [...document.querySelectorAll('section[aria-label^="Kolom "]')].find(
      (el) => el.getAttribute('aria-label') === `Kolom ${label}`,
    )
    if (!section) throw new Error(`column not found: ${label}`)
    return [...section.querySelectorAll('[data-task-id]')].map(
      (el) => (el.querySelector('button')?.textContent ?? '').trim(),
    )
  }, columnLabel)
}
