import { expect, test, type Page } from '@playwright/test'

/**
 * Сквозной рабочий сценарий TZ v1.6 §15/§24 (пакет B):
 * очередь «Требуют разбора» → координатор → причина (primary→refined→final) →
 * сервисное действие + результат → восстановление (авто-закрытие интервала) →
 * решение по простою → закрытие. Затем ручное создание инцидента.
 *
 * Первый шаг сбрасывает IndexedDB-overlay, поэтому набор воспроизводим.
 * Требует запущенного dev-сервера: pnpm dev (:5180).
 */

const BASE = 'http://localhost:5180'

async function loginAs(page: Page, role: string): Promise<void> {
  await page.goto(`${BASE}/login`)
  await page.locator('button', { hasText: role }).first().click()
  await page.waitForURL(`${BASE}/`, { timeout: 10_000 })
}

async function resetDemo(page: Page): Promise<void> {
  await loginAs(page, 'Администратор')
  await page.goto(`${BASE}/incidents`)
  await page.locator('button', { hasText: 'Сбросить демо-данные' }).click()
  await page.waitForTimeout(1_800)
  if (page.url().includes('/login')) {
    await page.locator('button', { hasText: 'Администратор' }).first().click()
    await page.waitForURL(`${BASE}/`, { timeout: 10_000 })
  }
}

