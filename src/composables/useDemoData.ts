import { ref, computed } from 'vue'
import type {
  Incident,
  OperationalEvent,
  Downtime,
  ServiceAction,
  RecoveryConfirmation,
  TimelineEntry,
  Robot,
  Site,
  CauseClassification,
  CauseVersion,
  DowntimeRule,
  CostRate,
  CostSnapshot,
  MaintenanceWork,
} from '@/types/domain'
import { generateDemoData, CAUSE_CATALOG } from '@/data/generator'
import {
  emptyOverlay,
  loadOverlay,
  saveOverlay,
  resetOverlay,
  type OverlayData,
} from '@/lib/persistence'

const data = generateDemoData()

const incidents = ref<Incident[]>(data.incidents)
const events = ref<OperationalEvent[]>(data.events)
const downtimes = ref<Downtime[]>(data.downtimes)
const serviceActions = ref<ServiceAction[]>(data.serviceActions)
const recoveryConfirmations = ref<RecoveryConfirmation[]>(data.recoveryConfirmations)
const timeline = ref<TimelineEntry[]>(data.timeline)
const causeClassifications = ref<CauseClassification[]>(data.causeClassifications)
const robots = ref<Robot[]>(data.robots)
const sites = ref<Site[]>(data.sites)
const downtimeRules = ref<DowntimeRule[]>(data.downtimeRules)
const costRates = ref<CostRate[]>(data.costRates)
const costSnapshots = ref<CostSnapshot[]>(data.costSnapshots)
const maintenance = ref<MaintenanceWork[]>(data.maintenance)

// ─── Persistence overlay (ТЗ-план, решение 3) ────────────────────────────────
// База воспроизводится генератором; пользовательские правки мерджатся поверх
// из IndexedDB (заменённые по id + добавленные + ручные записи истории).

const overlay = ref<OverlayData>(emptyOverlay())
const overlayReady = ref(false)

const COLLECTIONS = {
  incidents,
  downtimes,
  serviceActions,
  recoveryConfirmations,
  maintenance,
} as const

type CollectionName = keyof typeof COLLECTIONS

type WritablePartial<T> = { -readonly [K in keyof T]?: T[K] }

function mergeOverlay(base: OverlayData): void {
  for (const [name, coll] of Object.entries(COLLECTIONS) as Array<
    [CollectionName, typeof incidents]
  >) {
    const list = coll.value as Array<{ id: string }>
    const replaced = base.replaced[name] ?? {}
    const merged = list.map((item) => (replaced[item.id] as typeof item) ?? item)
    const appended = (base.appended[name] ?? []) as typeof list
    coll.value = ([...merged, ...appended] as typeof coll.value).slice()
  }
  const appendedTl = base.timelineAppend as unknown as TimelineEntry[]
  const baseIds = new Set(data.timeline.map((t) => t.id))
  timeline.value = [...data.timeline, ...appendedTl.filter((t) => !baseIds.has(t.id))].slice()
}

void loadOverlay().then((loaded) => {
  overlay.value = loaded
  mergeOverlay(loaded)
  overlayReady.value = true
})

function persist(): void {
  void saveOverlay(overlay.value)
}

function markReplaced(name: CollectionName, id: string, value: unknown): void {
  overlay.value.replaced[name] ??= {}
  overlay.value.replaced[name][id] = value as Record<string, unknown>
  persist()
}

function markAppended(name: CollectionName, value: unknown): void {
  overlay.value.appended[name] ??= []
  ;(overlay.value.appended[name] as Array<Record<string, unknown>>).push(
    value as Record<string, unknown>,
  )
  persist()
}

function appendTimeline(entry: TimelineEntry): void {
  timeline.value = [...timeline.value, entry]
  overlay.value.timelineAppend = [
    ...overlay.value.timelineAppend,
    entry as unknown as Record<string, unknown>,
  ]
  persist()
}

