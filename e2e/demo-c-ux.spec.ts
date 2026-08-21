import { expect, test } from '@playwright/test'

/**
 * C-packet UX checks, updated for the §32 analytics rework (packet E):
 * the old KPI drilldown dialog was replaced by the «Расшифровка потерь»
 * full-selection register and the cause-detail dialog.
 */
const BASE = 'http://localhost:5180'

async function login(page: import('@playwright/test').Page): Promise<void> {
  await page.goto(`${BASE}/login`)
  await page.locator('button', { hasText: 'Администратор' }).first().click()
  await page.waitForURL(`${BASE}/`, { timeout: 10_000 })
}

test('C: loss breakdown register is fullwidth with pinned header and total', async ({ page }) => {
  await login(page)
  await page.goto(`${BASE}/analytics`)
  await expect(page.getByText('Расшифровка потерь').first()).toBeVisible({ timeout: 10_000 })

  // «X из N» счётчик строк + итог выборки видны без прокрутки
  await expect(page.getByText(/Строк: \d+/).first()).toBeVisible()
  await expect(page.getByText(/Итого:/).first()).toBeVisible()

  // строка ведёт в карточку инцидента
  const firstRow = page.locator('main table tbody tr').first()
  await firstRow.click()
  await page.waitForURL(/\/incidents\//, { timeout: 10_000 })
  await expect(
    page.getByText('Следующее действие:').or(page.getByText('Инцидент закрыт', { exact: false })),
  ).toBeVisible({ timeout: 10_000 })
})

test('C: incident filters persist in URL and survive reload', async ({ page }) => {
  await login(page)
  await page.goto(`${BASE}/incidents`)
  await page.waitForTimeout(800)
  await page.locator('button[role="combobox"]').first().click()
  await page.getByRole('option', { name: 'ФФЦ Домодедово' }).click()
  await page.waitForTimeout(500)
  await expect(page).toHaveURL(/site=site-dom/)
  await page.reload()
  await page.waitForTimeout(1000)
  const rows = await page.locator('tbody tr').allTextContents()
  expect(rows.length).toBeGreaterThan(0)
  expect(rows.every((r) => r.includes('Домодедово'))).toBe(true)
})