test('сквозной разбор (v2 §6): координатор → безопасность → резерв → ввод → причина → сервис → возврат → закрытие', async ({
  page,
}) => {
  await resetDemo(page)

  // Очередь «Требует разбора» → живой рабочий инцидент INC-2026-0033
  await page.goto(`${BASE}/incidents`)
  await page.locator('button', { hasText: 'Требует разбора' }).first().click()
  await page.waitForTimeout(400)

  const row = page.locator('tbody tr', { hasText: 'INC-2026-0033' }).first()
  await expect(row).toBeVisible()
  await row.click()
  await page.waitForURL(/\/incidents\//, { timeout: 10_000 })
  await expect(page.getByText('Следующее действие:').first()).toBeVisible({ timeout: 10_000 })

  // 1. Принять в работу
  await page.locator('button', { hasText: 'Назначить координатора' }).click()
  await page.locator('[role="dialog"] button', { hasText: 'Принять в работу' }).click()
  await expect(page.locator('[role="dialog"]')).toBeHidden({ timeout: 5_000 })

  // 2. Безопасность (ТЗ §6 шаг 4)
  await page.locator('button', { hasText: 'Обеспечить безопасность' }).click()
  const safetyDlg = page.locator('[role="dialog"]')
  await safetyDlg
    .locator('textarea')
    .fill('Зона C-12 ограждена, FMR-001 выведен с критического пути на сервисную стоянку')
  await safetyDlg.locator('button', { hasText: 'Подтвердить безопасность' }).click()
  await expect(safetyDlg).toBeHidden({ timeout: 5_000 })

  // 3. Назначить резерв FMR-012 (шаг 5)
  await page.locator('button', { hasText: 'Назначить резерв' }).click()
  const subDlg = page.locator('[role="dialog"]')
  await subDlg.getByRole('combobox', { name: /Резервный робот/ }).click()
  await page.getByRole('option', { name: /FMR-012/ }).click()
  await subDlg.locator('button', { hasText: 'Назначить', exact: true }).click()
  await expect(subDlg).toBeHidden({ timeout: 5_000 })

  // 4. Ввод резерва = точка «Процесс восстановлен» (шаг 6): влияние закрыто
  await page.locator('button', { hasText: 'Подтвердить ввод резерва' }).click()
  await expect(page.getByText('Процесс восстановлен, сервис продолжается').first()).toBeVisible({
    timeout: 5_000,
  })
  await expect(page.getByText('начисление потерь процесса прекращено').first()).toBeVisible()

  // 5. Предварительная причина → уточнить → финальная (CA-041 столкновение)
  await page.locator('button', { hasText: 'Предварительная причина' }).click()
  const causeDlg = page.locator('[role="dialog"]')
  await causeDlg.locator('button[role="combobox"]').first().click()
  await page.getByRole('option', { name: /CA-041/ }).click()
  await causeDlg
    .locator('textarea')
    .first()
    .fill(
      'Повторный контакт с погрузчиком на пересечении C-12: повреждён правый привод; акт и фото приложены.',
    )
  await causeDlg.locator('button', { hasText: 'Записать' }).click()
  await expect(causeDlg).toBeHidden({ timeout: 5_000 })

  await page.locator('button', { hasText: 'Уточнить причину' }).click()
  const dlg2 = page.locator('[role="dialog"]')
  await dlg2
    .locator('textarea')
    .first()
    .fill('Диагностика подтвердила повреждение приводного модуля правого привода после контакта.')
  await dlg2.locator('button', { hasText: 'Записать' }).click()
  await expect(dlg2).toBeHidden({ timeout: 5_000 })

  await page.locator('button', { hasText: 'Подтвердить причину' }).click()
  const dlg3 = page.locator('[role="dialog"]')
  await dlg3
    .locator('textarea')
    .first()
    .fill('Финально: столкновение со складской техникой; требуется замена приводного модуля.')
  await dlg3.locator('button', { hasText: 'Записать' }).click()
  await expect(dlg3).toBeHidden({ timeout: 5_000 })

  // 6. Сервисное действие + результат (шаги 7–8)
  await page.locator('button', { hasText: 'Создать действие' }).click()
  const dlg4 = page.locator('[role="dialog"]')
  await dlg4.locator('input').first().fill('Замена приводного модуля FMR-001')
  await dlg4
    .locator('textarea')
    .fill('Заменить приводной модуль, затянуть крепёж моментом, контрольный маршрут с грузом')
  await dlg4.getByLabel('Исполнитель *').fill('Сервисный инженер')
  await dlg4.locator('button', { hasText: 'Создать', exact: true }).click()
  await expect(dlg4).toBeHidden({ timeout: 5_000 })

  await page.locator('[role="tab"]', { hasText: 'Действия' }).click()
  await page.locator('button', { hasText: 'Зафиксировать результат' }).first().click()
  const dlg5 = page.locator('[role="dialog"]')
  await dlg5.locator('textarea').fill('Модуль заменён; контрольный маршрут по зоне C-12 без ошибок')
  await dlg5.locator('button', { hasText: 'Зафиксировать' }).click()
  await expect(dlg5).toBeHidden({ timeout: 5_000 })

  // 7. Восстановление + решение по простою
  await page.locator('button', { hasText: 'Подтвердить восстановление' }).click()
  const dlg6 = page.locator('[role="dialog"]')
  await dlg6.locator('textarea').fill('Контрольный маршрут с грузом выполнен без ошибок')
  await dlg6.locator('button', { hasText: 'Подтвердить восстановление' }).click()
  await expect(dlg6).toBeHidden({ timeout: 5_000 })

  const decideBtn = page.locator('button', { hasText: 'Решение по простою' })
  if (await decideBtn.isVisible().catch(() => false)) {
    await decideBtn.click()
    const dlg7 = page.locator('[role="dialog"]')
    await dlg7.locator('textarea').fill('Влияние подтверждено по факту до ввода резерва')
    await dlg7.locator('button', { hasText: 'Принять решение' }).click()
    await expect(dlg7).toBeHidden({ timeout: 5_000 })
  }

  // 8. Возврат робота в парк = точка 2 (шаг 9) — обязателен до закрытия
  await page.locator('button', { hasText: 'Вернуть робота в парк' }).click()
  await expect(page.getByText('Техническая недоступность закрыта').first()).toBeVisible({
    timeout: 5_000,
  })

  // 9. Закрыть инцидент
  const closeBtn = page.locator('button', { hasText: 'Закрыть инцидент' })
  await expect(closeBtn).toBeEnabled({ timeout: 10_000 })
  await closeBtn.click()

  // История: ручные записи + авто-записи + закрытие
  await page.locator('[role="tab"]', { hasText: 'История' }).click()
  const historyText = await page.locator('body').textContent()
  expect(historyText).toContain('Причина подтверждена')
  expect(historyText).toContain('(авто)')
  expect(historyText).toContain('Безопасность обеспечена')
  expect(historyText).toContain('мощность зоны восстановлена')
  expect(historyText).toContain('возвращён в парк')
  expect(historyText).toContain('Инцидент закрыт')
  await page.screenshot({ path: 'e2e-screens/demo-b-full-cycle.png', fullPage: true })
})

test('ручное создание инцидента: форма → карточка → история с автором', async ({ page }) => {
  await loginAs(page, 'Администратор')
  await page.goto(`${BASE}/incidents`)

  await page.locator('button', { hasText: 'Создать инцидент' }).click()
  const dlg = page.locator('[role="dialog"]')
  await dlg.locator('input').first().fill('K-4')
  await dlg
    .locator('textarea')
    .fill('Робот стоит в зоне K-4, погрузчик перекрыл проезд при разгрузке')
  await dlg.locator('button', { hasText: 'Зарегистрировать' }).click()
  await page.waitForURL(/\/incidents\//, { timeout: 10_000 })

  await expect(page.getByText('Следующее действие:').first()).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('ручной ввод', { exact: false }).first()).toBeVisible()

  await page.locator('[role="tab"]', { hasText: 'История' }).click()
  const txt = await page.locator('body').textContent()
  expect(txt).toContain('зарегистрирован вручную')
  await page.screenshot({ path: 'e2e-screens/demo-b-manual-create.png', fullPage: true })
})

test.afterEach(async ({ page }) => {
  // воспроизводимость: сбрасываем overlay после каждого теста
  if (!page.isClosed()) {
    await page.goto(`${BASE}/incidents`).catch(() => {})
    const btn = page.locator('button', { hasText: 'Сбросить демо-данные' })
    if (await btn.isVisible().catch(() => false)) {
      await btn.click().catch(() => {})
      await page.waitForTimeout(1_200)
    }
  }
})
