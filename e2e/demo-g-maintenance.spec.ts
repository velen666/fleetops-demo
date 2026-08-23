import { expect, test } from '@playwright/test'

const BASE = 'http://localhost:5180'

async function login(page: import('@playwright/test').Page): Promise<void> {
  await page.goto(`${BASE}/login`)
  await page.locator('button', { hasText: 'Администратор' }).first().click()
  await page.waitForURL(`${BASE}/`, { timeout: 10_000 })
}

test('G: maintenance register — quick views, filters, incident link', async ({ page }) => {
  await login(page)
  await page.goto(`${BASE}/maintenance`)
  await expect(page.getByText('Всего работ').first()).toBeVisible({ timeout: 10_000 })

  // RU-статусы
  await expect(
    page.getByText('Выполнено').or(page.getByText('Результат подтверждён')).first(),
  ).toBeVisible()

  // быстрые представления: связанные с инцидентами
  await page.locator('button', { hasText: 'Связанные с инцидентами' }).first().click()
  await page.waitForTimeout(400)
  const incLinks = await page.locator('tbody button.text-primary').count()
  expect(incLinks).toBeGreaterThan(0)

  // просроченные видны в сводке (метрика есть)
  await expect(
    page.getByText('Просрочено').or(page.getByText('Просроченные')).first(),
  ).toBeVisible()

  // фильтр по объекту (combobox порядок: тип=0, объект=1, исполнитель=2, статус=3)
  await page.locator('button[role="combobox"]').nth(1).click()
  await page.getByRole('option', { name: 'РЦ Подольск' }).click()
  await page.waitForTimeout(400)
  const rows = await page.locator('tbody tr').allTextContents()
  if (rows.length > 0) expect(rows.every((r) => r.includes('Подольск'))).toBe(true)

  // переход из строки в карточку работы (диалог) и из неё в инцидент
  await page.locator('tbody tr').first().click()
  const dlg = page.locator('[role="dialog"]')
  await expect(dlg).toBeVisible({ timeout: 5000 })
  await page.screenshot({ path: 'e2e-screens/demo-g-maintenance.png' })
  const incBtn = dlg.locator('button:has-text("INC-"), a:has-text("INC-")').first()
  if (await incBtn.isVisible().catch(() => false)) {
    await incBtn.click()
    await page.waitForURL(/\/incidents\//, { timeout: 10_000 })
  }
})
