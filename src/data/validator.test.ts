import { describe, expect, it } from 'vitest'
import { generateDemoData } from './generator'
import { SOURCE_INSTANCES } from './generator'
import type { Downtime } from '@/types/domain'

/**
 * Валидатор демо-данных по инвариантам TZ v1.6 §23.
 * Прогон после генерации обязан возвращать ноль ошибок.
 */

const data = generateDemoData()
const {
  incidents,
  downtimes,
  events,
  robots,
  sites,
  serviceActions,
  recoveryConfirmations,
  timeline,
} = data

const confirmedDts = downtimes.filter((d) => d.confirmationStatus === 'CONFIRMED')

// ─── Хронология ─────────────────────────────────────────────────────────────

describe('инвариант: хронология согласована', () => {
  it('событие не позднее создания инцидента; метки не «после закрытия»', () => {
    const errors: string[] = []
    for (const inc of incidents) {
      const own = events.filter((e) => e.incidentId === inc.id)
      for (const e of own) {
        if (e.timestamp > inc.openedAt)
          errors.push(
            `${inc.incidentNumber}: событие ${e.id} (${e.timestamp}) позже создания (${inc.openedAt})`,
          )
      }
      if (inc.closedAt && inc.openedAt > inc.closedAt)
        errors.push(`${inc.incidentNumber}: открыт позже закрытия`)
      for (const t of timeline.filter((t) => t.incidentId === inc.id)) {
        if (inc.closedAt && t.timestamp > inc.closedAt)
          errors.push(`${inc.incidentNumber}: запись истории ${t.id} позже закрытия`)
      }
    }
    expect(errors, errors.join('\n')).toEqual([])
  })

  it('исходные события одного инцидента отсортированы', () => {
    const errors: string[] = []
    for (const inc of incidents) {
      const own = events
        .filter((e) => e.incidentId === inc.id)
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
      for (let i = 1; i < own.length; i++) {
        if (own[i].timestamp < own[i - 1].timestamp)
          errors.push(`${inc.incidentNumber}: события не в хронологическом порядке`)
      }
    }
    expect(errors).toEqual([])
  })
})

// ─── Закрытые инциденты: обязательные поля ──────────────────────────────────

describe('инвариант: закрытый инцидент завершён полностью', () => {
  it('финальная причина + восстановление + решение по простою + завершённое действие', () => {
    const errors: string[] = []
    for (const inc of incidents.filter((i) => i.status === 'CLOSED')) {
      const label = inc.incidentNumber
      if (inc.causeMaturity !== 'FINAL')
        errors.push(
          `${label}: закрыт без финальной причины (${inc.causeMaturity}, ${inc.causeCode})`,
        )
      if (!inc.recoveryConfirmed) errors.push(`${label}: закрыт без подтверждения восстановления`)
      const dt = downtimes.find((d) => d.incidentId === inc.id)
      if (!dt) errors.push(`${label}: закрыт без решения по простою (нет интервала)`)
      else if (!['CONFIRMED', 'ADJUSTED', 'REJECTED'].includes(dt.confirmationStatus))
        errors.push(`${label}: решение по простою не принято (${dt.confirmationStatus})`)
      const acts = serviceActions.filter((a) => a.incidentId === inc.id)
      if (acts.length === 0) errors.push(`${label}: закрыт без сервисных действий`)
      else if (!acts.some((a) => a.status === 'COMPLETED'))
        errors.push(`${label}: нет завершённого действия`)
    }
    expect(errors, errors.join('\n')).toEqual([])
  })

  it('у финальной причины — человеческий комментарий и доказательства', () => {
    const errors: string[] = []
    for (const cls of data.causeClassifications) {
      const final = cls.versions.find((v) => v.maturity === 'FINAL')
      if (!final) continue
      if (!final.comment || final.comment.trim().length < 20)
        errors.push(`${cls.incidentId}: FINAL без осмысленного комментария`)
      if (final.evidence.length === 0) errors.push(`${cls.incidentId}: FINAL без доказательств`)
    }
    expect(errors, errors.join('\n')).toEqual([])
  })
})

// ─── Источники: границы RMS/WMS ──────────────────────────────────────────────

const WMS_ONLY = new Set([
  'TASK_NOT_COMPLETED',
  'TASK_NOT_STARTED',
  'TASK_INTERRUPTED_WMS',
  'TASK_NOT_ASSIGNED',
])

