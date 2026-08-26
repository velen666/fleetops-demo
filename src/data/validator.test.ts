import { describe, expect, it } from 'vitest'
import { CAUSE_CATALOG, CONTROL_TOTALS, ZONES, generateDemoData } from './generator'
import type { Downtime } from '@/types/domain'

// ─── Валидатор набора данных ТЗ v2.0 §10.4 (план §7.1) ────────────────────
// Единое правило экономики: точные минуты × ставка, округление до рубля
// на интервал. Задокументированные отклонения от таблиц ТЗ (внутренне
// несогласованных): столкновение 265 417 (ТЗ 265 419, −2), Подольск 344 168
// (ТЗ 344 169, −1), Домодедово 192 499 (ТЗ 192 500, −1), итог 986 667
// (ТЗ 986 669, −2). Обухово и остальные группы — точно.

const data = generateDemoData()
const rateOf = (siteId: string) => data.sites.find((s) => s.id === siteId)!.ratePerHour

function impactIntervals(): Downtime[] {
  return data.downtimes.filter((d) => d.intervalType === 'OPERATIONAL_IMPACT')
}
function techIntervals(): Downtime[] {
  return data.downtimes.filter((d) => d.intervalType === 'TECHNICAL_UNAVAILABLE')
}
function confirmedImpact(): Downtime[] {
  return impactIntervals().filter(
    (d) => d.confirmationStatus === 'CONFIRMED' && d.accountableDurationSeconds > 0,
  )
}

describe('DMO-01 · Парк, объекты, зоны (§10.1/§10.2)', () => {
  it('ровно 72 уникальных робота, 3 объекта, 9 зон (ACC-024: флагман 30)', () => {
    expect(data.robots.length).toBe(CONTROL_TOTALS.robots)
    expect(new Set(data.robots.map((r) => r.id)).size).toBe(CONTROL_TOTALS.robots)
    expect(data.sites.length).toBe(CONTROL_TOTALS.sites)
    expect(data.zones.length).toBe(CONTROL_TOTALS.zones)
    expect(data.robots.filter((r) => r.siteId === 'site-pod').length).toBe(30)
    expect(data.robots.filter((r) => r.siteId === 'site-obh').length).toBe(24)
    expect(data.robots.filter((r) => r.siteId === 'site-dom').length).toBe(18)
  })

  it('робот принадлежит одному объекту и не более чем одной текущей зоне', () => {
    for (const r of data.robots) {
      expect(data.sites.some((s) => s.id === r.siteId)).toBe(true)
      if (r.zoneId) {
        const z = data.zones.find((x) => x.id === r.zoneId)
        expect(z).toBeDefined()
        expect(z!.siteId).toBe(r.siteId)
      }
    }
  })

  it('стартовые состояния парка: 49 работают / 7 резерв / 8 зарядка / 7 сервис / 1 авария', () => {
    const by = (s: string) => data.robots.filter((r) => r.fleetState === s).length
    expect(by('WORKING')).toBe(49)
    expect(by('RESERVE')).toBe(7)
    expect(by('CHARGING')).toBe(8)
    expect(by('IN_REPAIR') + by('AWAITING_REPAIR') + by('DIAGNOSTICS') + by('TEST_RUN')).toBe(7)
    expect(by('EMERGENCY_STOP')).toBe(1)
    // Одна единица — одно состояние: сумма всех состояний = 72 (ACC-024).
    const total = data.robots.length
    expect(total).toBe(72)
  })

  it('мощность зон: C-12 6/5 (дефицит из-за аварии), остальные по нормативу', () => {
    const actual = (zid: string) =>
      data.robots.filter((r) => r.fleetState === 'WORKING' && r.zoneId === zid).length
    const expectZone = (code: string, site: string, req: number, act: number) => {
      const z = ZONES.find((x) => x.code === code && x.siteId === site)!
      expect(z.requiredCapacity).toBe(req)
      expect(actual(z.id)).toBe(act)
    }
    expectZone('A-3', 'site-pod', 7, 7)
    expectZone('B-2', 'site-pod', 7, 7)
    expectZone('C-12', 'site-pod', 6, 5)
    expectZone('A-1', 'site-obh', 6, 6)
    expectZone('B-4', 'site-obh', 6, 6)
    expectZone('C-7', 'site-obh', 6, 6)
    expectZone('A-2', 'site-dom', 4, 4)
    expectZone('B-6', 'site-dom', 4, 4)
    expectZone('C-3', 'site-dom', 4, 4)
  })

  it('резерв не назначен в две зоны; свободный резерв Подольска = 3 на старте (ACC-024)', () => {
    const subsByBackup = new Map<string, number>()
    for (const s of data.substitutions) {
      subsByBackup.set(s.backupRobotId, (subsByBackup.get(s.backupRobotId) ?? 0) + 1)
    }
    for (const [robotId, n] of subsByBackup) {
      const robot = data.robots.find((r) => r.id === robotId)
      // Исторические замещения завершены — резерв снова свободен.
      if (robot && robot.fleetState === 'RESERVE') expect(n).toBeLessThan(2)
    }
    const podReserve = data.robots.filter(
      (r) => r.siteId === 'site-pod' && r.fleetState === 'RESERVE',
    )
    expect(podReserve.map((r) => r.name).sort()).toEqual(['FMR-012', 'FMR-031', 'FMR-032'])
  })
})

