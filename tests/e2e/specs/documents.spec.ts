/**
 * E2E — P1.3 regression: switching documents while a save is pending must
 * never submit one document's content under another document's ID, and every
 * document's edits must persist independently.
 */
import { test, expect } from '@playwright/test'
import { loginDemo } from '../helpers'

test.describe('document autosave (P1.3)', () => {
  test('edits persist per document across a quick document switch + reload', async ({ page }) => {
    await loginDemo(page)

    await page.getByRole('button', { name: 'Dokumen', exact: true }).first().click()
    const listbox = page.getByRole('listbox', { name: 'Daftar dokumen' })
    await listbox.waitFor({ timeout: 30_000 })

    const options = listbox.getByRole('option')
    await options.first().waitFor({ timeout: 30_000 })
    const optionCount = await options.count()
    test.skip(optionCount < 2, 'seed provides at least two documents')

    const titleA = (await options.nth(0).locator('span').first().textContent())!.trim()
    const titleB = (await options.nth(1).locator('span').first().textContent())!.trim()

    // ── document A: type a unique marker, then IMMEDIATELY switch to B ──
    await options.nth(0).click()
    const editor = page.getByLabel('Isi dokumen')
    await editor.waitFor({ timeout: 30_000 })
    await editor.click()
    await editor.press('ControlOrMeta+a')
    const markerA = `MARKER-A-${Date.now()} — konten dokumen A.`
    await editor.pressSequentially(markerA, { delay: 8 })

    // switch while the 900 ms autosave debounce is still pending
    await options.nth(1).click()
    const editorB = page.getByLabel('Isi dokumen')
    await editorB.waitFor({ timeout: 30_000 })

    // the editor must now show document B's content — never A's marker
    const bValue = await editorB.inputValue()
    expect(bValue).not.toContain('MARKER-A')

    // give B a separate unique marker too, then wait for BOTH saves to land
    await editorB.click()
    await editorB.press('ControlOrMeta+a')
    const markerB = `MARKER-B-${Date.now()} — konten dokumen B.`
    await editorB.pressSequentially(markerB, { delay: 8 })
    await expect(page.getByText(/Tersimpan \d{2}\.\d{2}|Perubahan belum tersimpan/).first()).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText(/Tersimpan \d{2}\.\d{2}/).first()).toBeVisible({ timeout: 30_000 })

    // ── reload: both documents must show their OWN content ──
    await page.reload()
    await page.getByRole('button', { name: 'Dokumen', exact: true }).first().click()
    const listboxAfter = page.getByRole('listbox', { name: 'Daftar dokumen' })
    await listboxAfter.waitFor({ timeout: 30_000 })

    const openDoc = async (title: string) => {
      await listboxAfter.getByRole('option').filter({ hasText: title }).first().click()
      await page.getByLabel('Isi dokumen').waitFor({ timeout: 30_000 })
      return page.getByLabel('Isi dokumen').inputValue()
    }

    const contentA = await openDoc(titleA)
    expect(contentA).toContain('MARKER-A-')
    const contentB = await openDoc(titleB)
    expect(contentB).toContain('MARKER-B-')
    // cross-contamination check: A must NOT contain B's marker and vice versa
    expect(contentA).not.toContain('MARKER-B-')
    expect(contentB).not.toContain('MARKER-A-')
  })

  test('save failure keeps the content and offers retry (never silently clears)', async ({ page }) => {
    await loginDemo(page)
    await page.getByRole('button', { name: 'Dokumen', exact: true }).first().click()
    const listbox = page.getByRole('listbox', { name: 'Daftar dokumen' })
    await listbox.waitFor({ timeout: 30_000 })
    await listbox.getByRole('option').first().click()

    const editor = page.getByLabel('Isi dokumen')
    await editor.waitFor({ timeout: 30_000 })
    await editor.click()
    await editor.press('ControlOrMeta+a')
    const marker = `OFFLINE-${Date.now()} — teks tidak boleh hilang.`
    await editor.pressSequentially(marker, { delay: 8 })

    // cut the network, then blur to force a save attempt
    await page.context().setOffline(true)
    await editor.blur()
    await expect(page.getByText('Gagal menyimpan — coba lagi')).toBeVisible({ timeout: 30_000 })
    // content is still in the editor
    expect(await editor.inputValue()).toContain('OFFLINE-')

    // restore the network and retry
    await page.context().setOffline(false)
    await page.getByRole('button', { name: 'Ulangi' }).click()
    await expect(page.getByText(/Tersimpan \d{2}\.\d{2}/).first()).toBeVisible({ timeout: 30_000 })

    // persisted on the server (reload resets the SPA to the dashboard —
    // navigate back into Documents)
    await page.reload()
    await page.getByRole('button', { name: 'Dokumen', exact: true }).first().click()
    const listboxAfter = page.getByRole('listbox', { name: 'Daftar dokumen' })
    await listboxAfter.waitFor({ timeout: 30_000 })
    await listboxAfter.getByRole('option').first().click()
    await expect(page.getByLabel('Isi dokumen')).toContainText('OFFLINE-', { timeout: 30_000 })
  })
})
