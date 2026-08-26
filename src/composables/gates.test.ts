import { describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAuthStore } from '@/stores/auth'
import { useDemoData } from '@/composables/useDemoData'
import { impactSeconds, techUnavailableSeconds } from '@/data/metrics'

// ─── G2 (план приёмки PKG-G): инвариант «нет невозможных состояний после
// любой последовательности действий» — гейты A1/A2 и сценарные метки A4.
// Проверяется на живом сбрасываемом INC-2026-0033: каждый шаг пути
// ТЗ §6 (координатор → резерв → ввод → причина → сервис → результат →
// восстановление → возврат → закрытие) сохраняет инварианты состояний и
// контрольные 25 мин / 29 167 ₽ / 8 ч 28 мин.

const LIVE = 'inc-033'

// Node-окружение витеста без DOM: минимальные заглушки localStorage
// (auth-стор пишет выбор роли) и indexedDB (overlay — try/catch в persistence).
const memory = new Map<string, string>()
;(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => memory.get(k) ?? null,
  setItem: (k: string, v: string) => void memory.set(k, v),
  removeItem: (k: string) => void memory.delete(k),
}

// Pinia активна до создания стора (guard обращается к auth внутри мутаций).
setActivePinia(createPinia())
const store = useDemoData()
const auth = useAuthStore()

function liveImpact() {
  return store.downtimes.value.find(
    (d) => d.incidentId === LIVE && d.intervalType === 'OPERATIONAL_IMPACT',
  )
}
function liveTech() {
  return store.downtimes.value.find(
    (d) => d.incidentId === LIVE && d.intervalType === 'TECHNICAL_UNAVAILABLE',
  )
}
function liveRobot() {
  const inc = store.incidents.value.find((i) => i.id === LIVE)!
  return store.robots.value.find((r) => r.id === inc.robotId)!
}

/** Инвариант парка (ТЗ §12.3): единица ровно в одном состоянии. */
function parkInvariantHolds(): boolean {
  const states = store.robots.value.map((r) => r.fleetState)
  return states.every((s) => typeof s === 'string' && s.length > 0)
}

/** Резерв не назначен в две зоны: ASSIGNED_REPLACE/WORKING-резерв уникален. */
function backupNotDoubleAssigned(): boolean {
  const backupIds = new Set(
    store.substitutions.value.filter((s) => s.engagedAt == null).map((s) => s.backupRobotId),
  )
  return backupIds.size === store.substitutions.value.filter((s) => s.engagedAt == null).length
}

describe('G2 · Permission-гейты (ACC-006/A2)', () => {
  const READ_ONLY: Array<'FINANCE_MANAGER' | 'OPERATIONS_DIRECTOR'> = [
    'FINANCE_MANAGER',
    'OPERATIONS_DIRECTOR',
  ]

  for (const role of READ_ONLY) {
    it(`${role}: все операционные мутации отвергаются гардом`, () => {
      auth.loginAs(role)
      expect(store.assignCoordinator(LIVE, 'Тест').ok).toBe(false)
      expect(store.assignSubstitution(LIVE, 'fmr-12', 'Тест').ok).toBe(false)
      expect(store.engageBackup(LIVE, 'Тест').ok).toBe(false)
      expect(store.returnRobotToPark(LIVE, 'Тест').ok).toBe(false)
      expect(
        store.classifyCause(LIVE, 'CA-041', 'достаточно длинный комментарий', 'Тест', 'PRIMARY').ok,
      ).toBe(false)
      expect(
        store.createServiceAction({
          incidentId: LIVE,
          actionTypeName: 'Ремонт',
          description: 'Ремонт привода',
          executor: 'Инженер',
          dueAt: '2026-01-01T10:00:00Z',
          actorName: 'Тест',
        }).ok,
      ).toBe(false)
      expect(store.closeIncident(LIVE, 'Тест').ok).toBe(false)
    })
  }

  it('без входа мутации недоступны', () => {
    auth.logout()
    expect(store.assignCoordinator(LIVE, 'Тест').ok).toBe(false)
  })
})