describe('DMO-01 · Инциденты: идентификаторы и состав (§10.3)', () => {
  it('ровно 33 канонических уникальных INC-2026-XXXX', () => {
    expect(data.incidents.length).toBe(CONTROL_TOTALS.incidents)
    const nums = data.incidents.map((i) => i.incidentNumber)
    expect(new Set(nums).size).toBe(33)
    for (const n of nums) expect(n).toMatch(/^INC-2026-\d{4}$/)
  })

  it('состав по группам причин: 6/7/5/4/3/3/3/2', () => {
    const count = (code: string) =>
      data.incidents.filter((i) => i.causeMaturity !== 'NONE' && i.causeCode === code).length
    // 6 столкновений: 5 подтверждённых + живой рабочий (без причины)
    const collisions = data.incidents.filter(
      (i) => i.causeCode === 'CA-041' || (i.status === 'OPEN' && i.robotId === 'fmr-1'),
    ).length
    expect(collisions).toBe(6)
    expect(count('CA-044')).toBe(7)
    expect(count('CA-045')).toBe(5)
    expect(count('CA-022')).toBe(4)
    expect(count('CA-023')).toBe(3)
    expect(count('CA-011')).toBe(3)
    expect(count('CA-047')).toBe(3)
    expect(count('CA-062')).toBe(2)
  })

  it('закрытый инцидент: причина, комментарий человека, действие с результатом, интервалы, подтверждения', () => {
    for (const inc of data.incidents.filter((i) => i.status === 'CLOSED')) {
      expect(inc.causeCode, inc.incidentNumber).toBeTruthy()
      expect(inc.causeMaturity).toBe('FINAL')
      expect(inc.coordinatorName, inc.incidentNumber).toBeTruthy()
      const cause = data.causeClassifications.find((c) => c.incidentId === inc.id)
      expect(cause?.currentMaturity).toBe('FINAL')
      const finalVersion = cause?.versions.at(-1)
      expect(finalVersion?.comment, inc.incidentNumber).toBeTruthy()
      expect(finalVersion!.comment!.length).toBeGreaterThanOrEqual(20)
      const acts = data.serviceActions.filter((a) => a.incidentId === inc.id)
      expect(acts.length, inc.incidentNumber).toBeGreaterThan(0)
      expect(acts.every((a) => a.result !== null)).toBe(true)
      expect(inc.recoveryConfirmed).toBe(true)
      const impact = impactIntervals().find((d) => d.incidentId === inc.id)
      if (impact) {
        expect(impact.confirmationStatus).toBe('CONFIRMED')
        expect(impact.intervalState).toBe('CLOSED')
      }
      const tech = techIntervals().find((d) => d.incidentId === inc.id)
      if (tech) expect(tech.intervalState).toBe('CLOSED')
    }
  })

  it('автоматический инцидент имеет исходные события; события связаны с инцидентом', () => {
    for (const inc of data.incidents) {
      const evts = data.events.filter((e) => e.incidentId === inc.id)
      expect(evts.length, inc.incidentNumber).toBeGreaterThanOrEqual(2)
      for (const e of evts) {
        expect(e.siteId).toBe(inc.siteId)
        if (e.robotId) expect(e.robotId).toBe(inc.robotId)
      }
    }
  })

  it('стартовый срез: 5 активных, 6 требуют разбора, 9 роботов в бэклоге', () => {
    const active = data.incidents.filter(
      (i) => i.status !== 'CLOSED' && i.status !== 'READY_TO_CLOSE',
    )
    expect(active.length).toBe(CONTROL_TOTALS.startActiveIncidents)
    const requireAnalysis = data.incidents.filter((i) => i.status !== 'CLOSED')
    expect(requireAnalysis.length).toBe(CONTROL_TOTALS.startRequireAnalysis)
    const backlogRobots = new Set(
      data.maintenance
        .filter(
          (m) => m.status !== 'RESULT_CONFIRMED' && m.status !== 'DONE' && m.status !== 'CANCELLED',
        )
        .map((m) => m.robotId),
    )
    expect(backlogRobots.size).toBe(CONTROL_TOTALS.startBacklogRobots)
  })
})

