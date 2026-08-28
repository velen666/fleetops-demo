import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

const BASE = 'http://localhost:5180'

async function loginAsAdministrator(page: Page): Promise<void> {
  await page.goto(`${BASE}/login`)
  await page.getByRole('button', { name: 'Администратор' }).first().click()
  await page.waitForURL(`${BASE}/`)
}

test.describe('mobile application shell', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('keeps incident actions reachable and closes the navigation drawer with Escape', async ({
    page,
  }) => {
    await loginAsAdministrator(page)

    await page.goto(`${BASE}/incidents`)
    const horizontalSize = await page.locator('main').evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }))
    expect(horizontalSize.scrollWidth).toBeLessThanOrEqual(horizontalSize.clientWidth)
    for (const actionName of [
      'Создать инцидент',
      'Сбросить демо-данные',
      'Экспорт CSV',
      'Сохранить представление',
    ]) {
      await expect(page.getByRole('button', { name: actionName })).toBeVisible()
    }

    const trigger = page.getByRole('button', { name: 'Открыть навигацию' })
    await trigger.focus()
    await trigger.press('Enter')

    const drawer = page.locator('aside').first()
    const closeButton = drawer.getByRole('button', { name: 'Закрыть навигацию' })
    await expect(closeButton).toBeFocused()

    const backdrop = page.locator('button[aria-label="Закрыть навигацию"]').first()
    const backdropColor = await backdrop.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    )
    await backdrop.hover({ position: { x: 380, y: 800 } })
    await expect
      .poll(() => backdrop.evaluate((element) => getComputedStyle(element).backgroundColor))
      .toBe(backdropColor)

    await page.keyboard.press('Escape')
    await expect(drawer).toHaveAttribute('aria-hidden', 'true')
    await expect(trigger).toBeFocused()
  })
})
