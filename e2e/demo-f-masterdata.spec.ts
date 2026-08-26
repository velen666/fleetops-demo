import { expect, test } from '@playwright/test'

const BASE = 'http://localhost:5180'

async function login(page: import('@playwright/test').Page): Promise<void> {
  await page.goto(`${BASE}/login`)
  await page.locator('button', { hasText: 'Администратор' }).first().click()
  await page.waitForURL(`${BASE}/`, { timeout: 10_000 })
}

test('F: robot page — tabs, metrics, incidents drill-down', async ({ page }) => {
  await login(page)
  await page.goto(`${BASE}/robots`)
  await page.waitForTimeout(800)

  // строка робота → отдельный адрес
  await page.locator('tbody tr').first().click()
  await page.waitForURL(/\/robots\//, { timeout: 10_000 })
  await expect(page.getByText('Доступность (30 дней)').first()).toBeVisible({ timeout: 10_000 })

  // вкладки
  for (const tab of ['Простои', 'Сервисные работы', 'События', 'История']) {
    await page.locator('[role="tab"]', { hasText: tab }).first().click()
    await page.waitForTimeout(200)
  }

  // инциденты: переход в карточку
  await page.locator('[role="tab"]', { hasText: 'Инциденты' }).first().click()
  const incRow = page.locator('main table tbody tr').first()
  const hasIncidents = (await incRow.count()) > 0
  if (hasIncidents) {
    await incRow.click()
    await page.waitForURL(/\/incidents\//, { timeout: 10_000 })
  }
  await page.screenshot({ path: 'e2e-screens/demo-f-robot.png', fullPage: true })
})

test('F: site page — zones table, park tab, filtered jumps', async ({ page }) => {
  await login(page)
  await page.goto(`${BASE}/sites`)
  await page.waitForTimeout(1000)

  await page.locator('tbody tr').first().click()
  await page.waitForURL(/\/sites\//, { timeout: 15_000 })
  await expect(page.getByText('Зоны объекта').first()).toBeVisible({ timeout: 10_000 })

  // зоны: клик → страница зоны (v2: мощность, роботы, инциденты зоны)
  const zoneRow = page.locator('main table tbody tr').first()
  if ((await zoneRow.count()) > 0) {
    await zoneRow.click()
    await page.waitForURL(/\/zones\//, { timeout: 15_000 })
    await expect(page.getByText('Мощность зоны').first()).toBeVisible({ timeout: 10_000 })
  }

  // назад на объект: кнопки отфильтрованных переходов
  await page.goBack()
  await page.waitForTimeout(1000)
  const robotsBtn = page.locator('button', { hasText: 'Показать роботов' })
  await expect(robotsBtn).toBeVisible({ timeout: 10_000 })
  await robotsBtn.click()
  await page.waitForURL(/\/robots/, { timeout: 15_000 })
  await expect(page).toHaveURL(/site=/)
  await page.screenshot({ path: 'e2e-screens/demo-f-site.png', fullPage: true })
})