describe('DMO-01 · Источники и хронология (§10.4)', () => {
  it('WMS передаёт только процессные факты; технические сигналы — от RMS/FMS', () => {
    for (const e of data.events) {
      if (e.source === 'WMS') {
        expect(
          [
            'TASK_NOT_COMPLETED',
            'TASK_NOT_STARTED',
            'TASK_NOT_ASSIGNED',
            'DATA_MISMATCH',
            'SYNC_TIMEOUT',
          ],
          e.rawCode,
        ).toContain(e.rawCode)
      } else if (e.source === 'RMS' || e.source === 'FMS') {
        expect(e.rawCode).not.toMatch(/^TASK_(NOT_)?(COMPLETED|STARTED|ASSIGNED)$/)
      }
    }
  })

  it('хронология инцидента неубывающая; конец ≥ начала; длительность из меток', () => {
    for (const inc of data.incidents) {
      const tl = data.timeline
        .filter((t) => t.incidentId === inc.id)
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
      expect(tl.length, inc.incidentNumber).toBeGreaterThan(0)
      for (let k = 1; k < tl.length; k++)
        expect(tl[k].timestamp >= tl[k - 1].timestamp, `${inc.incidentNumber} tl ${k}`).toBe(true)
      expect(inc.openedAt >= inc.detectedAt, inc.incidentNumber).toBe(true)
      if (inc.closedAt) expect(inc.closedAt >= inc.openedAt).toBe(true)
    }
    for (const d of data.downtimes) {
      if (d.endedAt) {
        expect(d.endedAt >= d.startedAt, d.id).toBe(true)
        const computed = Math.round((Date.parse(d.endedAt) - Date.parse(d.startedAt)) / 60000)
        expect(computed * 60, d.id).toBe(d.accountableDurationSeconds)
      } else {
        expect(d.intervalState, d.id).toBe('OPEN')
      }
    }
  })

  it('единая история: автоматические записи помечены, ручные содержат автора', () => {
    for (const t of data.timeline) {
      if (t.eventType === 'CREATED' || t.eventType === 'EVENT' || t.eventType === 'SCENARIO') {
        expect(typeof t.isAutomatic).toBe('boolean')
      }
      expect(t.actorName.length).toBeGreaterThan(0)
    }
    const auto = data.timeline.filter((t) => t.isAutomatic)
    expect(auto.length).toBeGreaterThan(0)
  })
})