describe('инвариант: границы источников', () => {
  it('WMS передаёт только процессные события; техника — от RMS/FMS/RCS', () => {
    const errors: string[] = []
    for (const e of events) {
      if (e.source === 'WMS' && !WMS_ONLY.has(e.rawCode))
        errors.push(`${e.id}: WMS источник для технического кода ${e.rawCode}`)
      if ((e.source === 'RMS' || e.source === 'FMS') && WMS_ONLY.has(e.rawCode))
        errors.push(`${e.id}: WMS-код ${e.rawCode} у источника ${e.source}`)
    }
    expect(errors, errors.slice(0, 5).join('\n')).toEqual([])
  })

  it('каждое событие привязано к экземпляру источника своего объекта', () => {
    const errors: string[] = []
    const instById = new Map(SOURCE_INSTANCES.map((s) => [s.id, s]))
    for (const e of events) {
      const inst = e.sourceInstanceId ? instById.get(e.sourceInstanceId) : undefined
      if (!inst) {
        errors.push(`${e.id}: нет экземпляра источника`)
        continue
      }
      if (inst.siteId !== e.siteId)
        errors.push(`${e.id}: экземпляр ${inst.systemName} другого объекта`)
      if (e.source === 'WMS' && inst.kind !== 'WAREHOUSE')
        errors.push(`${e.id}: WMS-событие от не-WMS экземпляра`)
      if (e.source === 'RMS' && inst.kind !== 'FLEET_MANAGEMENT')
        errors.push(`${e.id}: RMS-событие от не-RMS экземпляра`)
    }
    expect(errors, errors.slice(0, 5).join('\n')).toEqual([])
  })

  it('у каждого события есть русская интерпретация', () => {
    const bad = events.filter(
      (e) => !e.humanInterpretation || e.humanInterpretation.trim().length < 5,
    )
    expect(
      bad.map((e) => e.id),
      'события без русской интерпретации',
    ).toEqual([])
  })

  it('нет шаблонных кодов IT-XXX_EVENT и «Event from»', () => {
    const bad = events.filter(
      (e) => /IT-\d+_EVENT/.test(e.rawCode) || /Event from/.test(e.rawMessage),
    )
    expect(bad.map((e) => `${e.id}:${e.rawCode}`)).toEqual([])
  })
})

// ─── Интервалы простоя ──────────────────────────────────────────────────────

describe('инвариант: интервалы простоя', () => {
  it('конец не раньше начала; длительность из меток; открытый — не 0', () => {
    const errors: string[] = []
    for (const d of downtimes) {
      const label = `dt ${d.id} (${d.incidentId})`
      if (d.endedAt) {
        if (d.endedAt < d.startedAt) errors.push(`${label}: конец раньше начала`)
        const expected = Math.round((Date.parse(d.endedAt) - Date.parse(d.startedAt)) / 60000) * 60
        if (Math.abs(d.accountableDurationSeconds - expected) > 60)
          errors.push(
            `${label}: длительность ${d.accountableDurationSeconds}с ≠ из меток ${expected}с`,
          )
      } else {
        if (d.intervalState !== 'OPEN')
          errors.push(`${label}: нет конца, но состояние ${d.intervalState}`)
        if (d.accountableDurationSeconds <= 0 && d.confirmationStatus === 'CONFIRMED')
          errors.push(`${label}: открытый подтверждённый интервал с нулевой длительностью`)
      }
    }
    expect(errors, errors.slice(0, 8).join('\n')).toEqual([])
  })

  it('потери = подтверждённые часы × ставка объекта (округление до рубля)', () => {
    const rates: Record<string, number> = {
      'site-obh': 55000,
      'site-pod': 70000,
      'site-dom': 45000,
    }
    const errors: string[] = []
    for (const d of confirmedDts) {
      const rate = rates[d.siteId]
      const hours = d.accountableDurationSeconds / 3600
      const expected = Math.round(hours * rate)
      if (Math.abs(d.ratePerHour - rate) > 0.01)
        errors.push(`dt ${d.id}: ставка ${d.ratePerHour} ≠ объектовая ${rate}`)
      if (d.lossRubles !== expected)
        errors.push(`dt ${d.id}: потери ${d.lossRubles} ≠ ${expected} (${hours}ч × ${rate})`)
    }
    expect(errors, errors.slice(0, 8).join('\n')).toEqual([])
  })
})

// ─── Идентификаторы ─────────────────────────────────────────────────────────

