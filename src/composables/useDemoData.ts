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
  DowntimeRule,
  CostRate,
  CostSnapshot,
  MaintenanceWork,
} from '@/types/domain'
import { generateDemoData } from '@/data/generator'

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
  }
}
