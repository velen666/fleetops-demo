import { expect, test, type Page } from '@playwright/test'

const BASE = 'http://localhost:5180'

async function loginAs(page: Page, role: string, expectedUrl: RegExp): Promise<void> {
  await page.goto(`${BASE}/login`)
  await page.locator('button', { hasText: role }).first().click()
  await page.waitForURL(expectedUrl, { timeout: 10_000 })
}

test('executive homes lead with a traceable decision and confirmed portfolio context', async ({
  page,
}, testInfo) => {
  await loginAs(page, 'Руководитель эксплуатации', /portfolio/)

  const portfolioHero = page.locator('main .page-hero').first()
  await expect(portfolioHero.getByText('Приоритет в очереди')).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('portfolio-hero.png'), fullPage: false })
  await portfolioHero.getByRole('link', { name: /Открыть инцидент/ }).click()
  await page.waitForURL(/\/incidents\//, { timeout: 10_000 })

  await loginAs(page, 'Администратор', /\/$|portfolio/)
  await page.goto(`${BASE}/analytics`)
  await expect(
    page.locator('main .page-hero').getByText(/Портфель: 986[\s\u00a0]667 ₽/),
  ).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('analytics-hero.png'), fullPage: false })

  await loginAs(page, 'Финансовый', /finance/)
  await page.goto(`${BASE}/analytics`)
  await expect(page.getByText('Экономический контур').first()).toBeVisible()

  await loginAs(page, 'Начальник', /my-site/)
  const siteHero = page.locator('main .page-hero').first()
  await expect(siteHero.getByText('Оперативная сводка')).toBeVisible()
  await expect(siteHero.getByText('Подтверждённое влияние')).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('my-site-hero.png'), fullPage: false })
})

test('mobile analytics retains full cause evidence without a compressed chart', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await loginAs(page, 'Администратор', /\/$|portfolio/)
  await page.goto(`${BASE}/analytics?view=site`)

  const causeCard = page.locator('[data-slot="card"]').filter({ hasText: 'Потери по причинам' })
  await expect(causeCard.getByText('На мобильном устройстве используйте список ниже')).toBeVisible()
  await expect(causeCard.locator('canvas')).toBeHidden()
  await expect(causeCard.getByRole('button', { name: /Столкновение/ }).first()).toBeVisible()
  expect(await page.locator('main').evaluate((main) => main.scrollWidth === main.clientWidth)).toBe(
    true,
  )
})

test('desktop keeps management information readable without table overflow', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })

  await loginAs(page, 'Руководитель эксплуатации', /portfolio/)
  const portfolioHero = page.locator('main .page-hero').first()
  await expect(page.getByText(/работ(а требует|ы требуют| требуют) контроля/)).toBeVisible()
  const priorityDescription = portfolioHero.getByText(/Превышение тока и рассинхрон колёс/)
  expect(
    await priorityDescription.evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true)

  await loginAs(page, 'Финансовый', /finance/)
  await expect(page.getByText(/0 ₽ · 1 простой/)).toBeVisible()

  await loginAs(page, 'Администратор', /\/$|portfolio/)
  for (const route of ['/incidents', '/maintenance']) {
    await page.goto(`${BASE}${route}`)
    const table = page.locator('main [data-slot="table-container"]').first()
    expect(await table.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  }

  await loginAs(page, 'Начальник', /my-site/)
  const zoneTable = page.locator('main [data-slot="table-container"]').first()
  expect(await zoneTable.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
    true,
  )
})
