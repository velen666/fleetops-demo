import { expect, test } from '@playwright/test'

const BASE = 'http://localhost:5180'

async function login(page: import('@playwright/test').Page): Promise<void> {
  await page.goto(`${BASE}/login`)
  await page.locator('button', { hasText: 'Администратор' }).first().click()
  await page.waitForURL(`${BASE}/`, { timeout: 10_000 })
}

test('reports breakdown dialog — scrollable fullwidth table with pinned header', async ({
  page,
}) => {
  await login(page)
  await page.goto(`${BASE}/reports`)
  await expect(page.getByText('Управленческий отчёт').first()).toBeVisible({ timeout: 10_000 })

  // клик по KPI-блоку открывает диалог
  await page.locator('[class*="card-interactive"], .kpi-clickable').first().click()
  const dlg = page.locator('[role="dialog"]')
  await expect(dlg).toBeVisible()

  // полноширинная таблица со sticky-заголовком и счётчиком строк
  const box = await dlg.boundingBox()
  expect(box?.width ?? 0).toBeGreaterThan(800)
  await expect(dlg.getByText(/Строк: \d+/)).toBeVisible()
  await expect(dlg.locator('thead.sticky').first()).toBeVisible()

  // строка ведёт в карточку
  const row = dlg.locator('tbody tr').first()
  if ((await row.count()) > 0) {
    await row.click()
    await page.waitForURL(/\/incidents\//, { timeout: 10_000 })
  }
  await page.screenshot({ path: 'e2e-screens/demo-fix-reports-table.png', fullPage: true })
})

test('cause dialog — counter hint, empty evidence placeholder, enabled submit at 20 chars', async ({
  page,
}) => {
  await login(page)
  await page.goto(`${BASE}/incidents`)
  await page.locator('tbody tr').first().click()
  await page.waitForURL(/\/incidents\//, { timeout: 10_000 })

  await page.getByRole('button', { name: 'Дополнительные действия' }).click()
  await page.locator('button', { hasText: 'Предварительная причина' }).click()
  const dlg = page.locator('[role="dialog"]')
  await expect(dlg).toBeVisible()

  // подсказка про минимум символов видна
  await expect(dlg.getByText(/минимум 20 символов/).first()).toBeVisible()

  // доказательства НЕ предзаполнены (placeholder)
  const evidence = dlg.locator('#cause-evidence')
  await expect(evidence).toHaveValue('')

  // кнопка задизейблена при коротком комментарии, включается на 20+
  await dlg.locator('button[role="combobox"]').first().click()
  await page.getByRole('option', { name: /CA-045/ }).click()
  const submit = dlg.getByRole('button', { name: 'Записать' })
  await expect(submit).toBeDisabled()
  await dlg.locator('#cause-comment').fill('Коротко')
  await expect(submit).toBeDisabled()
  await dlg.locator('#cause-comment').fill('На оптическом окне лидара слой пыли, качество снижено')
  await expect(submit).toBeEnabled()
  await page.screenshot({ path: 'e2e-screens/demo-fix-cause-dialog.png' })
})

test('action dialog — due date via calendar popover + time input', async ({ page }) => {
  await login(page)
  await page.goto(`${BASE}/incidents`)
  await page.locator('tbody tr').first().click()
  await page.waitForURL(/\/incidents\//, { timeout: 10_000 })

  await page.getByRole('button', { name: 'Дополнительные действия' }).click()
  await page.locator('button', { hasText: 'Создать действие' }).click()
  const dlg = page.locator('[role="dialog"]')
  await expect(dlg).toBeVisible()

  // поле срока — кнопка календаря, не datetime-local
  const dueBtn = dlg.locator('button[aria-label="Срок выполнения"]')
  await expect(dueBtn).toBeVisible()
  await dueBtn.click()
  await expect(page.locator('table button').first()).toBeVisible({ timeout: 5000 })
  // выбор дня закрывает поповер и заполняет поле
  await page.locator('table button', { hasText: /^18$/ }).first().click()
  await expect(page.locator('table').first()).toBeHidden({ timeout: 5000 })
  await expect(dueBtn).toContainText(/18\.\d{2}\.\d{4}/)
  await page.screenshot({ path: 'e2e-screens/demo-fix-calendar.png' })
})
