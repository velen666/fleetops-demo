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
  await expect(portfolioHero.getByText('Следующее операционное действие')).toBeVisible()
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

test('management homes separate the decision, financial exposure, and next action', async ({
  page,
}) => {
  await loginAs(page, 'Руководитель эксплуатации', /portfolio/)
  const portfolioHero = page.locator('main .page-hero').first()
  await expect(portfolioHero.getByText('Максимальный финансовый риск')).toBeVisible()
  await expect(portfolioHero.getByText('Следующее операционное действие')).toBeVisible()

  await loginAs(page, 'Администратор', /\/$|portfolio/)
  await page.goto(`${BASE}/`)
  await expect(page.getByText('Следующее управленческое решение')).toBeVisible()
  await expect(page.getByRole('link', { name: /Открыть приоритетный инцидент/ })).toBeVisible()

  await loginAs(page, 'Финансовый', /finance/)
  await expect(page.getByText('Открытый риск без подтверждённой суммы')).toBeVisible()
  await expect(page.getByRole('link', { name: /Открыть незакрытый контур/ })).toBeVisible()
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

test('reports keep canonical availability metrics and site causes drill down to the scoped register', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 720 })

  await loginAs(page, 'Операционный директор', /finance/)
  await page.goto(`${BASE}/reports`)
  const report = page
    .locator('main [data-slot="card"]')
    .filter({ hasText: 'Управленческий отчёт — Все объекты' })
  await expect(report.getByText('Техническая доступность', { exact: true })).toBeVisible()
  await expect(report.getByText('Операционная доступность мощности', { exact: true })).toBeVisible()
  await expect(
    report.getByText('Подтверждённое операционное влияние', { exact: true }),
  ).toBeVisible()
  await expect(report.getByText('Техническая недоступность', { exact: true })).toBeVisible()
  await expect(report.getByText('Подтверждённые потери', { exact: true })).toBeVisible()
  await expect(report.getByText('Доступность', { exact: true })).toHaveCount(0)
  await page.screenshot({
    path: testInfo.outputPath('reports-canonical-kpis.png'),
    fullPage: false,
  })

  await loginAs(page, 'Начальник склада', /my-site/)
  await page.getByRole('link', { name: /^Загрязнение защитного датчика/ }).click()
  await page.waitForURL(/\/incidents\?cause=CA-045/, { timeout: 10_000 })
  await expect(page.getByText(/Причина:.*Загрязнение защитного датчика/)).toBeVisible()
  await expect(page.getByText('Инцидентов: 2', { exact: true })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('site-cause-drilldown.png'), fullPage: false })
})

test('reports keep the top-causes decision table inside the desktop container', async ({
  page,
}, testInfo) => {
  await loginAs(page, 'Операционный директор', /finance/)

  for (const width of [1200, 1280]) {
    await page.setViewportSize({ width, height: 720 })
    await page.goto(`${BASE}/reports`)

    const causesTable = page
      .locator('main [data-slot="card"]')
      .filter({ hasText: 'Топ причин по потерям' })
      .locator('[data-slot="table-container"]')
    await expect(causesTable).toBeVisible()
    expect(
      await causesTable.evaluate((element) => element.scrollWidth <= element.clientWidth),
    ).toBe(true)
  }

  await page.screenshot({
    path: testInfo.outputPath('reports-top-causes-desktop.png'),
    fullPage: false,
  })
})

test('site manager keeps the selected report cause in the accessible incident register', async ({
  page,
}, testInfo) => {
  await loginAs(page, 'Начальник склада', /my-site/)
  await page.goto(`${BASE}/reports`)

  const causeRow = page
    .locator('main [data-slot="card"]')
    .filter({ hasText: 'Топ причин по потерям' })
    .locator('tr', { hasText: 'CA-045 · Загрязнение защитного датчика' })
  await expect(causeRow).toBeVisible()
  await expect(causeRow.getByText('Сервис', { exact: true })).toBeVisible()
  await expect(causeRow.getByText('SERVICE', { exact: true })).toHaveCount(0)
  await causeRow.click()

  await page.waitForURL(/\/incidents\?cause=CA-045/, { timeout: 10_000 })
  await expect(page.getByText(/Причина:.*Загрязнение защитного датчика/)).toBeVisible()
  await expect(page.getByText('Инцидентов: 2', { exact: true })).toBeVisible()
  await page.screenshot({
    path: testInfo.outputPath('reports-site-manager-cause.png'),
    fullPage: false,
  })
})

test('desktop registry tables keep their primary management columns in view', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await loginAs(page, 'Администратор', /\/$|portfolio/)

  for (const route of ['/events', '/downtimes', '/robots', '/sites', '/analytics?view=econ']) {
    await page.goto(`${BASE}${route}`)
    const table = page.locator('main [data-slot="table-container"]').first()
    await expect(table, `${route} renders its primary table`).toBeVisible()
    if (route === '/events') {
      await expect(
        table.getByText('Сработал защитный бампер — аварийная остановка').first(),
      ).toBeVisible()
    }
    const widths = await table.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }))
    expect
      .soft(
        widths.scrollWidth,
        `${route} keeps its desktop primary columns in the visible container`,
      )
      .toBeLessThanOrEqual(widths.clientWidth)
  }
})