describe('DMO-01 · Экономика: два интервала и контрольные суммы (§9.2/§10.3)', () => {
  it('потери = подтверждённые минуты влияния × ставка объекта, округление на интервал', () => {
    for (const d of confirmedImpact()) {
      const minutes = d.accountableDurationSeconds / 60
      expect(Number.isInteger(minutes), d.id).toBe(true)
      expect(d.ratePerHour).toBe(rateOf(d.siteId))
      expect(d.lossRubles, d.id).toBe(Math.round((minutes / 60) * rateOf(d.siteId)))
    }
    // Техническая недоступность не начисляется как потеря процесса.
    for (const d of techIntervals()) expect(d.lossRubles).toBe(0)
    // Неподтверждённые интервалы не входят в потери.
    const unconfirmed = impactIntervals().filter((d) => d.confirmationStatus !== 'CONFIRMED')
    for (const d of unconfirmed) expect(d.lossRubles).toBe(0)
  })

  it('итог: 1075 минут / 986 667 ₽ (ТЗ 986 669: −2, задокументировано)', () => {
    const minutes = confirmedImpact().reduce((s, d) => s + d.accountableDurationSeconds, 0) / 60
    const loss = confirmedImpact().reduce((s, d) => s + d.lossRubles, 0)
    expect(minutes).toBe(CONTROL_TOTALS.confirmedImpactMinutes)
    expect(Math.abs(loss - 986669)).toBeLessThanOrEqual(2)
    expect(loss).toBe(986667)
  })

  it('разрез по объектам сходится: Подольск 295 мин, Обухово 450, Домодедово 330', () => {
    const by = (site: string) => confirmedImpact().filter((d) => d.siteId === site)
    const mins = (site: string) =>
      by(site).reduce((s, d) => s + d.accountableDurationSeconds, 0) / 60
    const loss = (site: string) => by(site).reduce((s, d) => s + d.lossRubles, 0)
    expect(mins('site-pod')).toBe(295)
    expect(mins('site-obh')).toBe(450)
    expect(mins('site-dom')).toBe(330)
    // Подольск 344 168 (ТЗ 344 169, −1); Обухово точно; Домодедово 192 499 (ТЗ 192 500, −1).
    expect(Math.abs(loss('site-pod') - 344169)).toBeLessThanOrEqual(1)
    expect(loss('site-obh')).toBe(450000)
    expect(Math.abs(loss('site-dom') - 192500)).toBeLessThanOrEqual(1)
    // Сумма объектов = итогу (один и тот же набор интервалов).
    expect(loss('site-pod') + loss('site-obh') + loss('site-dom')).toBe(986667)
  })

  it('разрез по причинам: все группы точно, столкновение −2 ₽ (недостижимо в целых минутах)', () => {
    const groupLoss = (code: string) =>
      confirmedImpact()
        .filter((d) => {
          const inc = data.incidents.find((i) => i.id === d.incidentId)!
          return inc.causeCode === code
        })
        .reduce((s, d) => s + d.lossRubles, 0)
    expect(groupLoss('CA-044')).toBe(207500)
    expect(groupLoss('CA-045')).toBe(147500)
    expect(groupLoss('CA-022')).toBe(103750)
    expect(groupLoss('CA-023')).toBe(82500)
    expect(groupLoss('CA-011')).toBe(65000)
    expect(groupLoss('CA-047')).toBe(82500)
    expect(groupLoss('CA-062')).toBe(32500)
    expect(Math.abs(groupLoss('CA-041') - 265419)).toBe(2)
    expect(groupLoss('CA-041')).toBe(265417)
  })

  it('техническая недоступность: 49 ч 30 мин закрытых (24 / 18,5 / 7 по объектам)', () => {
    const closedTech = techIntervals().filter((d) => d.intervalState === 'CLOSED')
    const mins = (site: string) =>
      closedTech
        .filter((d) => d.siteId === site)
        .reduce((s, d) => s + d.accountableDurationSeconds, 0) / 60
    expect(mins('site-pod')).toBe(1440)
    expect(mins('site-obh')).toBe(1110)
    expect(mins('site-dom')).toBe(420)
    expect(mins('site-pod') + mins('site-obh') + mins('site-dom')).toBe(2970)
  })

  it('показатели: техдоступность 99,71 %, операционная доступность мощности 99,90 % (к 17 280 робот-ч)', () => {
    const planned = CONTROL_TOTALS.plannedRobotHours
    const techDownH = 2970 / 60
    const impactH = 1075 / 60
    const techAvail = (1 - techDownH / planned) * 100
    const opAvail = (1 - impactH / planned) * 100
    expect(Math.round(techAvail * 100) / 100).toBe(CONTROL_TOTALS.technicalAvailabilityPct)
    expect(Math.round(opAvail * 100) / 100).toBe(CONTROL_TOTALS.operationalAvailabilityPct)
  })
})