function newTimelineId(): string {
  return `tl-u-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

function replaceIncident(id: string, patch: WritablePartial<Incident>): Incident | null {
  const current = incidents.value.find((i) => i.id === id)
  if (!current) return null
  const next = { ...current, ...patch }
  incidents.value = incidents.value.map((i) => (i.id === id ? next : i))
  markReplaced('incidents', id, next)
  return next
}

function replaceDowntime(id: string, patch: Partial<Downtime>): Downtime | null {
  const current = downtimes.value.find((d) => d.id === id)
  if (!current) return null
  const next = { ...current, ...patch }
  downtimes.value = downtimes.value.map((d) => (d.id === id ? next : d))
  markReplaced('downtimes', id, next)
  return next
}

function replaceAction(id: string, patch: Partial<ServiceAction>): ServiceAction | null {
  const current = serviceActions.value.find((a) => a.id === id)
  if (!current) return null
  const next = { ...current, ...patch }
  serviceActions.value = serviceActions.value.map((a) => (a.id === id ? next : a))
  markReplaced('serviceActions', id, next)
  return next
}

async function resetDemo(): Promise<void> {
  await resetOverlay()
  location.reload()
}

// ─── Safe helpers ────────────────────────────────────────────────────────────

function safeNumber(v: unknown, fallback = 0): number {
  return typeof v === 'number' && !isNaN(v) ? v : fallback
}

// ─── Calculated metrics (single source of truth) ────────────────────────────

const stats = computed(() => {
  const incs = incidents.value ?? []
  const dts = downtimes.value ?? []
  const totalPeriodSeconds = 30 * 24 * 3600
  const totalDowntime = dts
    .filter((d) => d.confirmationStatus === 'CONFIRMED')
    .reduce((sum, d) => sum + safeNumber(d.accountableDurationSeconds), 0)
  const totalLoss = dts
    .filter((d) => d.confirmationStatus === 'CONFIRMED')
    .reduce((sum, d) => sum + safeNumber(d.lossRubles), 0)
  const activeIncidents = incs.filter((i) => i.status !== 'CLOSED').length
  const unclassifiedCount = incs.filter(
    (i) => i.causeMaturity === 'NONE' || i.causeCode === 'CA-060',
  ).length
  const classifiedCount = incs.length - unclassifiedCount
  const totalIncidents = incs.length
  const availability =
    totalPeriodSeconds > 0 ? 100 - (totalDowntime / totalPeriodSeconds) * 100 : 100

  const needsAttention = incs
    .filter(
      (i) =>
        i.status !== 'CLOSED' &&
        (i.causeMaturity === 'NONE' || !i.coordinatorId || (i.hasDowntime && !i.downtimeConfirmed)),
    )
    .slice(0, 5)
    .map((i) => ({
      incidentId: i.id,
      incidentNumber: i.incidentNumber,
      reason: !i.coordinatorId
        ? 'Нет координатора'
        : i.causeMaturity === 'NONE'
          ? 'Нет причины'
          : 'Простой не подтверждён',
      detail: i.description,
    }))

  const lossByCause = new Map<string, { name: string; loss: number }>()
  for (const inc of incs) {
    if (safeNumber(inc.lossRubles) > 0 && inc.causeCode) {
      const existing = lossByCause.get(inc.causeCode) ?? { name: inc.causeCode, loss: 0 }
      existing.loss += inc.lossRubles
      lossByCause.set(inc.causeCode, existing)
    }
  }
  const topProblems = [...lossByCause.values()]
    .sort((a, b) => b.loss - a.loss)
    .slice(0, 3)
    .map((p) => ({ ...p, percent: totalLoss > 0 ? (p.loss / totalLoss) * 100 : 0 }))

  return {
    availability: Math.max(0, availability),
    totalDowntimeSeconds: totalDowntime,
    totalDowntimeHours: (totalDowntime / 3600).toFixed(1),
    totalLoss,
    activeIncidents,
    unclassifiedCount,
    classifiedCount,
    totalIncidents,
    unclassifiedPercent: totalIncidents > 0 ? (unclassifiedCount / totalIncidents) * 100 : 0,
    needsAttention,
    topProblems,
  }
})

const analytics = computed(() => {
  const incs = incidents.value ?? []
  const sts = sites.value ?? []
  const s = stats.value
  const totalLoss = s.totalLoss || 1

  const lossByCause = new Map<string, { code: string; name: string; loss: number; count: number }>()
  const lossBySiteMap = new Map<string, { siteId: string; siteName: string; loss: number }>()

  for (const inc of incs) {
    if (safeNumber(inc.lossRubles) > 0) {
      const causeKey = inc.causeCode ?? 'UNDEFINED'
      const existing = lossByCause.get(causeKey) ?? {
        code: causeKey,
        name: causeKey,
        loss: 0,
        count: 0,
      }
      existing.loss += inc.lossRubles
      existing.count++
      lossByCause.set(causeKey, existing)

      const siteName = sts.find((site) => site.id === inc.siteId)?.name ?? inc.siteId
      const siteExisting = lossBySiteMap.get(inc.siteId) ?? {
        siteId: inc.siteId,
        siteName,
        loss: 0,
      }
      siteExisting.loss += inc.lossRubles
      lossBySiteMap.set(inc.siteId, siteExisting)
    }
  }

  return {
    paretoCauses: [...lossByCause.values()]
      .sort((a, b) => b.loss - a.loss)
      .slice(0, 8)
      .map((p) => ({ ...p, percent: (p.loss / totalLoss) * 100 })),
    lossBySite: [...lossBySiteMap.values()]
      .sort((a, b) => b.loss - a.loss)
      .map((p) => ({ ...p, percent: (p.loss / totalLoss) * 100 })),
    repeatProblems: [...lossByCause.values()]
      .filter((p) => p.count > 1)
      .sort((a, b) => b.count - a.count)
      .slice(0, 6),
    sla: {
      reactionMet: incs.filter((i) => i.reactionSlaMet === true).length,
      reactionViolated: incs.filter((i) => i.reactionSlaMet === false).length,
      recoveryMet: incs.filter((i) => i.recoverySlaMet === true).length,
      recoveryViolated: incs.filter((i) => i.recoverySlaMet === false).length,
    },
  }
})

// ─── Рабочий сценарий координатора (ТЗ §15/§24) ──────────────────────────────
// Каждое действие меняет данные, пишет ручную запись истории и persist'ит
// overlay. Автоматические эффекты (например, закрытие интервала при
// подтверждении восстановления) помечаются «(авто)».

export type NextActionKind =
  | 'ASSIGN'
  | 'CLASSIFY'
  | 'REFINE_CAUSE'
  | 'CONFIRM_CAUSE'
  | 'CREATE_ACTION'
  | 'COMPLETE_ACTION'
  | 'CONFIRM_RECOVERY'
  | 'DECIDE_DOWNTIME'
  | 'CLOSE'
  | 'DONE'

export interface NextStep {
  kind: NextActionKind
  label: string
  owner: string
  due?: string | null
}

function log(
  incidentId: string,
  eventType: string,
  summary: string,
  actorName: string,
  isAutomatic = false,
  details: Record<string, unknown> | null = null,
): void {
  appendTimeline({
    id: newTimelineId(),
    incidentId,
    timestamp: new Date().toISOString(),
    eventType,
    summary,
    actorName,
    isAutomatic,
    details,
  })
}

function actionsOf(id: string): ServiceAction[] {
  return serviceActions.value.filter((a) => a.incidentId === id)
}

function downtimeOf(id: string): Downtime | undefined {
  return downtimes.value.find((d) => d.incidentId === id)
}

function recomputeIncidentEconomics(incidentId: string): void {
  const inc = incidents.value.find((i) => i.id === incidentId)
  if (!inc) return
  const dt = downtimes.value.find(
    (d) =>
      d.incidentId === incidentId &&
      (d.confirmationStatus === 'CONFIRMED' || d.confirmationStatus === 'ADJUSTED'),
  )
  replaceIncident(incidentId, {
    hasDowntime: Boolean(downtimeOf(incidentId)),
    downtimeConfirmed: Boolean(dt),
    downtimeSeconds: dt?.accountableDurationSeconds ?? 0,
    lossRubles: dt?.lossRubles ?? 0,
  })
}

function assignCoordinator(incidentId: string, coordinatorName: string): void {
  const inc = incidents.value.find((i) => i.id === incidentId)
  if (!inc) return
  const patch: WritablePartial<Incident> = {
    coordinatorId: `u-${coordinatorName}`,
    coordinatorName,
  }
  if (inc.status === 'OPEN') patch.status = 'IN_PROGRESS'
  replaceIncident(incidentId, patch)
  log(incidentId, 'ASSIGNED', `Назначен координатор: ${coordinatorName}`, coordinatorName, false, {
    coordinatorName,
  })
}

function addObservation(
  incidentId: string,
  text: string,
  actorName: string,
  evidence?: string,
): void {
  log(
    incidentId,
    'OBSERVATION',
    `Наблюдение: ${text}`,
    actorName,
    false,
    evidence ? { evidence } : null,
  )
}

function classifyCause(
  incidentId: string,
  causeCode: string,
  comment: string,
  actorName: string,
  maturity: 'PRIMARY' | 'REFINED' | 'FINAL',
  evidence: string[] = [],
): void {
  const cls = causeClassifications.value.find((c) => c.incidentId === incidentId)
  const version: CauseVersion = {
    sequence: (cls?.versions.length ?? 0) + 1,
    causeCode,
    causeName: CAUSE_CATALOG[causeCode]?.name ?? causeCode,
    maturity,
    classifiedBy: actorName,
    classifiedAt: new Date().toISOString(),
    comment,
    responsibilityZone: CAUSE_CATALOG[causeCode]?.zone ?? 'UNKNOWN',
    evidence,
  }
  if (cls) {
    const next = { ...cls, versions: [...cls.versions, version], currentMaturity: maturity }
    causeClassifications.value = causeClassifications.value.map((c) =>
      c.incidentId === incidentId ? next : c,
    )
  } else {
    causeClassifications.value = [
      ...causeClassifications.value,
      { incidentId, versions: [version], currentMaturity: maturity },
    ]
  }
  replaceIncident(incidentId, { causeCode, causeMaturity: maturity })
  const maturityRu =
    maturity === 'PRIMARY'
      ? 'Предварительная причина'
      : maturity === 'REFINED'
        ? 'Причина уточнена'
        : 'Причина подтверждена'
  log(incidentId, 'CAUSE', `${maturityRu}: ${version.causeName} — ${comment}`, actorName, false, {
    causeCode,
    maturity,
  })
}

interface ServiceActionInput {
  incidentId: string
  actionTypeName: string
  description: string
  executor: string
  dueAt: string
  actorName: string
}

function createServiceAction(input: ServiceActionInput): void {
  const action: ServiceAction = {
    id: `act-u-${Date.now().toString(36)}`,
    incidentId: input.incidentId,
    actionTypeCode: 'SERVICE',
    actionTypeName: input.actionTypeName,
    description: input.description,
    status: 'CREATED',
    result: null,
    executorName: input.executor,
    createdAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    comment: null,
  }
  serviceActions.value = [...serviceActions.value, action]
  markAppended('serviceActions', action)

  // Связанная работа ТОиР (аварийная) — сервисный контур (ТЗ §19)
  const inc = incidents.value.find((i) => i.id === input.incidentId)
  if (inc) {
    const work: MaintenanceWork = {
      id: `mnt-u-${Date.now().toString(36)}`,
      type: 'EMERGENCY',
      title: input.actionTypeName,
      robotId: inc.robotId ?? robots.value[0]?.id ?? '',
      siteId: inc.siteId,
      incidentId: inc.id,
      executor: input.executor,
      dueAt: input.dueAt,
      completedAt: null,
      status: 'ASSIGNED',
      result: null,
    }
    maintenance.value = [...maintenance.value, work]
    markAppended('maintenance', work)
  }

  const patch: WritablePartial<Incident> = {}
  if (inc?.status === 'IN_PROGRESS') patch.status = 'WAITING'
  if (patch.status) replaceIncident(input.incidentId, patch)
  log(
    input.incidentId,
    'ACTION_CREATED',
    `Создано сервисное действие: ${input.actionTypeName} (исполнитель ${input.executor})`,
    input.actorName,
    false,
    { executor: input.executor, dueAt: input.dueAt },
  )
}

function completeAction(
  actionId: string,
  result: 'SUCCESS' | 'PARTIAL_SUCCESS' | 'FAILURE' | 'POSTPONED',
  comment: string,
  actorName: string,
): void {
  const action = replaceAction(actionId, {
    status: result === 'POSTPONED' ? 'IN_PROGRESS' : 'COMPLETED',
    result,
    completedAt: result === 'POSTPONED' ? null : new Date().toISOString(),
    comment,
  })
  if (!action) return
  log(
    action.incidentId,
    'ACTION_COMPLETED',
    `Действие выполнено (${result === 'SUCCESS' ? 'результат подтверждён' : result === 'PARTIAL_SUCCESS' ? 'частично' : result === 'FAILURE' ? 'без результата' : 'отложено'}): ${action.actionTypeName}. ${comment}`,
    actorName,
    false,
    { result },
  )
}

function confirmRecovery(
  incidentId: string,
  basis: 'SUCCESSFUL_ACTION' | 'NO_ACTION_EXCEPTION',
  comment: string,
  actorName: string,
): void {
  const rec: RecoveryConfirmation = {
    incidentId,
    recoveredAt: new Date().toISOString(),
    confirmedBy: actorName,
    basis,
    actionId: null,
    comment,
  }
  recoveryConfirmations.value = [...recoveryConfirmations.value, rec]
  markAppended('recoveryConfirmations', rec)
  replaceIncident(incidentId, { recoveryConfirmed: true })

  // Автоматический эффект: открытый интервал простоя закрывается моментом
  // подтверждения восстановления (ТЗ §8: техническая недоступность = первое
  // отключение → восстановление).
  const dt = downtimeOf(incidentId)
  if (dt && !dt.endedAt) {
    const endedAt = rec.recoveredAt
    const seconds = Math.max(
      60,
      Math.round((Date.parse(endedAt) - Date.parse(dt.startedAt)) / 1000),
    )
    const loss = Math.round((seconds / 3600) * dt.ratePerHour)
    replaceDowntime(dt.id, {
      endedAt,
      intervalState: 'CLOSED',
      calendarDurationSeconds: seconds,
      accountableDurationSeconds: seconds,
      lossRubles:
        dt.confirmationStatus === 'CONFIRMED' || dt.confirmationStatus === 'ADJUSTED'
          ? loss
          : dt.lossRubles,
    })
    recomputeIncidentEconomics(incidentId)
    log(
      incidentId,
      'DOWNTIME',
      `(авто) Интервал простоя закрыт моментом восстановления: ${new Date(seconds * 1000).toISOString().slice(11, 19)}`,
      'FleetOps',
      true,
    )
  }
  log(
    incidentId,
    'RECOVERY',
    `Работоспособность восстановлена (${basis === 'SUCCESSFUL_ACTION' ? 'успешное действие' : 'без действия, исключение'}). ${comment}`,
    actorName,
  )
}

function decideDowntime(
  incidentId: string,
  decision: 'CONFIRM' | 'REJECT' | 'ADJUST',
  actorName: string,
  options: { adjustedSeconds?: number; comment?: string } = {},
): void {
  const dt = downtimeOf(incidentId)
  if (!dt) return
  if (decision === 'REJECT') {
    replaceDowntime(dt.id, {
      confirmationStatus: 'REJECTED',
      confirmedBy: actorName,
      confirmedAt: new Date().toISOString(),
      accountableDurationSeconds: 0,
      lossRubles: 0,
    })
    replaceIncident(incidentId, { downtimeConfirmed: false, downtimeSeconds: 0, lossRubles: 0 })
    log(
      incidentId,
      'DOWNTIME',
      `Простой отклонён: процесс компенсирован${options.comment ? ` — ${options.comment}` : ''}`,
      actorName,
      false,
      { decision },
    )
    return
  }
  let seconds = dt.accountableDurationSeconds
  const startedAt = dt.startedAt
  let endedAt = dt.endedAt
  if (!endedAt) {
    // Подтверждение открытого интервала фиксирует конец сейчас (не 0.0 ч).
    endedAt = new Date().toISOString()
    seconds = Math.max(60, Math.round((Date.parse(endedAt) - Date.parse(startedAt)) / 1000))
  }
  if (decision === 'ADJUST' && options.adjustedSeconds && options.adjustedSeconds > 0) {
    seconds = options.adjustedSeconds
    endedAt = new Date(Date.parse(startedAt) + seconds * 1000).toISOString()
  }
  const loss = Math.round((seconds / 3600) * dt.ratePerHour)
  replaceDowntime(dt.id, {
    confirmationStatus: decision === 'ADJUST' ? 'ADJUSTED' : 'CONFIRMED',
    confirmedBy: actorName,
    confirmedAt: new Date().toISOString(),
    endedAt,
    intervalState: 'CLOSED',
    calendarDurationSeconds: seconds,
    accountableDurationSeconds: seconds,
    lossRubles: loss,
  })
  recomputeIncidentEconomics(incidentId)
  const label =
    decision === 'ADJUST'
      ? `Простой скорректирован: ${Math.round(seconds / 60)} мин`
      : `Простой подтверждён: ${(seconds / 3600).toFixed(2)} ч × ${dt.ratePerHour.toLocaleString('ru-RU')} ₽/ч = ${loss.toLocaleString('ru-RU')} ₽`
  log(
    incidentId,
    'DOWNTIME',
    `${label}${options.comment ? ` — ${options.comment}` : ''}`,
    actorName,
    false,
    { decision, seconds, loss },
  )
}

function closeIncident(incidentId: string, actorName: string): { ok: boolean; reason?: string } {
  const inc = incidents.value.find((i) => i.id === incidentId)
  if (!inc) return { ok: false, reason: 'Инцидент не найден' }
  if (inc.causeMaturity !== 'FINAL')
    return { ok: false, reason: 'Финальная причина не подтверждена' }
  if (!inc.recoveryConfirmed) return { ok: false, reason: 'Восстановление не подтверждено' }
  const dt = downtimeOf(incidentId)
  const dtDecided = !dt || ['CONFIRMED', 'ADJUSTED', 'REJECTED'].includes(dt.confirmationStatus)
  if (!dtDecided) return { ok: false, reason: 'Решение по простою не принято' }
  const acts = actionsOf(incidentId)
  if (acts.length > 0 && !acts.some((a) => a.status === 'COMPLETED')) {
    return { ok: false, reason: 'Нет завершённого сервисного действия' }
  }
  const closedAt = new Date().toISOString()
  replaceIncident(incidentId, { status: 'CLOSED', closedAt })
  log(incidentId, 'CLOSED', 'Инцидент закрыт; простой и потери зафиксированы', actorName, false, {
    closedAt,
  })
  return { ok: true }
}

function reopenIncident(incidentId: string, reason: string, actorName: string): void {
  replaceIncident(incidentId, { status: 'IN_PROGRESS', closedAt: null })
  log(incidentId, 'REOPENED', `Инцидент переоткрыт: ${reason}`, actorName, false, { reason })
}

function readyToClose(incidentId: string): boolean {
  const inc = incidents.value.find((i) => i.id === incidentId)
  if (!inc) return false
  const dt = downtimeOf(incidentId)
  const dtDecided = !dt || ['CONFIRMED', 'ADJUSTED', 'REJECTED'].includes(dt.confirmationStatus)
  const acts = actionsOf(incidentId)
  return (
    inc.causeMaturity === 'FINAL' &&
    inc.recoveryConfirmed &&
    dtDecided &&
    (acts.length === 0 || acts.some((a) => a.status === 'COMPLETED'))
  )
}

function nextStep(incidentId: string): NextStep | null {
  const inc = incidents.value.find((i) => i.id === incidentId)
  if (!inc || inc.status === 'CLOSED') return null
  const owner = inc.coordinatorName ?? ''
  if (!inc.coordinatorId)
    return { kind: 'ASSIGN', label: 'Назначить координатора', owner: 'Диспетчер' }
  if (inc.causeMaturity === 'NONE')
    return { kind: 'CLASSIFY', label: 'Указать предварительную причину', owner }
  if (inc.causeMaturity === 'PRIMARY')
    return { kind: 'REFINE_CAUSE', label: 'Уточнить причину', owner }
  if (inc.causeMaturity === 'REFINED')
    return { kind: 'CONFIRM_CAUSE', label: 'Подтвердить финальную причину', owner }
  const acts = actionsOf(incidentId)
  const active = acts.find((a) => a.status === 'CREATED' || a.status === 'IN_PROGRESS')
  if (!active && acts.length === 0)
    return { kind: 'CREATE_ACTION', label: 'Создать сервисное действие', owner }
  if (active)
    return {
      kind: 'COMPLETE_ACTION',
      label: `Завершить действие: ${active.actionTypeName}`,
      owner: active.executorName ?? owner,
      due: null,
    }
  if (!inc.recoveryConfirmed)
    return {
      kind: 'CONFIRM_RECOVERY',
      label: 'Подтвердить восстановление и контрольный запуск',
      owner,
    }
  const dt = downtimeOf(incidentId)
  if (dt && !['CONFIRMED', 'ADJUSTED', 'REJECTED'].includes(dt.confirmationStatus)) {
    return { kind: 'DECIDE_DOWNTIME', label: 'Принять решение по простою', owner }
  }
  if (inc.status !== 'READY_TO_CLOSE') {
    replaceIncident(incidentId, { status: 'READY_TO_CLOSE' })
  }
  return { kind: 'CLOSE', label: 'Закрыть инцидент', owner }
}

// ─── Ручное создание инцидента (ТЗ §15) ──────────────────────────────────────

export interface ManualIncidentInput {
  siteId: string
  zoneName: string
  robotId: string | null
  observation: string
  severity: Incident['severity']
  actorName: string
  hasDowntime?: boolean
}

function createManualIncident(input: ManualIncidentInput): Incident {
  const n = incidents.value.length + 1
  const nowIso = new Date().toISOString()
  const incident: Incident = {
    id: `inc-u-${Date.now().toString(36)}`,
    incidentNumber: `INC-${new Date().getFullYear()}-${String(n).padStart(4, '0')}`,
    title: input.observation.slice(0, 120),
    description: input.observation,
    siteId: input.siteId,
    zoneName: input.zoneName,
    robotId: input.robotId,
    incidentTypeCode: 'IT-999',
    status: 'OPEN',
    severity: input.severity,
    sourceKind: 'MANUAL',
    detectedAt: nowIso,
    openedAt: nowIso,
    closedAt: null,
    coordinatorId: null,
    coordinatorName: null,
    causeCode: null,
    causeMaturity: 'NONE',
    hasDowntime: input.hasDowntime ?? true,
    downtimeConfirmed: false,
    recoveryConfirmed: false,
    downtimeSeconds: 0,
    lossRubles: 0,
    reactionSlaSeconds: null,
    reactionSlaMet: null,
    recoverySlaSeconds: null,
    recoverySlaMet: null,
  }
  incidents.value = [...incidents.value, incident]
  markAppended('incidents', incident)

  // Ручное событие-наблюдение (первичное доказательство оператора).
  const evt: OperationalEvent = {
    id: `evt-u-${Date.now().toString(36)}`,
    timestamp: nowIso,
    receivedAt: nowIso,
    source: 'MANUAL',
    sourceInstanceId: null,
    siteId: input.siteId,
    robotId: input.robotId,
    rawCode: 'MANUAL_OBSERVATION',
    rawMessage: input.observation,
    humanInterpretation: 'Ручное наблюдение оператора',
    rawPayload: {},
    normalizedType: 'Ручная регистрация',
    incidentTypeCode: 'IT-999',
    processingStatus: 'INCIDENT_CREATED',
    incidentId: incident.id,
    ruleApplied: null,
    confidence: 1,
    isDuplicate: false,
  }
  events.value = [...events.value, evt]

  // Учётный интервал открывается вместе с инцидентом (подтверждает координатор).
  if (incident.hasDowntime) {
    const siteRate = costRates.value.find((r) => r.siteId === input.siteId)?.ratePerHour ?? 55000
    const dt: Downtime = {
      id: `dt-u-${Date.now().toString(36)}`,
      incidentId: incident.id,
      siteId: input.siteId,
      robotId: input.robotId,
      zoneName: input.zoneName,
      downtimeType: 'FULL',
      confirmationStatus: 'PROPOSED',
      confirmedBy: null,
      confirmedAt: null,
      intervalState: 'OPEN',
      kind: 'UNPLANNED_TECHNICAL',
      impactObject: 'ROBOT',
      impact: { backupRobotId: null, compensation: 'NONE', adjustmentBasis: null },
      startedAt: nowIso,
      endedAt: null,
      calendarDurationSeconds: 0,
      accountableDurationSeconds: 0,
      ruleCode: 'RULE_SYS_CALENDAR_24X7',
      ruleName: 'Календарь 24×7',
      fallbackApplied: true,
      ratePerHour: siteRate,
      lossRubles: 0,
    }
    downtimes.value = [...downtimes.value, dt]
    markAppended('downtimes', dt)
  }

  log(
    incident.id,
    'CREATED',
    `Инцидент зарегистрирован вручную: ${input.observation.slice(0, 80)}`,
    input.actorName,
    false,
    { sourceKind: 'MANUAL', severity: input.severity },
  )
  return incident
}

export function useDemoData() {
  return {
    incidents,
    events,
    downtimes,
    serviceActions,
    recoveryConfirmations,
    timeline,
    causeClassifications,
    robots,
    sites,
    downtimeRules,
    costRates,
    costSnapshots,
    maintenance,
    stats,
    analytics,
    // рабочий сценарий
    overlayReady,
    assignCoordinator,
    addObservation,
    classifyCause,
    createServiceAction,
    completeAction,
    confirmRecovery,
    decideDowntime,
    closeIncident,
    reopenIncident,
    readyToClose,
    nextStep,
    createManualIncident,
    resetDemo,
  }
}
