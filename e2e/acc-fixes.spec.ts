import { expect, test, type Page } from '@playwright/test'

/**
 * Проверки устранения блокирующих замечаний приёмки (ACC-001..008, 022, 023,
 * 004): гейт возврата, права ролей, объектовая область, ролевые главные,
 * детерминированная экономика, консистентность метрик.
 */

const BASE = 'http://localhost:5180'

async function loginAs(page: Page, role: string, expectedUrlPart: string): Promise<void> {
  await page.goto(`${BASE}/login`)
  await page.locator('button', { hasText: role }).first().click()
  await page.waitForURL(new RegExp(expectedUrlPart), { timeout: 10_000 })
}

async function resetDemo(page: Page): Promise<void> {
  await loginAs(page, 'Администратор', '/$|portfolio')
  await page.goto(`${BASE}/incidents`)
  await page.locator('button', { hasText: 'Сбросить демо-данные' }).click()
  await page.waitForTimeout(1_800)
  if (page.url().includes('/login')) {
    await page.locator('button', { hasText: 'Администратор' }).first().click()
    await page.waitForURL(/portfolio|\/$/, { timeout: 10_000 })
  }
}

test('ACC-001: ранний возврат робота в парк заблокирован гейтом', async ({ page }) => {
  await resetDemo(page)
  await page.goto(`${BASE}/incidents`)
  await page.locator('tbody tr', { hasText: 'INC-2026-0033' }).first().click()
  await page.waitForURL(/\/incidents\//, { timeout: 10_000 })

  // Координатор (безопасность — авто) → резерв → ввод резерва.
  await page.locator('button', { hasText: 'Назначить координатора' }).click()
  await page.locator('[role="dialog"] button', { hasText: 'Принять в работу' }).click()
  await page.locator('button', { hasText: 'Назначить резерв' }).click()
  const subDlg = page.locator('[role="dialog"]')
  await subDlg.getByRole('combobox', { name: /Резервный робот/ }).click()
  await page.getByRole('option', { name: /FMR-012/ }).click()
  await subDlg.locator('button', { hasText: 'Назначить', exact: true }).click()
  await expect(subDlg).toBeHidden({ timeout: 5_000 })
  await page.locator('button', { hasText: 'Подтвердить ввод резерва' }).click()
  await expect(page.getByText('Процесс восстановлен, сервис продолжается').first()).toBeVisible()

  // Без причины и сервиса возврат недоступен (ACC-001).
  const returnBtn = page.locator('button', { hasText: 'Вернуть робота в парк' })
  await expect(returnBtn).toBeVisible()
  await expect(returnBtn).toBeDisabled()
  await expect(
    page.getByText('Возврат робота в парк недоступен, пока не завершены').first(),
  ).toBeVisible()
})

test('ACC-004: детерминированная экономика живого сценария — 25 мин / 29 167 ₽ / 8 ч 28 мин', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await resetDemo(page)
  await page.goto(`${BASE}/incidents`)
  await page.locator('tbody tr', { hasText: 'INC-2026-0033' }).first().click()
  await page.waitForURL(/\/incidents\//, { timeout: 10_000 })

  await page.locator('button', { hasText: 'Назначить координатора' }).click()
  await page.locator('[role="dialog"] button', { hasText: 'Принять в работу' }).click()
  await page.locator('button', { hasText: 'Назначить резерв' }).click()
  const subDlg = page.locator('[role="dialog"]')
  await subDlg.getByRole('combobox', { name: /Резервный робот/ }).click()
  await page.getByRole('option', { name: /FMR-012/ }).click()
  await subDlg.locator('button', { hasText: 'Назначить', exact: true }).click()
  await page.locator('button', { hasText: 'Подтвердить ввод резерва' }).click()
  await expect(page.getByText('Процесс восстановлен, сервис продолжается').first()).toBeVisible()

  // Контрольные 25 минут и 29 167 ₽ (сценарная метка 09:37).
  const body = (await page.locator('body').textContent())?.replace(/\u00A0/g, ' ') ?? ''
  expect(body).toContain('25 мин')
  expect(body).toContain('29 167')

  // Причина → сервис → результат → восстановление → возврат.
  await page.locator('button', { hasText: 'Предварительная причина' }).click()
  const causeDlg = page.locator('[role="dialog"]')
  await causeDlg.locator('button[role="combobox"]').first().click()
  await page.getByRole('option', { name: /CA-041/ }).click()
  await causeDlg.locator('textarea').first().fill('Повторный контакт с погрузчиком в C-12.')
  await causeDlg.locator('button', { hasText: 'Записать' }).click()

  await page.locator('button', { hasText: 'Уточнить причину' }).click()
  const dlg2 = page.locator('[role="dialog"]')
  await dlg2.locator('textarea').first().fill('Диагностика: повреждён приводной модуль.')
  await dlg2.locator('button', { hasText: 'Записать' }).click()

  await page.locator('button', { hasText: 'Подтвердить причину' }).click()
  const dlg3 = page.locator('[role="dialog"]')
  await dlg3.locator('textarea').first().fill('Финально: столкновение со складской техникой.')
  await dlg3.locator('button', { hasText: 'Записать' }).click()

  await page.locator('button', { hasText: 'Создать действие' }).click()
  const dlg4 = page.locator('[role="dialog"]')
  await dlg4.locator('input').first().fill('Замена приводного модуля FMR-001')
  await dlg4.locator('textarea').fill('Замена модуля и контрольный маршрут')
  await dlg4.getByLabel('Исполнитель *').fill('Сервисный инженер')
  await dlg4.locator('button', { hasText: 'Создать', exact: true }).click()

  await page.locator('[role="tab"]', { hasText: 'Действия' }).click()
  await page.locator('button', { hasText: 'Зафиксировать результат' }).first().click()
  const dlg5 = page.locator('[role="dialog"]')
  await dlg5.locator('textarea').fill('Модуль заменён, контрольный запуск пройден')
  await dlg5.locator('button', { hasText: 'Зафиксировать' }).click()

  await page.locator('button', { hasText: 'Подтвердить восстановление' }).click()
  const dlg6 = page.locator('[role="dialog"]')
  await dlg6.locator('textarea').fill('Контрольный запуск без ошибок')
  await dlg6.locator('button', { hasText: 'Подтвердить восстановление' }).click()

  const decideBtn = page.locator('button', { hasText: 'Решение по простою' })
  if (await decideBtn.isVisible().catch(() => false)) {
    await decideBtn.click()
    const dlg7 = page.locator('[role="dialog"]')
    await dlg7.locator('button', { hasText: 'Принять решение' }).click()
  }

  // Гейт открыт: причина финальна, работа завершена, запуск пройден.
  const returnBtn = page.locator('button', { hasText: 'Вернуть робота в парк' })
  await expect(returnBtn).toBeEnabled({ timeout: 5_000 })
  await returnBtn.click()
  await expect(page.getByText('Техническая недоступность закрыта').first()).toBeVisible()

  // Контрольная техническая недоступность 8 ч 28 мин (сценарная метка 17:40).
  const body2 = (await page.locator('body').textContent())?.replace(/\u00A0/g, ' ') ?? ''
  expect(body2).toContain('8 ч 28 мин')
})

test('ACC-006: финансовый директор не видит операционных действий', async ({ page }) => {
  await loginAs(page, 'Финансовый', 'finance')
  await page.goto(`${BASE}/incidents`)
  await page.locator('tbody tr', { hasText: 'INC-2026-0033' }).first().click()
  await page.waitForURL(/\/incidents\//, { timeout: 10_000 })

  await expect(page.locator('button', { hasText: 'Добавить наблюдение' })).toHaveCount(0)
  await expect(page.locator('button', { hasText: 'Подтвердить ввод резерва' })).toHaveCount(0)
  await expect(page.locator('button', { hasText: 'Назначить координатора' })).toHaveCount(0)
  await expect(page.locator('button', { hasText: 'Вернуть робота в парк' })).toHaveCount(0)
  await expect(page.locator('button', { hasText: 'Закрыть инцидент' })).toHaveCount(0)
})

test('ACC-007: начальник склада видит в Отчётах только свой объект', async ({ page }) => {
  await loginAs(page, 'Начальник', 'my-site')
  await page.goto(`${BASE}/reports`)
  await expect(page.locator('h1', { hasText: 'Отчёты' })).toBeVisible({ timeout: 15_000 })
  await page.waitForTimeout(500)
  const body = await page.locator('body').textContent()
  expect(body).toContain('Подольск')
  expect(body).not.toContain('Обухово')
  expect(body).not.toContain('Домодедово')
})

test('ACC-022: ролевые главные страницы', async ({ page }) => {
  await loginAs(page, 'Руководитель эксплуатации', 'portfolio')
  await expect(page.getByText('Портфель роботизации').first()).toBeVisible()
  await expect(page.getByText('Очередь решений').first()).toBeVisible()

  await page.goto(`${BASE}/login`)
  await page.locator('button', { hasText: 'Финансовый' }).first().click()
  await page.waitForURL(/finance/, { timeout: 10_000 })
  await expect(page.getByText('Подтверждённые потери процесса').first()).toBeVisible()

  await page.goto(`${BASE}/login`)
  await page.locator('button', { hasText: 'Сервисный инженер' }).first().click()
  await page.waitForURL(/maintenance/, { timeout: 10_000 })
  await expect(page.getByText('Мои работы').first()).toBeVisible()
})

test('ACC-023: контрольные метрики и консистентность доступности', async ({ page }) => {
  await loginAs(page, 'Администратор', '/$|portfolio')
  await page.goto(`${BASE}/analytics`)
  await expect(page.getByText('Техническая доступность').first()).toBeVisible({
    timeout: 20_000,
  })
  await page.waitForTimeout(500)

  const body = (await page.locator('body').textContent())?.replace(/\u00A0/g, ' ') ?? ''
  expect(body).toContain('99,21')
  expect(body).toContain('99,71')

  // Один и тот же робот: список и карточка показывают одинаковую доступность.
  await page.goto(`${BASE}/robots`)
  await expect(page.locator('tbody').first()).toBeVisible({ timeout: 15_000 })
  const row = page.locator('tbody tr', { hasText: 'FMR-001' }).first()
  const listAvail = ((await row.locator('td').filter({ hasText: '%' }).first().textContent()) ?? '')
    .trim()
  await row.click()
  await page.waitForURL(/\/robots\//, { timeout: 10_000 })
  await expect(page.getByText(/Техническая доступность \(30 дней\)/)).toBeVisible({
    timeout: 15_000,
  })
  const cardAvail = await page
    .getByText(/Техническая доступность \(30 дней\)/)
    .locator('..')
    .textContent()
  expect(cardAvail).toContain(listAvail)
})

test('ACC-008: реестр событий показывает канонические номера инцидентов', async ({ page }) => {
  await loginAs(page, 'Администратор', '/$|portfolio')
  await page.goto(`${BASE}/events`)
  const body = await page.locator('tbody').textContent()
  expect(body).not.toMatch(/inc-\d{3}/)
})

test('сценарий v1.1 шаг 8: руководитель эксплуатации создаёт сервисное действие', async ({
  page,
}) => {
  await loginAs(page, 'Руководитель эксплуатации', 'portfolio')
  await page.goto(`${BASE}/incidents`)
  await page.locator('tbody tr', { hasText: 'INC-2026-0033' }).first().click()
  await page.waitForURL(/\/incidents\//, { timeout: 10_000 })
  await expect(page.locator('button', { hasText: 'Создать действие' })).toBeVisible()
})

test('ACC-004 (регрессия): суточный overlay отбрасывается и не ломает контрольные суммы', async ({
  page,
}) => {
  await resetDemo(page)
  // Имитируем overlay прошлых суток: чужая правка с меткой старой даты.
  await page.evaluate(async () => {
    const db = await indexedDB.open('fleetops-demo')
    await new Promise((r) => {
      db.onsuccess = r
    })
    const tx = db.result.transaction('overlay', 'readwrite')
    tx.objectStore('overlay').put(
      {
        replaced: { incidents: { 'inc-033': { id: 'inc-033', coordinatorName: 'Прошлые сутки' } } },
        appended: {},
        timelineAppend: [],
        baseDate: '2000-01-01',
        schemaVersion: 1,
      },
      'data',
    )
    await new Promise((r) => {
      tx.oncomplete = r
    })
  })
  await page.goto(`${BASE}/incidents`)
  await page.locator('tbody tr', { hasText: 'INC-2026-0033' }).first().click()
  await page.waitForURL(/\/incidents\//, { timeout: 10_000 })
  // Правка суточной давности не применена: живой инцидент снова
  // без координатора, сценарий начинается с чистого состояния.
  const body = (await page.locator('body').textContent()) ?? ''
  expect(body).not.toContain('Прошлые сутки')
  await expect(page.getByText('Следующее действие:').first()).toBeVisible()
})

test.afterEach(async ({ page }) => {
  if (!page.isClosed()) {
    await page.goto(`${BASE}/incidents`).catch(() => {})
    const btn = page.locator('button', { hasText: 'Сбросить демо-данные' })
    if (await btn.isVisible().catch(() => false)) {
      await btn.click().catch(() => {})
      await page.waitForTimeout(1_200)
    }
  }
})
