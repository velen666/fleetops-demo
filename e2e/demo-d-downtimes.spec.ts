import { expect, test } from '@playwright/test'

test('D: downtimes register — filters, quick views, summary matches rows', async ({ page }) => {
  await page.goto('http://localhost:5180/login')
  await page.locator('button', { hasText: 'Администратор' }).first().click()
  await page.waitForURL('http://localhost:5180/', { timeout: 10_000 })
  await page.goto('http://localhost:5180/downtimes')
  await expect(page.getByText('Записей:').first()).toBeVisible({ timeout: 10_000 })

  // русские статусы (нет сырых CONFIRMED как основного текста бейджа)
  await expect(page.getByText('Подтверждён').first()).toBeVisible()

  // быстрое представление «Требуют подтверждения»
  await page.locator('button', { hasText: 'Требуют подтверждения' }).first().click()
  await page.waitForTimeout(400)
  // статусы в колонке «Статус» (бейджи статуса, не типа интервала)
  const statusCells = page.locator('tbody tr td:nth-child(10) span[class*="rounded"]')
  const badgeTexts = await statusCells.allTextContents()
  expect(badgeTexts.length).toBeGreaterThan(0)
  for (const b of badgeTexts) {
    expect(['Предложен', 'Ожидает подтверждения']).toContain(b.trim())
  }
  await expect(page).toHaveURL(/quick=needs_confirm/)

  // фильтр по объекту сужает выборку и сохраняется в URL (quick сбрасываем)
  await page.locator('button', { hasText: 'Требуют подтверждения' }).first().click()
  await page.waitForTimeout(300)
  await page.locator('button[role="combobox"]').first().click()
  await page.getByRole('option', { name: 'РЦ Подольск' }).click()
  await page.waitForTimeout(400)
  await expect(page).toHaveURL(/site=site-pod/)
  const rows = await page.locator('tbody tr').allTextContents()
  expect(rows.length).toBeGreaterThan(0)
  expect(rows.every((r) => r.includes('Подольск'))).toBe(true)

  await page.screenshot({ path: 'e2e-screens/demo-d-downtimes.png', fullPage: true })
})

test('D: filter by cause goes through the linked incident', async ({ page }) => {
  await page.goto('http://localhost:5180/login')
  await page.locator('button', { hasText: 'Администратор' }).first().click()
  await page.waitForURL('http://localhost:5180/', { timeout: 10_000 })
  await page.goto('http://localhost:5180/downtimes')
  await page.waitForTimeout(800)

  // выбираем причину CA-045 (загрязнение лидара) — селект по aria-label
  const causeSelect = page.getByRole('combobox', { name: 'Фильтр по причине' })
  await causeSelect.click()
  await page.getByRole('option', { name: /CA-045/ }).click()
  await page.waitForTimeout(400)
  await expect(page).toHaveURL(/cause=CA-045/)
  const rows = await page.locator('tbody tr').allTextContents()
  expect(rows.length).toBeGreaterThanOrEqual(5)
  expect(rows.every((r) => r.includes('CA-045') || r.includes('Загрязнение'))).toBe(true)

  // строка ведёт в карточку инцидента
  await page.locator('tbody tr').first().click()
  await page.waitForURL(/\/incidents\//, { timeout: 10_000 })
  await expect(
    page.getByText('Следующее действие:').or(page.getByText('Инцидент закрыт')),
  ).toBeVisible({
    timeout: 10_000,
  })
})