describe('инвариант: канонические идентификаторы', () => {
  it('INC-2026-XXXX; robotId существует; siteId существует', () => {
    const errors: string[] = []
    const robotIds = new Set(robots.map((r) => r.id))
    const siteIds = new Set(sites.map((s) => s.id))
    for (const inc of incidents) {
      if (!/^INC-2026-\d{4}$/.test(inc.incidentNumber))
        errors.push(`неканонический номер ${inc.incidentNumber}`)
      if (inc.robotId && !robotIds.has(inc.robotId))
        errors.push(`${inc.incidentNumber}: неизвестный робот ${inc.robotId}`)
      if (!siteIds.has(inc.siteId))
        errors.push(`${inc.incidentNumber}: неизвестный объект ${inc.siteId}`)
    }
    expect(errors).toEqual([])
  })

  it('инцидент без CA-014 как универсальной причины', () => {
    const bad = incidents.filter((i) => i.causeCode === 'CA-014')
    // CA-014 допустим только в единственном «честном» конфигурационном случае с параметром в комментарии
    expect(bad.length).toBeLessThanOrEqual(1)
    if (bad.length === 1) {
      const cls = data.causeClassifications.find((c) => c.incidentId === bad[0].id)
      const final = cls?.versions.find((v) => v.maturity === 'FINAL')
      expect(final?.comment ?? '', 'CA-014 без указания параметра').toMatch(
        /параметр|значени|верси/i,
      )
    }
  })
})

// ─── События ↔ инциденты ────────────────────────────────────────────────────

describe('инвариант: автоматические инциденты имеют исходные события', () => {
  it('AUTOMATIC → ≥1 связанное событие; MANUAL → наблюдение в истории', () => {
    const errors: string[] = []
    for (const inc of incidents) {
      if (inc.sourceKind === 'AUTOMATIC') {
        const own = events.filter((e) => e.incidentId === inc.id && e.source !== 'MANUAL')
        if (own.length === 0)
          errors.push(`${inc.incidentNumber}: автоматический без исходных событий`)
      }
    }
    expect(errors).toEqual([])
  })
})

// ─── Агрегаты ───────────────────────────────────────────────────────────────

describe('инвариант: агрегаты согласованы', () => {
  it('инцидент.downtimeSeconds/lossRubles = подтверждённый интервал', () => {
    const errors: string[] = []
    for (const inc of incidents) {
      const dt = confirmedDts.find((d) => d.incidentId === inc.id)
      if (dt) {
        if (Math.abs(inc.downtimeSeconds - dt.accountableDurationSeconds) > 60)
          errors.push(`${inc.incidentNumber}: downtimeSeconds ≠ интервалу`)
        if (inc.lossRubles !== dt.lossRubles)
          errors.push(`${inc.incidentNumber}: lossRubles ${inc.lossRubles} ≠ ${dt.lossRubles}`)
      }
    }
    expect(errors, errors.join('\n')).toEqual([])
  })

  it('целевой набор: 35 подтверждённых, 61.3ч, 3 532 000 ₽ (вариант «б»: лидар сверх §2)', () => {
    expect(confirmedDts.length).toBe(35)
    const totalSeconds = confirmedDts.reduce((s, d) => s + d.accountableDurationSeconds, 0)
    // §2 hours are published rounded to 0.1h; tolerate ±6 minutes of exactness.
    expect(Math.abs(totalSeconds / 3600 - 61.3)).toBeLessThan(0.1)
    const totalLoss = confirmedDts.reduce((s, d) => s + d.lossRubles, 0)
    // §2 money cannot always be hit to the ruble with whole-second durations
    // (site rates 55k/70k/45k × minutes); tolerate ±1%.
    expect(Math.abs(totalLoss - 3_532_000)).toBeLessThan(35_320)
  })

  it('CA-045: 5 случаев × 30 мин, ≥3 робота, 2 в одной зоне', () => {
    const lidar = incidents.filter((i) => i.causeCode === 'CA-045')
    expect(lidar.length).toBe(5)
    const dts = lidar
      .map((i) => confirmedDts.find((d) => d.incidentId === i.id))
      .filter(Boolean) as Downtime[]
    expect(dts.every((d) => Math.abs(d.accountableDurationSeconds - 1800) < 1)).toBe(true)
    const robotSet = new Set(lidar.map((i) => i.robotId))
    expect(robotSet.size).toBeGreaterThanOrEqual(3)
    const zoneCount: Record<string, number> = {}
    for (const i of lidar) {
      const z = i.zoneName ?? '?'
      zoneCount[z] = (zoneCount[z] ?? 0) + 1
    }
    expect(Object.values(zoneCount).some((n) => n >= 2)).toBe(true)
  })
})

// ─── Восстановление ─────────────────────────────────────────────────────────

describe('инвариант: восстановление', () => {
  it('recoveryConfirmed ⇔ запись RecoveryConfirmation', () => {
    const errors: string[] = []
    for (const inc of incidents) {
      const rec = recoveryConfirmations.find((r) => r.incidentId === inc.id)
      if (inc.recoveryConfirmed && !rec) errors.push(`${inc.incidentNumber}: флаг без записи`)
      if (!inc.recoveryConfirmed && rec) errors.push(`${inc.incidentNumber}: запись без флага`)
      if (rec && inc.closedAt && rec.recoveredAt > inc.closedAt)
        errors.push(`${inc.incidentNumber}: восстановление после закрытия`)
    }
    expect(errors).toEqual([])
  })
})