describe('G2 · Машина состояний живого сценария (A1/A3/A4)', () => {
  it('ранний возврат заблокирован на каждом незавершённом шаге', () => {
    auth.loginAs('SYSTEM_ADMIN')
    const gate0 = store.returnGate(LIVE)
    expect(gate0.ok).toBe(false)
    expect(gate0.unmet.length).toBeGreaterThanOrEqual(4)
    expect(store.returnRobotToPark(LIVE, 'Тест').ok).toBe(false)
  })

  it('полный путь сохраняет инварианты и контрольные суммы', () => {
    auth.loginAs('SYSTEM_ADMIN')
    const rate = store.sites.value.find((s) => s.id === 'site-pod')!.ratePerHour

    // Шаг 8 ТЗ §6: координатор (безопасность — авто-запись).
    expect(store.assignCoordinator(LIVE, 'Иван Петров').ok).toBe(true)
    expect(parkInvariantHolds()).toBe(true)
    expect(store.returnGate(LIVE).ok).toBe(false)

    // Шаг 8.5: резерв назначен — повреждённый в диагностике, резерв следует.
    expect(store.assignSubstitution(LIVE, 'fmr-12', 'Иван Петров').ok).toBe(true)
    expect(backupNotDoubleAssigned()).toBe(true)
    expect(['DIAGNOSTICS', 'MAINTENANCE']).toContain(liveRobot().fleetState)
    // Влияние ещё открыто — потери не подтверждены.
    expect(liveImpact()?.intervalState).toBe('OPEN')

    // Повторное назначение того же резерва невозможно (ACC-003).
    expect(store.assignSubstitution(LIVE, 'fmr-12', 'Иван Петров').ok).toBe(false)

    // Шаг 9: ввод резерва закрывает влияние на контрольных 25 мин.
    expect(store.engageBackup(LIVE, 'Иван Петров').ok).toBe(true)
    const impact = liveImpact()!
    expect(impact.intervalState).toBe('CLOSED')
    expect(impact.accountableDurationSeconds).toBe(25 * 60)
    expect(impact.lossRubles).toBe(Math.round((25 / 60) * rate))
    // Промежуточное состояние ТЗ §5.3.
    const st = store.incidentProcessState(LIVE)
    expect(st.processRestored).toBe(true)
    expect(st.robotReturned).toBe(false)
    expect(st.label).toBe('Процесс восстановлен, сервис продолжается')
    // Техническая недоступность продолжается и не тарифицируется.
    expect(liveTech()?.intervalState).toBe('OPEN')
    expect(liveTech()!.lossRubles).toBe(0)

    // Возврат по-прежнему закрыт: нет причины/сервиса/восстановления.
    expect(store.returnRobotToPark(LIVE, 'Тест').ok).toBe(false)

    // Шаг 10: причина (предварительная → уточнение → финальная).
    expect(
      store.classifyCause(
        LIVE,
        'CA-041',
        'Повторный контакт с погрузчиком в C-12.',
        'Иван Петров',
        'PRIMARY',
      ).ok,
    ).toBe(true)
    expect(
      store.classifyCause(
        LIVE,
        'CA-041',
        'Диагностика: повреждён приводной модуль.',
        'Инженер',
        'REFINED',
      ).ok,
    ).toBe(true)
    expect(
      store.classifyCause(
        LIVE,
        'CA-041',
        'Финально: столкновение со складской техникой.',
        'Иван Петров',
        'FINAL',
      ).ok,
    ).toBe(true)
    expect(store.returnGate(LIVE).ok).toBe(false)

    // Сервисное действие + связанная работа ТОиР.
    expect(
      store.createServiceAction({
        incidentId: LIVE,
        actionTypeName: 'Замена приводного модуля FMR-001',
        description: 'Замена модуля и контрольный маршрут',
        executor: 'Сервисный инженер',
        dueAt: '2026-01-01T10:00:00Z',
        actorName: 'Иван Петров',
      }).ok,
    ).toBe(true)
    const action = store.serviceActions.value.find((a) => a.incidentId === LIVE)!
    expect(
      store.completeAction(action.id, 'SUCCESS', 'Модуль заменён, запуск пройден', 'Инженер').ok,
    ).toBe(true)

    // Шаг 11: подтверждение восстановления.
    expect(
      store.confirmRecovery(
        LIVE,
        'SUCCESSFUL_ACTION',
        'Контрольный запуск без ошибок',
        'Иван Петров',
      ).ok,
    ).toBe(true)

    // Гейт открыт: причина финальна, работа завершена, запуск пройден.
    const gate = store.returnGate(LIVE)
    expect(gate.ok).toBe(true)

    // Шаг 12: возврат закрывает техническую недоступность 8 ч 28 мин.
    expect(store.returnRobotToPark(LIVE, 'Иван Петров').ok).toBe(true)
    const tech = liveTech()!
    expect(tech.intervalState).toBe('CLOSED')
    expect(tech.accountableDurationSeconds).toBe(8 * 3600 + 28 * 60)
    expect(tech.lossRubles).toBe(0)
    // Робот восстановлен, резерв вернулся в пул.
    expect(liveRobot().fleetState).toBe('WORKING')
    expect(store.robots.value.find((r) => r.id === 'fmr-12')!.fleetState).toBe('RESERVE')
    // Влияние не начислялось повторно после ввода резерва (P0-08/ТЗ §12.3).
    expect(liveImpact()!.accountableDurationSeconds).toBe(25 * 60)
    expect(
      impactSeconds(store.downtimes.value.filter((d) => d.siteId === 'site-pod')),
    ).toBeGreaterThan(0)

    // Шаг 13: решение по простою + закрытие.
    expect(store.decideDowntime(LIVE, 'CONFIRM', 'Иван Петров').ok).toBe(true)
    expect(store.readyToClose(LIVE)).toBe(true)
    expect(store.closeIncident(LIVE, 'Иван Петров').ok).toBe(true)
    expect(store.incidents.value.find((i) => i.id === LIVE)!.status).toBe('CLOSED')
    // Двойное закрытие невозможно.
    expect(store.closeIncident(LIVE, 'Иван Петров').ok).toBe(false)

    // Итоговые инварианты парка после всей последовательности.
    expect(parkInvariantHolds()).toBe(true)
    expect(backupNotDoubleAssigned()).toBe(true)
    expect(techUnavailableSeconds(store.downtimes.value)).toBeGreaterThan(0)
  })
})
