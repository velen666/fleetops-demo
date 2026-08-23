import { expect, test } from '@playwright/test'

const BASE = 'http://localhost:5180'

async function login(page: import('@playwright/test').Page): Promise<void> {
  await page.goto(`${BASE}/login`)
  await page.locator('button', { hasText: 'Администратор' }).first().click()
  await page.waitForURL(`${BASE}/`, { timeout: 10_000 })
}

test('H: saved views — save, apply, remove (localStorage)', async ({ page }) => {
  await login(page)
  await page.goto(`${BASE}/incidents`)
  await page.waitForTimeout(800)

  // применить фильтр объекта
  await page.locator('button[role="combobox"]').first().click()
  await page.getByRole('option', { name: 'РЦ Подольск' }).click()
  await page.waitForTimeout(400)

  // сохранить представление
  await page.locator('button', { hasText: 'Сохранить представление' }).click()
  const dlg = page.locator('[role="dialog"]')
  await dlg.locator('input').fill('Подольск — мой срез')
  await dlg.locator('button', { hasText: 'Сохранить', exact: true }).click()
  await expect(dlg).toBeHidden({ timeout: 5000 })

  // чип появился
  await expect(page.getByText('Подольск — мой срез').first()).toBeVisible()

  // сбросить фильтры (выбрать «Все») и применить чип
  await page.locator('button[role="combobox"]').first().click()
  await page.getByRole('option', { name: 'Все' }).click()
  await page.waitForTimeout(300)
  await page.getByText('Подольск — мой срез').first().click()
  await page.waitForTimeout(400)
  await expect(page).toHaveURL(/site=site-pod/)

  // удалить чип
  await page.locator('button[aria-label="Удалить представление"]').first().click()
  await page.waitForTimeout(300)
  await expect(page.getByText('Подольск — мой срез')).toHaveCount(0)
})

test('H: CSV export downloads a file in all three registries', async ({ page }) => {
  await login(page)

  const downloads: string[] = []
  page.on('download', (d) => downloads.push(d.suggestedFilename()))

  await page.goto(`${BASE}/incidents`)
  await page.waitForTimeout(600)
  await page.locator('button', { hasText: 'Экспорт CSV' }).first().click()

  await page.goto(`${BASE}/downtimes`)
  await page.waitForTimeout(600)
  await page.locator('button', { hasText: 'Экспорт CSV' }).first().click()

  await page.goto(`${BASE}/analytics`)
  await page.waitForTimeout(1000)
  await page.locator('button', { hasText: 'Экспорт CSV' }).first().click()

  await page.waitForTimeout(1000)
  expect(downloads.filter((f) => f.endsWith('.csv')).length).toBeGreaterThanOrEqual(3)
  await page.screenshot({ path: 'e2e-screens/demo-h-exports.png', fullPage: true })
})