describe('DMO-01 · Основной случай INC-2026-0001 и живой режим (§6)', () => {
  const ref = data.incidents[0]

  it('эталонный кейс: 25 минут, 29 167 ₽, техническая недоступность 8 ч 28 мин', () => {
    expect(ref.incidentNumber).toBe('INC-2026-0001')
    expect(ref.status).toBe('CLOSED')
    const impact = confirmedImpact().find((d) => d.incidentId === ref.id)!
    expect(impact.accountableDurationSeconds / 60).toBe(25)
    expect(impact.lossRubles).toBe(29167)
    const tech = techIntervals().find((d) => d.incidentId === ref.id)!
    expect(tech.accountableDurationSeconds / 60).toBe(508)
    expect(tech.intervalState).toBe('CLOSED')
  })

  it('окончание влияния = ввод резерва; после ввода потери процесса не начисляются', () => {
    const sub = data.substitutions.find((s) => s.incidentId === ref.id)!
    expect(sub.backupRobotId).toBe('fmr-12')
    expect(sub.damagedRobotId).toBe('fmr-1')
    const impact = confirmedImpact().find((d) => d.incidentId === ref.id)!
    expect(impact.endedAt).toBe(sub.engagedAt)
    expect(impact.endedAt).toBe(sub.processRestoredAt)
    // Техническая недоступность продолжалась после восстановления процесса.
    const tech = techIntervals().find((d) => d.incidentId === ref.id)!
    expect(Date.parse(tech.endedAt!)).toBeGreaterThan(Date.parse(impact.endedAt!))
  })

  it('живой рабочий INC-2026-0033: открыт, без причины, влияние не в контрольных суммах', () => {
    const live = data.incidents.at(-1)!
    expect(live.incidentNumber).toBe('INC-2026-0033')
    expect(live.status).toBe('OPEN')
    expect(live.causeCode).toBeNull()
    const liveImpact = impactIntervals().find((d) => d.incidentId === live.id)!
    expect(liveImpact.confirmationStatus).toBe('PROPOSED')
    expect(liveImpact.intervalState).toBe('OPEN')
    expect(liveImpact.lossRubles).toBe(0)
    // Робот в аварийном состоянии, зона C-12 в дефиците.
    const fmr1 = data.robots.find((r) => r.id === 'fmr-1')!
    expect(fmr1.fleetState).toBe('EMERGENCY_STOP')
  })

  it('замещения ссылаются на существующие роботы того же объекта', () => {
    for (const s of data.substitutions) {
      const damaged = data.robots.find((r) => r.id === s.damagedRobotId)
      const backup = data.robots.find((r) => r.id === s.backupRobotId)
      expect(damaged).toBeDefined()
      expect(backup).toBeDefined()
      expect(damaged!.siteId).toBe(s.siteId)
      expect(backup!.siteId).toBe(s.siteId)
      const inc = data.incidents.find((i) => i.id === s.incidentId)
      expect(inc).toBeDefined()
      if (s.processRestoredAt && s.engagedAt) expect(s.processRestoredAt >= s.engagedAt).toBe(true)
    }
  })
})

describe('DMO-01 · Регресс v1.6 (инварианты генератора)', () => {
  it('CA-014 не используется как универсальная причина', () => {
    for (const inc of data.incidents) expect(inc.causeCode).not.toBe('CA-014')
  })

  it('все коды причин известны каталогу', () => {
    for (const inc of data.incidents)
      if (inc.causeCode) expect(CAUSE_CATALOG[inc.causeCode], inc.causeCode).toBeDefined()
  })

  it('генератор детерминирован по контрольным суммам', () => {
    const again = generateDemoData()
    const loss = (d: ReturnType<typeof generateDemoData>) =>
      d.downtimes
        .filter(
          (x) => x.intervalType === 'OPERATIONAL_IMPACT' && x.confirmationStatus === 'CONFIRMED',
        )
        .reduce((s, x) => s + x.lossRubles, 0)
    expect(loss(again)).toBe(loss(data))
    expect(again.incidents.length).toBe(data.incidents.length)
    expect(again.robots.length).toBe(data.robots.length)
  })

  it('зона инцидента — каноническое имя зоны объекта', () => {
    for (const inc of data.incidents) {
      const z = data.zones.find((x) => x.siteId === inc.siteId && inc.zoneName?.startsWith(x.code))
      expect(z, `${inc.incidentNumber} → ${inc.zoneName}`).toBeDefined()
    }
  })
})
