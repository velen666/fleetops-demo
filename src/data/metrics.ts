import type { Downtime } from '@/types/domain'

/**
 * Единые формулы метрик (Отчёт приёмки ACC-023): один модуль — один источник.
 * Все экраны (обзор, аналитика, карточки роботов/объектов, отчёты) обязаны
 * считать доступность и потери только через эти селекторы.
 *
 * Период набора — 30 дней; плановый фонд робот-часов = парк × 8 ч × 30 дней
 * (ТЗ v2.0 §10.3: 26 роботов → 6 240 робот-ч; контрольные 99,21 % / 99,71 %).
 * Подтверждёнными считаются интервалы со статусом CONFIRMED или ADJUSTED.
 */

const PERIOD_DAYS = 30
const SHIFT_HOURS = 8

/** Плановый фонд одного робота за период (робот-часы). */
export const PLANNED_HOURS_PER_ROBOT = SHIFT_HOURS * PERIOD_DAYS

/** Плановый фонд парка (робот-часы). */
export function plannedRobotHours(robotCount: number): number {
  return robotCount * PLANNED_HOURS_PER_ROBOT
}

function isConfirmed(d: Downtime): boolean {
  return d.confirmationStatus === 'CONFIRMED' || d.confirmationStatus === 'ADJUSTED'
}

/** Подтверждённые интервалы выбранного типа. */
export function confirmedOf(downtimes: Downtime[], type: Downtime['intervalType']): Downtime[] {
  return downtimes.filter((d) => d.intervalType === type && isConfirmed(d))
}

/** Подтверждённое операционное влияние (секунды). */
export function impactSeconds(downtimes: Downtime[]): number {
  return confirmedOf(downtimes, 'OPERATIONAL_IMPACT').reduce(
    (s, d) => s + d.accountableDurationSeconds,
    0,
  )
}

/** Подтверждённая техническая недоступность (секунды). */
export function techUnavailableSeconds(downtimes: Downtime[]): number {
  return confirmedOf(downtimes, 'TECHNICAL_UNAVAILABLE').reduce(
    (s, d) => s + d.accountableDurationSeconds,
    0,
  )
}

/** Подтверждённые потери процесса (₽): только операционное влияние. */
export function confirmedLossRubles(downtimes: Downtime[]): number {
  return confirmedOf(downtimes, 'OPERATIONAL_IMPACT').reduce((s, d) => s + d.lossRubles, 0)
}

/**
 * Техническая доступность парка (%, ТЗ §9.2):
 * 1 − технедоступность / плановые часы доступности.
 */
export function techAvailabilityPct(downtimes: Downtime[], robotCount: number): number {
  const planned = plannedRobotHours(robotCount)
  if (planned <= 0) return 100
  return Math.max(0, 100 - (techUnavailableSeconds(downtimes) / 3600 / planned) * 100)
}

/**
 * Операционная доступность мощности (%, ТЗ §9.2):
 * 1 − неподкомпенсированное влияние / плановые часы требуемой мощности.
 */
export function powerAvailabilityPct(downtimes: Downtime[], robotCount: number): number {
  const planned = plannedRobotHours(robotCount)
  if (planned <= 0) return 100
  return Math.max(0, 100 - (impactSeconds(downtimes) / 3600 / planned) * 100)
}

/**
 * Метрики одного робота: раздельно техническая доступность и операционное
 * влияние; один и тот же результат для списка и карточки (ACC-023).
 */
export interface RobotMetrics {
  plannedHours: number
  techSeconds: number
  impactSeconds: number
  lossRubles: number
  /** Техническая доступность робота, %. */
  techAvailabilityPct: number
}

export function robotMetrics(robotDowntimes: Downtime[]): RobotMetrics {
  const tech = techUnavailableSeconds(robotDowntimes)
  const impact = impactSeconds(robotDowntimes)
  return {
    plannedHours: PLANNED_HOURS_PER_ROBOT,
    techSeconds: tech,
    impactSeconds: impact,
    lossRubles: confirmedLossRubles(robotDowntimes),
    techAvailabilityPct: Math.max(0, 100 - (tech / 3600 / PLANNED_HOURS_PER_ROBOT) * 100),
  }
}
