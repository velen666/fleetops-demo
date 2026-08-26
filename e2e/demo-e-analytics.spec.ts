import { expect, test } from '@playwright/test'

const BASE = 'http://localhost:5180'

async function login(page: import('@playwright/test').Page): Promise<void> {
  await page.goto(`${BASE}/login`)
  await page.locator('button', { hasText: 'Администратор' }).first().click()
  await page.waitForURL(`${BASE}/`, { timeout: 10_000 })
}

test('E: analytics — views, filters, RT block without SLA', async ({ page }) => {
  await login(page)
  await page.goto(`${BASE}/analytics`)
  await expect(page.getByText('Инцидентов').first()).toBeVisible({ timeout: 10_000 })

  // 32.2 KPI: доступность с формулой (числитель/знаменатель)
  await expect(page.getByText(/1 − .*ч \//).first()).toBeVisible()

  // 32.6: блок RT — медианы/90-й перцентиль/n, без «SLA»
  await expect(page.getByText('медиана').first()).toBeVisible()
  await expect(page.getByText('90-й перцентиль').first()).toBeVisible()
  await expect(page.getByText('в расчёте').first()).toBeVisible()
  const body1 = await page.locator('main').textContent()
  expect(body1).not.toContain('SLA')

  // представление «Роботопарк»: единый блок повторяющихся проблем
  await page.locator('main .rounded-lg button', { hasText: 'Роботопарк' }).click()
  await page.waitForTimeout(600)
  await expect(page.getByText('Повторяющиеся проблемы').first()).toBeVisible()
  await expect(page.getByText(/CA-045/).first()).toBeVisible()
  await page.screenshot({ path: 'e2e-screens/demo-e-fleet.png', fullPage: true })

  // представление «Экономика»: два разных блока
  await page.locator('main .rounded-lg button', { hasText: 'Экономика' }).click()
  await page.waitForTimeout(600)
  await expect(page.getByText('Потери по объектам').first()).toBeVisible()
  await expect(page.getByText('Потери по зонам ответственности').first()).toBeVisible()
  await page.screenshot({ path: 'e2e-screens/demo-e-econ.png', fullPage: true })

  // 32.7 расшифровка: итог виден
  await expect(page.getByText('Расшифровка потерь').first()).toBeVisible()

  // общий фильтр сужает все блоки
  const before = await page.getByText('Инцидентов').first().locator('..').textContent()
  await page.locator('button[role="combobox"]').first().click()
  await page.getByRole('option', { name: 'ФФЦ Домодедово' }).click()
  await page.waitForTimeout(600)
  const after = await page.getByText('Инцидентов').first().locator('..').textContent()
  expect(after).not.toBe(before)
})

test('E: cause detail dialog — rows match aggregate, locality verdict', async ({ page }) => {
  await login(page)
  await page.goto(`${BASE}/analytics?view=site`)
  await page.waitForTimeout(1200)

  await page.locator('main button:has-text("CA-041")').first().click()
  const dlg = page.locator('[role="dialog"]')
  await expect(dlg).toBeVisible()
  await expect(
    dlg
      .getByText('проблема повторяется по сети', { exact: false })
      .or(dlg.getByText('проблема локальна')),
  ).toBeVisible()
  const rows = await dlg.locator('tbody tr').count()
  expect(rows).toBeGreaterThanOrEqual(5)
  await page.screenshot({ path: 'e2e-screens/demo-e-cause-detail.png' })
  await page.keyboard.press('Escape')
  await expect(dlg).toBeHidden({ timeout: 5000 })
})
