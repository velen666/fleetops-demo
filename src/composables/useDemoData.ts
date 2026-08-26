import { ref, computed } from 'vue'
import type {
  Incident,
  OperationalEvent,
  Downtime,
  ServiceAction,
  RecoveryConfirmation,
  TimelineEntry,
  Robot,
  RobotStateEntry,
  Site,
  SiteZone,
  Substitution,
  CauseClassification,
  CauseVersion,
  DowntimeRule,
  CostRate,
  CostSnapshot,
  MaintenanceWork,
} from '@/types/domain'
import { generateDemoData, CAUSE_CATALOG } from '@/data/generator'
import { techAvailabilityPct } from '@/data/metrics'
import {
  emptyOverlay,
  loadOverlay,
  saveOverlay,
  resetOverlay,
  type OverlayData,
} from '@/lib/persistence'
import { useAuthStore } from '@/stores/auth'

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
const zones = ref<SiteZone[]>(data.zones)
const robotStates = ref<RobotStateEntry[]>(data.robotStates)
const substitutions = ref<Substitution[]>(data.substitutions)
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
  robots,
  substitutions,
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

// База генерируется от «сегодня» (daysAgo(0)); ключ сутки, когда она собрана.
function baseDateKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
}

void loadOverlay().then((loaded) => {
  const anchor = baseDateKey()
  if (loaded.baseDate === anchor) {
    overlay.value = loaded
    mergeOverlay(loaded)
  } else {
    // Overlay суточной давности (или без метки) содержит абсолютные метки
    // прошлой сессии: сценарные смещения перестают давать контрольные
    // 25 мин / 29 167 ₽ (Отчёт приёмки §12 — одинаковый результат каждого
    // прогона). Сбрасываем к эталонному набору и перезаписываем якорь.
    overlay.value = { ...emptyOverlay(), baseDate: anchor }
    void saveOverlay(overlay.value)
  }
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

// ─── Permission-гарды мутаций (Отчёт приёмки ACC-006) ───────────────────────
// Право проверяется в сторе, а не только в UI: роль без права не может
// изменить операционные данные (финансовая и директорская роли — read-only).

interface GuardResult {
  ok: boolean
  reason?: string
}

function guard(perm: string): GuardResult {
  const auth = useAuthStore()
  if (!auth.isAuthenticated) return { ok: false, reason: 'Требуется вход в систему' }
  if (!auth.can(perm)) return { ok: false, reason: 'Недостаточно прав для этого действия' }
  return { ok: true }
}

// ─── Сценарное демо-время (Отчёт приёмки ACC-004) ───────────────────────────
// Живой сценарий детерминирован: действия пишут сценарные метки, привязанные
// к моменту обнаружения инцидента (ТЗ v2.0 §6: 09:12 → 09:37 → 17:40), а не к
// wall-clock. Одинаковая последовательность действий даёт одинаковые
// длительности и деньги (25 мин / 29 167 ₽; 8 ч 28 мин).

/** Начальный шаг презентации: «начальник склада смотрит на объект» (мин). */
const SCENARIO_PRESENTATION_MIN = 12

/** Сценарные смещения действий от момента обнаружения (минуты, ТЗ §6). */
const SCENARIO_STEPS_MIN: Record<string, number> = {
  ASSIGN: 3, // 09:15 координатор принят
  SUBSTITUTE: 10, // 09:22 резерв выбран
  ENGAGE: 25, // 09:37 ввод резерва — контрольные 25 мин влияния
  CLASSIFY: 53, // 10:05 причина по диагностике
  ACTION_DONE: 493, // 17:25 ремонт и контрольный запуск завершены
  RECOVERY: 494, // подтверждение восстановления
  RETURN: 508, // 17:40 возврат в парк — контрольные 8 ч 28 мин
  CLOSE: 510,
}

function incidentById(id: string): Incident | undefined {
  return incidents.value.find((i) => i.id === id)
}

/** Все известные сценарные метки инцидента (сущности + история). */
function scenarioMarks(incidentId: string): string[] {
  const inc = incidentById(incidentId)
  if (!inc) return []
  const marks: string[] = [inc.detectedAt]
  for (const t of timeline.value) {
    if (t.incidentId === incidentId && t.timestamp) marks.push(t.timestamp)
  }
  for (const d of downtimes.value) {
    if (d.incidentId !== incidentId) continue
    marks.push(d.startedAt)
    if (d.endedAt) marks.push(d.endedAt)
    if (d.confirmedAt) marks.push(d.confirmedAt)
  }
  const sub = substitutionOf(incidentId)
  if (sub) {
    marks.push(sub.requestedAt)
    if (sub.assignedAt) marks.push(sub.assignedAt)
    if (sub.engagedAt) marks.push(sub.engagedAt)
    if (sub.processRestoredAt) marks.push(sub.processRestoredAt)
  }
  for (const w of maintenance.value) {
    if (w.incidentId !== incidentId) continue
    if (w.startedAt) marks.push(w.startedAt)
    if (w.completedAt) marks.push(w.completedAt)
    if (w.returnedToParkAt) marks.push(w.returnedToParkAt)
  }
  return marks
}

/** Текущее сценарное время инцидента: максимум известных меток. */
function clockNow(incidentId: string): string {
  const inc = incidentById(incidentId)
  if (!inc) return new Date().toISOString()
  const base = Date.parse(inc.detectedAt) + SCENARIO_PRESENTATION_MIN * 60_000
  let max = base
  for (const m of scenarioMarks(incidentId)) {
    const t = Date.parse(m)
    if (!isNaN(t) && t > max) max = t
  }
  return new Date(max).toISOString()
}

/**
 * Сценарная метка для действия: максимум из текущего сценарного времени и
 * scripted-смещения действия (для engage/return — от начала интервала).
 */
function scenarioAt(incidentId: string, step?: keyof typeof SCENARIO_STEPS_MIN): string {
  const inc = incidentById(incidentId)
  const candidates = [Date.parse(clockNow(incidentId))]
  if (inc && step !== undefined) {
    candidates.push(Date.parse(inc.detectedAt) + SCENARIO_STEPS_MIN[step] * 60_000)
  }
  return new Date(Math.max(...candidates)).toISOString()
}

// ─── Calculated metrics (single source of truth) ────────────────────────────

const stats = computed(() => {
  const incs = incidents.value ?? []
  const dts = downtimes.value ?? []
  // Только операционное влияние формирует потери процесса (ТЗ v2.0 §9.2);
  // техническая недоступность идёт в доступность актива, не в деньги.
  const impact = dts.filter(
    (d) => d.intervalType === 'OPERATIONAL_IMPACT' && d.confirmationStatus === 'CONFIRMED',
  )
  const totalDowntime = impact.reduce((sum, d) => sum + safeNumber(d.accountableDurationSeconds), 0)
  const totalLoss = impact.reduce((sum, d) => sum + safeNumber(d.lossRubles), 0)
  const activeIncidents = incs.filter((i) => i.status !== 'CLOSED').length
  const unclassifiedCount = incs.filter(
    (i) => i.causeMaturity === 'NONE' || i.causeCode === 'CA-060',
  ).length
  const classifiedCount = incs.length - unclassifiedCount
  const totalIncidents = incs.length
  // Техническая доступность парка — единая формула metrics.ts (ACC-023):
  // 1 − технедоступность / плановые часы (парк × 8 ч × 30 дней).
  const fleetCount = robots.value?.length ?? 0
  const availability = techAvailabilityPct(dts, fleetCount)

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
  | 'SUBSTITUTE'
  | 'ENGAGE'
  | 'CLASSIFY'
  | 'REFINE_CAUSE'
  | 'CONFIRM_CAUSE'
  | 'CREATE_ACTION'
  | 'COMPLETE_ACTION'
  | 'CONFIRM_RECOVERY'
  | 'RETURN_ROBOT'
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
  atIso?: string,
): void {
  appendTimeline({
    id: newTimelineId(),
    incidentId,
    timestamp: atIso ?? clockNow(incidentId),
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

function assignCoordinator(incidentId: string, coordinatorName: string): GuardResult {
  const g = guard('incidents.assign')
  if (!g.ok) return g
  const inc = incidents.value.find((i) => i.id === incidentId)
  if (!inc) return { ok: false, reason: 'Инцидент не найден' }
  const at = scenarioAt(incidentId, 'ASSIGN')
  const patch: WritablePartial<Incident> = {
    coordinatorId: `u-${coordinatorName}`,
    coordinatorName,
    // Регламент безопасности — часть принятия инцидента (Отчёт §10.7):
    // отдельной кнопки нет, фиксация автоматом.
    safetyConfirmedAt: inc.safetyConfirmedAt ?? at,
  }
  if (inc.status === 'OPEN') patch.status = 'IN_PROGRESS'
  replaceIncident(incidentId, patch)
  log(
    incidentId,
    'ASSIGNED',
    `Назначен координатор: ${coordinatorName}`,
    coordinatorName,
    false,
    {
      coordinatorName,
    },
    at,
  )
  if (inc.safetyConfirmedAt == null) {
    log(
      incidentId,
      'SAFETY',
      '(авто) Регламент безопасности выполнен: зона ограждена, робот выведен с критического пути',
      'FleetOps',
      true,
      null,
      at,
    )
  }
  return { ok: true }
}

function addObservation(
  incidentId: string,
  text: string,
  actorName: string,
  evidence?: string,
): GuardResult {
  const g = guard('events.create')
  if (!g.ok) return g
  log(
    incidentId,
    'OBSERVATION',
    `Наблюдение: ${text}`,
    actorName,
    false,
    evidence ? { evidence } : null,
  )
  return { ok: true }
}

function classifyCause(
  incidentId: string,
  causeCode: string,
  comment: string,
  actorName: string,
  maturity: 'PRIMARY' | 'REFINED' | 'FINAL',
  evidence: string[] = [],
): GuardResult {
  const perm =
    maturity === 'PRIMARY'
      ? 'causes.classify'
      : maturity === 'REFINED'
        ? 'causes.refine'
        : 'causes.confirm'
  const g = guard(perm)
  if (!g.ok) return g
  const at = scenarioAt(incidentId, 'CLASSIFY')
  const cls = causeClassifications.value.find((c) => c.incidentId === incidentId)
  const version: CauseVersion = {
    sequence: (cls?.versions.length ?? 0) + 1,
    causeCode,
    causeName: CAUSE_CATALOG[causeCode]?.name ?? causeCode,
    maturity,
    classifiedBy: actorName,
    classifiedAt: at,
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
  log(
    incidentId,
    'CAUSE',
    `${maturityRu}: ${version.causeName} — ${comment}`,
    actorName,
    false,
    {
      causeCode,
      maturity,
    },
    at,
  )
  return { ok: true }
}

interface ServiceActionInput {
  incidentId: string
  actionTypeName: string
  description: string
  executor: string
  dueAt: string
  actorName: string
}

function createServiceAction(input: ServiceActionInput): GuardResult {
  const g = guard('actions.create')
  if (!g.ok) return g
  const at = scenarioAt(input.incidentId, 'CLASSIFY')
  const action: ServiceAction = {
    id: `act-u-${Date.now().toString(36)}`,
    incidentId: input.incidentId,
    actionTypeCode: 'SERVICE',
    actionTypeName: input.actionTypeName,
    description: input.description,
    status: 'CREATED',
    result: null,
    executorName: input.executor,
    createdAt: at,
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
      problem: inc.title,
      robotId: inc.robotId ?? robots.value[0]?.id ?? '',
      siteId: inc.siteId,
      incidentId: inc.id,
      executor: input.executor,
      dueAt: input.dueAt,
      startedAt: at,
      completedAt: null,
      status: 'ASSIGNED',
      result: null,
      testRunPassed: null,
      returnedToParkAt: null,
      laborCost: 0,
      partsCost: 0,
      externalCost: 0,
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
    at,
  )
  return { ok: true }
}

function completeAction(
  actionId: string,
  result: 'SUCCESS' | 'PARTIAL_SUCCESS' | 'FAILURE' | 'POSTPONED',
  comment: string,
  actorName: string,
): GuardResult {
  const g = guard('actions.complete')
  if (!g.ok) return g
  const found = serviceActions.value.find((a) => a.id === actionId)
  if (!found) return { ok: false, reason: 'Действие не найдено' }
  const at = scenarioAt(found.incidentId, 'ACTION_DONE')
  const action = replaceAction(actionId, {
    status: result === 'POSTPONED' ? 'IN_PROGRESS' : 'COMPLETED',
    result,
    completedAt: result === 'POSTPONED' ? null : at,
    comment,
  })
  if (!action) return { ok: false, reason: 'Действие не найдено' }
  // Авто-эффект: успешный результат действия завершает связанную аварийную
  // работу ТОиР с положительным контрольным запуском (вертикальный путь ТЗ §6
  // шаг 8; гейт возврата ACC-001 опирается на testRunPassed работы).
  if (result === 'SUCCESS' || result === 'PARTIAL_SUCCESS') {
    const work = maintenance.value.find(
      (m) =>
        m.incidentId === action.incidentId &&
        m.title === action.actionTypeName &&
        !['DONE', 'RESULT_CONFIRMED', 'CANCELLED'].includes(m.status),
    )
    if (work) {
      replaceMaintenance(work.id, {
        status: 'DONE',
        result: result === 'SUCCESS' ? 'Успешно' : 'Частично',
        testRunPassed: true,
        completedAt: at,
      })
      replaceRobot(work.robotId, { fleetState: 'TEST_RUN' })
    }
  }
  log(
    action.incidentId,
    'ACTION_COMPLETED',
    `Действие выполнено (${result === 'SUCCESS' ? 'результат подтверждён' : result === 'PARTIAL_SUCCESS' ? 'частично' : result === 'FAILURE' ? 'без результата' : 'отложено'}): ${action.actionTypeName}. ${comment}`,
    actorName,
    false,
    { result },
    at,
  )
  return { ok: true }
}

function confirmRecovery(
  incidentId: string,
  basis: 'SUCCESSFUL_ACTION' | 'NO_ACTION_EXCEPTION',
  comment: string,
  actorName: string,
): GuardResult {
  const g = guard('actions.recovery.confirm')
  if (!g.ok) return g
  const at = scenarioAt(incidentId, 'RECOVERY')
  const rec: RecoveryConfirmation = {
    incidentId,
    recoveredAt: at,
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
    const endedAt = at
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
      `(авто) Простой закрыт моментом восстановления: ${new Date(seconds * 1000).toISOString().slice(11, 19)}`,
      'FleetOps',
      true,
      null,
      endedAt,
    )
  }
  log(
    incidentId,
    'RECOVERY',
    `Работоспособность восстановлена (${basis === 'SUCCESSFUL_ACTION' ? 'успешное действие' : 'без действия, исключение'}). ${comment}`,
    actorName,
    false,
    null,
    at,
  )
  return { ok: true }
}

function decideDowntime(
  incidentId: string,
  decision: 'CONFIRM' | 'REJECT' | 'ADJUST',
  actorName: string,
  options: { adjustedSeconds?: number; comment?: string } = {},
): GuardResult {
  const g = guard('downtime.confirm')
  if (!g.ok) return g
  const dt = downtimeOf(incidentId)
  if (!dt) return { ok: false, reason: 'Простой не найден' }
  const nowIso = clockNow(incidentId)
  if (decision === 'REJECT') {
    replaceDowntime(dt.id, {
      confirmationStatus: 'REJECTED',
      confirmedBy: actorName,
      confirmedAt: nowIso,
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
      nowIso,
    )
    return { ok: true }
  }
  let seconds = dt.accountableDurationSeconds
  const startedAt = dt.startedAt
  let endedAt = dt.endedAt
  if (!endedAt) {
    // Подтверждение открытого интервала фиксирует конец по сценарию (не 0.0 ч).
    endedAt = nowIso
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
    confirmedAt: nowIso,
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
    nowIso,
  )
  return { ok: true }
}

// ─── Замещение и две контрольные точки (ТЗ v2.0 §5.3/§6) ──────────────────
// Отдельное действие «Обеспечить безопасность» убрано (Отчёт §10.7/ACC-029):
// регламент безопасности фиксируется автоматически при назначении координатора
// (см. assignCoordinator) и остаётся условием закрытия инцидента.

function availableBackups(siteId: string): Robot[] {
  return robots.value.filter((r) => r.siteId === siteId && r.fleetState === 'RESERVE')
}

function substitutionOf(incidentId: string): Substitution | undefined {
  return substitutions.value.find((s) => s.incidentId === incidentId)
}

function impactOf(incidentId: string): Downtime | undefined {
  return downtimes.value.find(
    (d) => d.incidentId === incidentId && d.intervalType === 'OPERATIONAL_IMPACT',
  )
}

function techOf(incidentId: string): Downtime | undefined {
  return downtimes.value.find(
    (d) => d.incidentId === incidentId && d.intervalType === 'TECHNICAL_UNAVAILABLE',
  )
}

function replaceRobot(id: string, patch: Partial<Robot>): void {
  const next = { ...robots.value.find((r) => r.id === id)!, ...patch } as Robot
  robots.value = robots.value.map((r) => (r.id === id ? next : r))
  markReplaced('robots', id, next)
}

/** Назначить резерв (ТЗ §6 шаг 5): фиксирует решение, не команды движения. */
function assignSubstitution(
  incidentId: string,
  backupRobotId: string,
  actorName: string,
): GuardResult {
  const g = guard('substitutions.create')
  if (!g.ok) return g
  const inc = incidents.value.find((i) => i.id === incidentId)
  if (!inc) return { ok: false, reason: 'Инцидент не найден' }
  if (substitutionOf(incidentId)) return { ok: false, reason: 'Замещение уже назначено' }
  const backup = robots.value.find((r) => r.id === backupRobotId)
  if (!backup) return { ok: false, reason: 'Резервный робот не найден' }
  if (backup.siteId !== inc.siteId) return { ok: false, reason: 'Резерв другого объекта' }
  if (backup.fleetState !== 'RESERVE') return { ok: false, reason: 'Робот не находится в резерве' }
  const damaged = robots.value.find((r) => r.id === inc.robotId)
  if (!damaged) return { ok: false, reason: 'Повреждённый робот не найден' }
  const zone = zones.value.find((z) => z.siteId === inc.siteId && inc.zoneName?.startsWith(z.code))
  const at = scenarioAt(incidentId, 'SUBSTITUTE')
  const sub: Substitution = {
    id: `sub-u-${Date.now().toString(36)}`,
    incidentId,
    siteId: inc.siteId,
    zoneId: zone?.id ?? '',
    damagedRobotId: damaged.id,
    backupRobotId: backup.id,
    originalTask: inc.description.match(/M-\d+/)?.[0] ?? 'текущее задание',
    newTask: 'продолжение задания резервом',
    requestedAt: at,
    assignedAt: at,
    engagedAt: null,
    processRestoredAt: null,
    confirmedBy: null,
    authorName: actorName,
  }
  substitutions.value = [...substitutions.value, sub]
  markAppended('substitutions', sub)
  // Повреждённый — в вывод/диагностику; резерв следует в зону (состояния §5.2).
  replaceRobot(damaged.id, { fleetState: 'DIAGNOSTICS', status: 'MAINTENANCE', zoneId: null })
  replaceRobot(backup.id, { fleetState: 'ASSIGNED_REPLACE', zoneId: zone?.id ?? backup.zoneId })
  log(
    incidentId,
    'SUBSTITUTION',
    `Резерв ${backup.name} назначен в зону ${zone?.code ?? inc.zoneName}; ${damaged.name} выведен с критического пути`,
    actorName,
    false,
    { backupRobotId, damagedRobotId: damaged.id },
    at,
  )
  return { ok: true }
}

/**
 * Ввод резерва = контрольная точка «Процесс восстановлен» (ТЗ §6 шаг 6):
 * закрывает операционное влияние (начисление потерь прекращается).
 * Сценарная метка 09:37 даёт контрольные 25 мин / 29 167 ₽ (ACC-004).
 */
function engageBackup(incidentId: string, actorName: string): GuardResult {
  const g = guard('substitutions.confirm')
  if (!g.ok) return g
  const inc = incidents.value.find((i) => i.id === incidentId)
  const sub = substitutionOf(incidentId)
  if (!inc || !sub) return { ok: false, reason: 'Замещение не назначено' }
  if (sub.engagedAt) return { ok: false, reason: 'Резерв уже введён' }
  const nowIso = scenarioAt(incidentId, 'ENGAGE')
  const next: Substitution = {
    ...sub,
    engagedAt: nowIso,
    processRestoredAt: nowIso,
    confirmedBy: actorName,
  }
  substitutions.value = substitutions.value.map((s) => (s.id === sub.id ? next : s))
  markReplaced('substitutions', sub.id, next)
  replaceRobot(sub.backupRobotId, { fleetState: 'WORKING' })
  // Операционное влияние закрывается на момент ввода резерва.
  const impact = impactOf(incidentId)
  if (impact && impact.intervalState === 'OPEN') {
    const seconds = Math.max(
      60,
      Math.round((Date.parse(nowIso) - Date.parse(impact.startedAt)) / 1000),
    )
    const loss = Math.round((seconds / 3600) * impact.ratePerHour)
    replaceDowntime(impact.id, {
      confirmationStatus: 'CONFIRMED',
      confirmedBy: actorName,
      confirmedAt: nowIso,
      endedAt: nowIso,
      intervalState: 'CLOSED',
      calendarDurationSeconds: seconds,
      accountableDurationSeconds: seconds,
      lossRubles: loss,
      impact: {
        backupRobotId: sub.backupRobotId,
        compensation: 'BACKUP_ROBOT',
        adjustmentBasis: 'Мощность зоны восстановлена резервом',
      },
    })
    recomputeIncidentEconomics(incidentId)
    log(
      incidentId,
      'SUBSTITUTION',
      `Резерв принял задание; мощность зоны восстановлена. Операционное влияние: ${Math.round(seconds / 60)} мин × ${impact.ratePerHour.toLocaleString('ru-RU')} ₽/ч = ${loss.toLocaleString('ru-RU')} ₽`,
      'WMS',
      true,
      { engagedAt: nowIso },
      nowIso,
    )
  }
  log(
    incidentId,
    'SUBSTITUTION',
    'Контрольная точка «Процесс восстановлен» подтверждена',
    actorName,
    false,
    null,
    nowIso,
  )
  return { ok: true }
}

/**
 * Гейт возврата робота в парк (ACC-001): разрешён только после финальной
 * причины, подтверждённого восстановления и завершённого сервиса с
 * положительным контрольным запуском. Единая проверка для карточки
 * инцидента, ТОиР и очередей (ACC-002).
 */
function returnGate(incidentId: string): { ok: boolean; unmet: string[] } {
  const inc = incidents.value.find((i) => i.id === incidentId)
  if (!inc) return { ok: false, unmet: ['Инцидент не найден'] }
  const unmet: string[] = []
  const state = incidentProcessState(incidentId)
  if (!state.processRestored) unmet.push('Процесс не восстановлен (резерв не введён)')
  if (inc.causeMaturity !== 'FINAL') unmet.push('Финальная причина не подтверждена')
  if (!inc.recoveryConfirmed) unmet.push('Восстановление не подтверждено')
  const works = maintenance.value.filter((m) => m.incidentId === incidentId)
  const finished = works.some(
    (m) => m.testRunPassed === true && (m.status === 'DONE' || m.status === 'RESULT_CONFIRMED'),
  )
  if (!finished) unmet.push('Ремонт не завершён или контрольный запуск не пройден')
  return { ok: unmet.length === 0, unmet }
}

/**
 * Контрольная точка «Робот возвращён в парк» (ТЗ §6 шаг 9): закрывает
 * техническую недоступность, возвращает резерв в пул. Сценарная метка 17:40
 * даёт контрольные 8 ч 28 мин технической недоступности.
 */
function returnRobotToPark(incidentId: string, actorName: string): GuardResult {
  const g = guard('incidents.recover')
  if (!g.ok) return g
  const inc = incidents.value.find((i) => i.id === incidentId)
  if (!inc || !inc.robotId) return { ok: false, reason: 'Инцидент не найден' }
  const gate = returnGate(incidentId)
  if (!gate.ok) return { ok: false, reason: gate.unmet.join('; ') }
  const tech = techOf(incidentId)
  if (tech && tech.intervalState === 'CLOSED')
    return { ok: false, reason: 'Робот уже возвращён в парк' }
  const nowIso = scenarioAt(incidentId, 'RETURN')
  if (tech) {
    const seconds = Math.max(
      60,
      Math.round((Date.parse(nowIso) - Date.parse(tech.startedAt)) / 1000),
    )
    replaceDowntime(tech.id, {
      confirmationStatus: 'CONFIRMED',
      confirmedBy: actorName,
      confirmedAt: nowIso,
      endedAt: nowIso,
      intervalState: 'CLOSED',
      calendarDurationSeconds: seconds,
      accountableDurationSeconds: seconds,
    })
  }
  const robot = robots.value.find((r) => r.id === inc.robotId)
  if (robot) {
    const homeZone =
      zones.value.find((z) => z.siteId === robot.siteId && robot.zoneName?.startsWith(z.code))
        ?.id ?? robot.zoneId
    replaceRobot(robot.id, { fleetState: 'WORKING', status: 'ACTIVE', zoneId: homeZone })
  }
  const sub = substitutionOf(incidentId)
  if (sub) {
    const backup = robots.value.find((r) => r.id === sub.backupRobotId)
    if (backup && backup.fleetState === 'WORKING')
      replaceRobot(sub.backupRobotId, { fleetState: 'RESERVE', zoneId: null })
  }
  log(
    incidentId,
    'RECOVERY',
    `Контрольная точка «Робот возвращён в парк»: ${robot?.name ?? 'робот'} прошёл ремонт и контрольный запуск; техническая недоступность закрыта`,
    actorName,
    false,
    null,
    nowIso,
  )
  return { ok: true }
}

/** Состояние «Процесс восстановлен, сервис продолжается» (ТЗ §5.3). */
function incidentProcessState(incidentId: string): {
  processRestored: boolean
  robotReturned: boolean
  label: string
} {
  const inc = incidents.value.find((i) => i.id === incidentId)
  if (!inc) return { processRestored: false, robotReturned: false, label: '—' }
  const sub = substitutionOf(incidentId)
  const impact = impactOf(incidentId)
  const tech = techOf(incidentId)
  const processRestored =
    sub?.processRestoredAt != null || (impact?.intervalState ?? 'CLOSED') === 'CLOSED'
  const robotReturned = !tech || tech.intervalState === 'CLOSED'
  let label = 'Процесс не восстановлен'
  if (processRestored && !robotReturned && inc.status !== 'CLOSED')
    label = 'Процесс восстановлен, сервис продолжается'
  else if (processRestored && robotReturned) label = 'Процесс восстановлен, робот в парке'
  else if (inc.status === 'CLOSED') label = 'Закрыт'
  return { processRestored, robotReturned, label }
}

// ─── Сервисный бэклог: завершение ремонта и возврат робота (ТЗ §8.6) ──────

function replaceMaintenance(id: string, patch: Partial<MaintenanceWork>): void {
  const next = { ...maintenance.value.find((m) => m.id === id)!, ...patch } as MaintenanceWork
  maintenance.value = maintenance.value.map((m) => (m.id === id ? next : m))
  markReplaced('maintenance', id, next)
}

/**
 * Завершить ремонт с контрольным запуском (ТЗ §6 шаг 8): работа выполнена,
 * стоимость подтверждена (труд + запчасти + услуги). Возврат в парк —
 * отдельная контрольная точка.
 */
function completeMaintenance(
  workId: string,
  input: {
    result: string
    testRunPassed: boolean
    laborCost?: number
    partsCost?: number
    externalCost?: number
  },
  actorName: string,
): GuardResult {
  const g = guard('maintenance.complete')
  if (!g.ok) return g
  const work = maintenance.value.find((m) => m.id === workId)
  if (!work) return { ok: false, reason: 'Работа не найдена' }
  if (work.status === 'RESULT_CONFIRMED' || work.status === 'DONE')
    return { ok: false, reason: 'Работа уже завершена' }
  const nowIso = scenarioAt(work.incidentId ?? '', 'ACTION_DONE')
  replaceMaintenance(workId, {
    status: 'DONE',
    result: input.result,
    testRunPassed: input.testRunPassed,
    completedAt: nowIso,
    laborCost: input.laborCost ?? work.laborCost,
    partsCost: input.partsCost ?? work.partsCost,
    externalCost: input.externalCost ?? work.externalCost,
  })
  // Робот проходит контрольный запуск (состояние §5.2).
  replaceRobot(work.robotId, { fleetState: input.testRunPassed ? 'TEST_RUN' : 'IN_REPAIR' })
  if (work.incidentId)
    log(
      work.incidentId,
      'ACTION_COMPLETED',
      `Ремонт выполнен: ${work.title}. Контрольный запуск ${input.testRunPassed ? 'пройден' : 'не пройден'}`,
      actorName,
      false,
      { workId },
      nowIso,
    )
  return { ok: true }
}

/**
 * Возврат робота в парк из бэклога (ТЗ §8.6): закрывает техническую
 * недоступность связанного инцидента, освобождает резерв, обновляет обзор.
 * Гейт ACC-001: только после завершённого ремонта и пройденного контрольного
 * запуска.
 */
function returnRobotFromBacklog(workId: string, actorName: string): GuardResult {
  const g = guard('maintenance.return')
  if (!g.ok) return g
  const work = maintenance.value.find((m) => m.id === workId)
  if (!work) return { ok: false, reason: 'Работа не найдена' }
  if (work.returnedToParkAt) return { ok: false, reason: 'Робот уже возвращён' }
  if (work.status !== 'DONE' && work.status !== 'RESULT_CONFIRMED')
    return { ok: false, reason: 'Завершите ремонт с контрольным запуском' }
  if (work.testRunPassed !== true)
    return { ok: false, reason: 'Контрольный запуск не пройден — повторите запуск' }
  const nowIso = scenarioAt(work.incidentId ?? '', 'RETURN')
  replaceMaintenance(workId, {
    status: 'RESULT_CONFIRMED',
    returnedToParkAt: nowIso,
    testRunPassed: work.testRunPassed ?? true,
  })
  // Контрольная точка 2: закрыть технедоступность связанного инцидента
  // (включая освобождение резерва и смену состояний).
  if (work.incidentId) returnRobotToPark(work.incidentId, actorName)
  else {
    const robot = robots.value.find((r) => r.id === work.robotId)
    if (robot)
      replaceRobot(robot.id, { fleetState: 'WORKING', status: 'ACTIVE', zoneId: robot.zoneId })
  }
  if (work.incidentId)
    log(
      work.incidentId,
      'RECOVERY',
      `${robots.value.find((r) => r.id === work.robotId)?.name ?? 'Робот'} возвращён в парк; техническая недоступность закрыта`,
      actorName,
      false,
      { workId },
      nowIso,
    )
  return { ok: true }
}

function closeIncident(incidentId: string, actorName: string): GuardResult {
  const g = guard('incidents.close')
  if (!g.ok) return g
  const inc = incidents.value.find((i) => i.id === incidentId)
  if (!inc) return { ok: false, reason: 'Инцидент не найден' }
  // Машина состояний (G2): закрытое нельзя закрыть повторно.
  if (inc.status === 'CLOSED') return { ok: false, reason: 'Инцидент уже закрыт' }
  if (!inc.safetyConfirmedAt) return { ok: false, reason: 'Безопасность зоны не подтверждена' }
  if (inc.causeMaturity !== 'FINAL')
    return { ok: false, reason: 'Финальная причина не подтверждена' }
  if (!inc.recoveryConfirmed) return { ok: false, reason: 'Восстановление не подтверждено' }
  // Раздельные подтверждения (ТЗ §8.4): обе контрольные точки обязательны.
  const state = incidentProcessState(incidentId)
  if (!state.processRestored) return { ok: false, reason: 'Процесс не восстановлен' }
  if (!state.robotReturned) return { ok: false, reason: 'Робот не возвращён в парк' }
  const dt = downtimeOf(incidentId)
  const dtDecided = !dt || ['CONFIRMED', 'ADJUSTED', 'REJECTED'].includes(dt.confirmationStatus)
  if (!dtDecided) return { ok: false, reason: 'Решение по простою не принято' }
  const acts = actionsOf(incidentId)
  if (acts.length > 0 && !acts.some((a) => a.status === 'COMPLETED')) {
    return { ok: false, reason: 'Нет завершённого сервисного действия' }
  }
  const closedAt = scenarioAt(incidentId, 'CLOSE')
  replaceIncident(incidentId, { status: 'CLOSED', closedAt })
  log(
    incidentId,
    'CLOSED',
    'Инцидент закрыт; простой и потери зафиксированы',
    actorName,
    false,
    {
      closedAt,
    },
    closedAt,
  )
  return { ok: true }
}

function reopenIncident(incidentId: string, reason: string, actorName: string): GuardResult {
  const g = guard('incidents.state.manage')
  if (!g.ok) return g
  const inc = incidents.value.find((i) => i.id === incidentId)
  if (!inc) return { ok: false, reason: 'Инцидент не найден' }
  // Машина состояний (G2): переоткрыть можно только закрытый.
  if (inc.status !== 'CLOSED') return { ok: false, reason: 'Инцидент не закрыт' }
  const at = clockNow(incidentId)
  replaceIncident(incidentId, { status: 'IN_PROGRESS', closedAt: null })
  log(incidentId, 'REOPENED', `Инцидент переоткрыт: ${reason}`, actorName, false, { reason }, at)
  return { ok: true }
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
  // Вертикальный путь (ТЗ v2.0 §6): резерв → ввод → причина → сервис → возврат.
  // Безопасность фиксируется автоматически при назначении координатора.
  const sub = substitutionOf(incidentId)
  const tech = techOf(incidentId)
  const techOpen = tech?.intervalState === 'OPEN'
  if (techOpen && !sub && availableBackups(inc.siteId).length > 0)
    return { kind: 'SUBSTITUTE', label: 'Назначить резервный робот', owner }
  if (sub && !sub.engagedAt) {
    const backupName =
      robots.value.find((r) => r.id === sub.backupRobotId)?.name ?? sub.backupRobotId
    return {
      kind: 'ENGAGE',
      label: `Подтвердить ввод резерва ${backupName}`,
      owner,
    }
  }
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
  // Возврат робота в парк — до закрытия (ТЗ §5.3).
  if (techOpen) return { kind: 'RETURN_ROBOT', label: 'Вернуть робота в парк', owner }
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
  const g = guard('incidents.create')
  if (!g.ok) throw new Error(g.reason ?? 'Недостаточно прав')
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
    safetyConfirmedAt: null,
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
      intervalType: 'OPERATIONAL_IMPACT',
      downtimeType: 'FULL',
      confirmationStatus: 'PROPOSED',
      confirmedBy: null,
      confirmedAt: null,
      intervalState: 'OPEN',
      kind: 'UNPLANNED_TECHNICAL',
      impactObject: 'ZONE',
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
    zones,
    robotStates,
    substitutions,
    downtimeRules,
    costRates,
    costSnapshots,
    maintenance,
    stats,
    analytics,
    // рабочий сценарий
    overlayReady,
    incidentClock: clockNow,
    assignCoordinator,
    assignSubstitution,
    engageBackup,
    returnRobotToPark,
    returnGate,
    incidentProcessState,
    availableBackups,
    completeMaintenance,
    returnRobotFromBacklog,
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
