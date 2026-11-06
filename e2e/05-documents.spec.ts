import { test, expect, type Page } from '@playwright/test'
import { loginViaUI, navButton, uniq, DEMO } from './helpers'

// 7. Document autosave + 8. Failed save & retry.
// Per-document save queues: content of doc A can never land in doc B, failures
// keep the text in the editor, retry reuses the exact same payload.
// NOTE: after page.reload() the SPA lands on the dashboard — re-navigate.
test.describe('documents', () => {
  async function openDocuments(page: Page) {
    await loginViaUI(page, DEMO.email, DEMO.password)
    await navButton(page, 'Dokumen').click()
    await expect(page.getByRole('button', { name: 'Dokumen Baru' })).toBeVisible()
  }

  async function reopenDocuments(page: Page, docTitle?: string) {
    await expect(page.locator('nav[aria-label="Navigasi utama"]')).toBeVisible({ timeout: 15_000 })
    await navButton(page, 'Dokumen').click()
    await expect(page.getByRole('button', { name: 'Dokumen Baru' })).toBeVisible({ timeout: 15_000 })
    if (docTitle) {
      await page.locator('aside').getByText(docTitle).click()
      await expect(page.getByLabel('Judul dokumen')).toBeVisible({ timeout: 15_000 })
    }
  }

  const docOptions = (page: Page) => page.locator('[aria-label="Daftar dokumen"] [role="option"]')

  /** Click "Dokumen Baru" and wait until the NEW document is actually selected. */
  async function clickNewDoc(page: Page): Promise<void> {
    const before = await docOptions(page).count()
    await page.getByRole('button', { name: 'Dokumen Baru' }).click()
    // the list gains an item and selection switches in the same commit —
    // waiting on the count removes the async create race
    await expect(docOptions(page)).toHaveCount(before + 1, { timeout: 15_000 })
    await expect(page.getByLabel('Judul dokumen')).toBeVisible()
  }

  async function createDoc(page: Page, title: string): Promise<void> {
    await clickNewDoc(page)
    await page.getByLabel('Judul dokumen').fill(title)
    await expect(page.getByLabel('Judul dokumen')).toHaveValue(title)
    // wait until the title save landed so the list item shows the new name
    // (anchored regex — the idle-state text "Perubahan tersimpan otomatis"
    // would otherwise match a plain getByText('Tersimpan'))
    await expect(page.getByText(/^Tersimpan \d{2}[.:]\d{2}/).first()).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('aside').getByText(title)).toBeVisible({ timeout: 15_000 })
  }

  async function savedIndicator(page: Page) {
    await expect(page.getByText(/^Tersimpan \d{2}[.:]\d{2}/).first()).toBeVisible({ timeout: 15_000 })
  }

  test('autosave persists content after reload', async ({ page }) => {
    await openDocuments(page)
    const title = uniq('Brief QA')
    const body = `## Latar belakang\nKonten unik ${uniq('isi')} untuk pengujian autosave.`
    await createDoc(page, title)
    await page.getByLabel('Isi dokumen').fill(body)
    await savedIndicator(page)

    await page.reload()
    await reopenDocuments(page)
    await expect(page.getByLabel('Isi dokumen')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByLabel('Judul dokumen')).toHaveValue(title)
    await expect(page.getByLabel('Isi dokumen')).toHaveValue(body)
  })

  test('switching documents during pending saves never bleeds content', async ({ page }) => {
    await openDocuments(page)
    const titleA = uniq('Dok A')
    const titleB = uniq('Dok B')
    const bodyA = `Konten khusus dokumen A: ${uniq('a')}`
    const bodyB = `Konten khusus dokumen B: ${uniq('b')}`

    await createDoc(page, titleA)
    // type A content, then IMMEDIATELY switch to B (before the 900ms debounce fires)
    await page.getByLabel('Isi dokumen').fill(bodyA)
    await clickNewDoc(page)
    await page.getByLabel('Judul dokumen').fill(titleB)
    await page.getByLabel('Isi dokumen').fill(bodyB)
    await savedIndicator(page)

    // both docs keep their OWN content after reload — no A→B bleed
    await page.reload()
    await reopenDocuments(page, titleB)
    await expect(page.getByLabel('Isi dokumen')).toHaveValue(bodyB)
    await expect(page.getByLabel('Judul dokumen')).toHaveValue(titleB)

    await page.locator('aside').getByText(titleA).click()
    await expect(page.getByLabel('Isi dokumen')).toHaveValue(bodyA)
    await expect(page.getByLabel('Judul dokumen')).toHaveValue(titleA)
  })

  test('failed save keeps text and retries successfully', async ({ page }) => {
    await openDocuments(page)
    const title = uniq('Dok Gagal')
    const body = `Isi yang tidak boleh hilang ${uniq('g')}`

    // block document PATCHes → autosave fails
    await page.route('**/api/documents/*', (route) => route.abort())
    await page.waitForTimeout(300) // let the interception register
    await clickNewDoc(page)
    await page.getByLabel('Judul dokumen').fill(title)
    await page.getByLabel('Isi dokumen').fill(body)

    // error state appears, text stays in the editor
    await expect(page.getByText('Gagal menyimpan')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByLabel('Isi dokumen')).toHaveValue(body)
    await expect(page.getByLabel('Judul dokumen')).toHaveValue(title)

    // unblock and retry with the same payload
    await page.unroute('**/api/documents/*')
    await page.getByRole('button', { name: 'Ulangi' }).click()
    await savedIndicator(page)
    await page.reload()
    await reopenDocuments(page, title)
    await expect(page.getByLabel('Isi dokumen')).toHaveValue(body)
    await expect(page.getByLabel('Judul dokumen')).toHaveValue(title)
  })

  test('refreshing immediately after editing does not lose content', async ({ page }) => {
    await openDocuments(page)
    const title = uniq('Dok Kilat')
    const body = `Disimpan lewat keepalive saat unload ${uniq('k')}`
    await createDoc(page, title)
    await page.getByLabel('Isi dokumen').fill(body)
    // reload right away — the pagehide/keepalive flush must win the race
    await page.reload()
    await reopenDocuments(page, title)
    await expect(page.getByLabel('Isi dokumen')).toHaveValue(body)
    await expect(page.getByLabel('Judul dokumen')).toHaveValue(title)

    // second reload to confirm the value was really persisted server-side
    await page.reload()
    await reopenDocuments(page, title)
    await expect(page.getByLabel('Isi dokumen')).toHaveValue(body)
  })

  test('rapid edits across three documents all land correctly', async ({ page }) => {
    await openDocuments(page)
    const docs = [uniq('Dok 1'), uniq('Dok 2'), uniq('Dok 3')]
    const bodies = docs.map((d) => `Isi milik ${d}: ${uniq('x')}`)

    for (let i = 0; i < docs.length; i++) {
      await clickNewDoc(page)
      await page.getByLabel('Judul dokumen').fill(docs[i])
      await page.getByLabel('Isi dokumen').fill(bodies[i])
      // small wait so the three save queues genuinely overlap in flight
      await page.waitForTimeout(200)
    }
    // wait for the last save
    await savedIndicator(page)

    await page.reload()
    await reopenDocuments(page)
    for (let i = 0; i < docs.length; i++) {
      await page.locator('aside').getByText(docs[i]).click()
      await expect(page.getByLabel('Isi dokumen')).toHaveValue(bodies[i])
      await expect(page.getByLabel('Judul dokumen')).toHaveValue(docs[i])
    }
  })
})
