<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDemoData } from '@/composables/useDemoData'
import {
  plannedRobotHours as plannedRobotHoursOf,
  powerAvailabilityPct,
  techAvailabilityPct,
} from '@/data/metrics'
import { useTenantScope } from '@/composables/useTenantScope'
import type { Incident } from '@/types/domain'
import { causeLabel } from '@/data/generator'
import { CAUSE_CATALOG } from '@/data/generator'
import { RESPONSIBILITY_ZONE_RU } from '@/data/labels'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import ChartCard from '@/components/ChartCard.vue'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Download } from 'lucide-vue-next'
import { downloadCsv } from '@/lib/csv'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const { incidents, downtimes, sites, robots, maintenance } = useDemoData()
const route = useRoute()
const router = useRouter()

// ─── 32.1 Общие фильтры раздела (один набор для всех блоков; в URL) ─────────

function strParam(v: unknown, fallback: string): string {
  return typeof v === 'string' && v.length > 0 ? v : fallback
}

const filterSite = ref(strParam(route.query.site, 'all'))
const filterCause = ref(strParam(route.query.cause, 'all'))
const filterZone = ref(strParam(route.query.zone, 'all'))
const filterRobot = ref(strParam(route.query.robot, 'all'))
// стартовое представление (32.1): объект / роботопарк / экономика
const view = ref<'site' | 'fleet' | 'econ'>(strParam(route.query.view, 'site') as 'site')

watch([filterSite, filterCause, filterZone, filterRobot, view], ([site, cause, zone, robot, v]) => {
  void router.replace({
    query: {
      ...(site !== 'all' ? { site } : {}),
      ...(cause !== 'all' ? { cause } : {}),
      ...(zone !== 'all' ? { zone } : {}),
      ...(robot !== 'all' ? { robot } : {}),
      view: v,
    },
  })
})

const causeOptions = computed(() => {
  const codes = new Set(
    incidents.value.map((i) => i.causeCode).filter((c): c is string => Boolean(c)),
  )
  return [...codes].sort()
})

// Tenant-модель (§3): аналитика только разрешённых объектов.
const scope = useTenantScope()
const scopedIncidents = scope.incidents(incidents.value)
const scopedSites = scope.sites(sites.value)
const scopedRobots = scope.robots(robots.value)
const scopedMaintenance = scope.maintenance(maintenance.value)

const robotOptions = computed(() =>
  scopedRobots.value.filter((r) => filterSite.value === 'all' || r.siteId === filterSite.value),
)

/** Выборка инцидентов по общим фильтрам. */
const selection = computed<Incident[]>(() =>
  scopedIncidents.value.filter((i) => {
    if (filterSite.value !== 'all' && i.siteId !== filterSite.value) return false
    if (filterCause.value !== 'all' && i.causeCode !== filterCause.value) return false
    if (filterZone.value !== 'all' && i.zoneName !== filterZone.value) return false
    if (filterRobot.value !== 'all' && i.robotId !== filterRobot.value) return false
    return true
  }),
)

/** Подтверждённые интервалы, принадлежащие выборке. */
const selectionDowntimes = computed(() => {
  const ids = new Set(selection.value.map((i) => i.id))
  return downtimes.value.filter(
    (d) =>
      ids.has(d.incidentId) &&
      (d.confirmationStatus === 'CONFIRMED' || d.confirmationStatus === 'ADJUSTED'),
  )
})

/** Подтверждённое операционное влияние (потери процесса, ТЗ v2.0 §9.2). */
const selectionImpact = computed(() =>
  selectionDowntimes.value.filter((d) => d.intervalType === 'OPERATIONAL_IMPACT'),
)

/** Подтверждённая техническая недоступность (доступность актива). */
const selectionTech = computed(() =>
  selectionDowntimes.value.filter((d) => d.intervalType === 'TECHNICAL_UNAVAILABLE'),
)

function siteName(id: string): string {
  return sites.value.find((s) => s.id === id)?.name ?? id
}
function robotName(id: string | null): string {
  if (!id) return '—'
  return robots.value.find((r) => r.id === id)?.name ?? id
}

// ─── 32.2 Верхняя сводка (ТЗ v2.0 §9.2: раздельные метрики) ────────────────

const kpis = computed(() => {
  const sel = selection.value
  const impact = selectionImpact.value
  const tech = selectionTech.value
  const impactSec = impact.reduce((s, d) => s + d.accountableDurationSeconds, 0)
  const techSec = tech.reduce((s, d) => s + d.accountableDurationSeconds, 0)
  const loss = impact.reduce((s, d) => s + d.lossRubles, 0)
  const active = sel.filter((i) => i.status !== 'CLOSED').length
  const withFinal = sel.filter((i) => i.causeMaturity === 'FINAL').length
  const unfinished = sel.filter((i) => i.status !== 'CLOSED' && i.causeMaturity !== 'FINAL').length
  // Плановый фонд робот-часов: смена 8 ч × 30 дней × парк (ТЗ §10.3: 6 240 при 26 роботах).
  const fleet =
    filterSite.value !== 'all'
      ? scopedRobots.value.filter((r) => r.siteId === filterSite.value).length
      : scopedRobots.value.length
  const plannedRobotHours = plannedRobotHoursOf(fleet)
  // Техническая доступность = 1 − технедоступность / плановые часы (metrics.ts).
  const techAvailability = techAvailabilityPct(selectionDowntimes.value, fleet)
  // Операционная доступность мощности = 1 − влияние / плановые часы (metrics.ts).
  const powerAvailability = powerAvailabilityPct(selectionDowntimes.value, fleet)
  // Стоимость ремонта: труд + запчасти + услуги по завершённым работам (§9.2).
  const doneWorks = scopedMaintenance.value.filter(
    (m) =>
      (m.status === 'DONE' || m.status === 'RESULT_CONFIRMED') &&
      (filterSite.value === 'all' || m.siteId === filterSite.value),
  )
  const repairCost = doneWorks.reduce((s, m) => s + m.laborCost + m.partsCost + m.externalCost, 0)
  const backlogWorks = scopedMaintenance.value.filter(
    (m) =>
      !['DONE', 'RESULT_CONFIRMED', 'CANCELLED'].includes(m.status) &&
      (filterSite.value === 'all' || m.siteId === filterSite.value),
  )
  const backlogRobots = new Set(backlogWorks.map((m) => m.robotId)).size
  // Резерв ниже норматива (риск устойчивости, не потеря — §9.2).
  const reserveBelow = scopedSites.value
    .filter((s) => filterSite.value === 'all' || s.id === filterSite.value)
    .filter(
      (s) =>
        robots.value.filter((r) => r.siteId === s.id && r.fleetState === 'RESERVE').length <
        s.reserveNorm,
    )
    .map((s) => s.name)
  return {
    incidentsCount: sel.length,
    impactHours: impactSec / 3600,
    techHours: techSec / 3600,
    confirmedLoss: loss,
    activeIncidents: active,
    finalCauseShare: sel.length > 0 ? (withFinal / sel.length) * 100 : 0,
    unfinishedReviews: unfinished,
    techAvailability,
    powerAvailability,
    fleet,
    plannedRobotHours,
    impactIntervals: impact.length,
    techIntervals: tech.length,
    repairCost,
    repairWorks: doneWorks.length,
    backlogWorks: backlogWorks.length,
    backlogRobots,
    reserveBelow,
  }
})

// ─── 32.3 Потери по причинам (тултип из одной записи; детализация по клику) ─

interface CauseRow {
  code: string
  name: string
  count: number
  hours: number
  loss: number
  share: number
  robots: number
  sitesCount: number
  zonesCount: number
}

const causeRows = computed<CauseRow[]>(() => {
  const dts = selectionImpact.value
  const total = dts.reduce((s, d) => s + d.lossRubles, 0)
  const byCause = new Map<string, CauseRow>()
  for (const d of dts) {
    const inc = selection.value.find((i) => i.id === d.incidentId)
    const code = inc?.causeCode ?? 'CA-060'
    const row = byCause.get(code) ?? {
      code,
      name: causeLabel(code),
      count: 0,
      hours: 0,
      loss: 0,
      share: 0,
      robots: 0,
      sitesCount: 0,
      zonesCount: 0,
    }
    row.count++
    row.hours += d.accountableDurationSeconds / 3600
    row.loss += d.lossRubles
    byCause.set(code, row)
  }
  // Уникальные сущности — из того же набора строк, что и таблица детализации
  // (ACC-011): шапка и строки считаются из одного источника.
  for (const row of byCause.values()) {
    const incs = selection.value.filter((i) => (i.causeCode ?? 'CA-060') === row.code)
    row.robots = new Set(incs.map((i) => i.robotId)).size
    row.sitesCount = new Set(incs.map((i) => i.siteId)).size
    row.zonesCount = new Set(incs.map((i) => i.zoneName).filter(Boolean)).size
  }
  const rows = [...byCause.values()].sort((a, b) => b.loss - a.loss)
  for (const r of rows) r.share = total > 0 ? (r.loss / total) * 100 : 0
  return rows
})

const causeChartLabels = computed(() =>
  causeRows.value.map((r) => r.name.split(' · ')[1] ?? r.name),
)
const causeChartData = computed(() => causeRows.value.map((r) => r.loss))

// ─── 32.4 Разделение: потери по объектам / по зонам ответственности ──────────

const siteLossRows = computed(() =>
  scopedSites.value
    .map((s) => {
      const dts = selectionImpact.value.filter((d) => d.siteId === s.id)
      const loss = dts.reduce((s2, d) => s2 + d.lossRubles, 0)
      const zones = new Set(
        selection.value.filter((i) => i.siteId === s.id && i.zoneName).map((i) => i.zoneName),
      )
      return {
        siteId: s.id,
        name: s.name,
        loss,
        hours: dts.reduce((s2, d) => s2 + d.accountableDurationSeconds, 0) / 3600,
        zones: zones.size,
      }
    })
    .filter((r) => r.loss > 0)
    .sort((a, b) => b.loss - a.loss),
)

const zoneColors: Record<string, string> = {
  OPERATIONS: '#ff6b6b',
  IT: '#00a0e9',
  SERVICE: '#fcd34d',
  INFRASTRUCTURE: '#10b981',
  UNKNOWN: '#64748b',
}

const zoneLossRows = computed(() => {
  const byZone = new Map<string, { zone: string; loss: number; causes: Set<string> }>()
  for (const d of selectionImpact.value) {
    const inc = selection.value.find((i) => i.id === d.incidentId)
    const zone = inc?.causeCode ? (CAUSE_CATALOG[inc.causeCode]?.zone ?? 'UNKNOWN') : 'UNKNOWN'
    const row = byZone.get(zone) ?? { zone, loss: 0, causes: new Set<string>() }
    row.loss += d.lossRubles
    if (inc?.causeCode) row.causes.add(inc.causeCode)
    byZone.set(zone, row)
  }
  return [...byZone.values()].sort((a, b) => b.loss - a.loss)
})

const siteChartLabels = computed(() => siteLossRows.value.map((r) => r.name))

/** Карточка потерь объекта → реестр простоев этого объекта (ACC-013). */
function goSiteLosses(siteId: string): void {
  router.push({ name: 'downtimes', query: { site: siteId } })
}
const siteZoneDatasets = computed(() => {
  const zones = [...new Set(zoneLossRows.value.map((r) => r.zone))]
  return zones.map((zone) => ({
    label: RESPONSIBILITY_ZONE_RU[zone] ?? zone,
    color: zoneColors[zone] ?? '#64748b',
    data: siteLossRows.value.map((site) =>
      selectionImpact.value
        .filter((d) => {
          const inc = selection.value.find((i) => i.id === d.incidentId)
          return (
            d.siteId === site.siteId &&
            inc?.causeCode &&
            (CAUSE_CATALOG[inc.causeCode]?.zone ?? 'UNKNOWN') === zone
          )
        })
        .reduce((s, d) => s + d.lossRubles, 0),
    ),
  }))
})

// ─── 32.5 Один блок «Повторяющиеся проблемы» ────────────────────────────────

interface RepeatRow {
  code: string
  name: string
  count: number
  robotsCount: number
  sitesCount: number
  zonesCount: number
  sameRobotRepeat: boolean
  sameZoneRepeat: boolean
  hours: number
  loss: number
}

const repeatRows = computed<RepeatRow[]>(() => {
  const byCause = new Map<string, { incs: Incident[] }>()
  for (const inc of selection.value) {
    const code = inc.causeCode
    if (!code) continue
    const row = byCause.get(code) ?? { incs: [] }
    row.incs.push(inc)
    byCause.set(code, row)
  }
  const rows: RepeatRow[] = []
  for (const [code, { incs }] of byCause) {
    if (incs.length < 2) continue
    const robotSet = new Set(incs.map((i) => i.robotId))
    const siteSet = new Set(incs.map((i) => i.siteId))
    const zoneSet = new Set(incs.map((i) => i.zoneName))
    const dts = selectionImpact.value.filter((d) => incs.some((i) => i.id === d.incidentId))
    rows.push({
      code,
      name: causeLabel(code),
      count: incs.length,
      robotsCount: robotSet.size,
      sitesCount: siteSet.size,
      zonesCount: zoneSet.size,
      sameRobotRepeat: [...robotSet].some((r) => incs.filter((i) => i.robotId === r).length >= 2),
      sameZoneRepeat: [...zoneSet].some((z) => incs.filter((i) => i.zoneName === z).length >= 2),
      hours: dts.reduce((s, d) => s + d.accountableDurationSeconds, 0) / 3600,
      loss: dts.reduce((s, d) => s + d.lossRubles, 0),
    })
  }
  return rows.sort((a, b) => b.count - a.count || b.loss - a.loss)
})

const repeatChartLabels = computed(() =>
  repeatRows.value.slice(0, 8).map((r) => r.name.split(' · ')[1] ?? r.name),
)
const repeatChartData = computed(() => repeatRows.value.slice(0, 8).map((r) => r.count))

// ─── 32.6 Время реакции и восстановления (без слова SLA) ────────────────────

const rtStats = computed(() => {
  const closed = selection.value.filter((i) => i.status === 'CLOSED')
  const open = selection.value.filter((i) => i.status !== 'CLOSED')
  const reactions = closed
    .filter((i) => i.reactionSlaSeconds !== null)
    .map((i) => (i.reactionSlaSeconds ?? 0) / 60)
  const recoveries = closed
    .filter((i) => i.recoverySlaSeconds !== null)
    .map((i) => (i.recoverySlaSeconds ?? 0) / 60)
  const stats = (arr: number[]) => {
    if (arr.length === 0) return { avg: 0, med: 0, p90: 0, n: 0 }
    const s = [...arr].sort((a, b) => a - b)
    return {
      avg: Math.round(s.reduce((x, v) => x + v, 0) / s.length),
      med: Math.round(
        s.length % 2 === 0
          ? (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2
          : s[Math.floor(s.length / 2)]!,
      ),
      p90: Math.round(s[Math.min(s.length - 1, Math.floor(s.length * 0.9))] ?? 0),
      n: s.length,
    }
  }
  return {
    reaction: stats(reactions),
    recovery: stats(recoveries),
    openCount: open.length,
  }
})

// ─── 32.7 Расшифровка потерь: полный реестр выборки ─────────────────────────

const breakdownSort = ref<'loss' | 'hours' | 'site' | 'cause'>('loss')
const breakdownRows = computed(() => {
  const rows = selectionImpact.value.map((d) => {
    const inc = selection.value.find((i) => i.id === d.incidentId)
    return {
      downtime: d,
      inc,
      loss: d.lossRubles,
      hours: d.accountableDurationSeconds / 3600,
    }
  })
  const sorters: Record<string, (a: (typeof rows)[0], b: (typeof rows)[0]) => number> = {
    loss: (a, b) => b.loss - a.loss,
    hours: (a, b) => b.hours - a.hours,
    site: (a, b) => siteName(a.downtime.siteId).localeCompare(siteName(b.downtime.siteId)),
    cause: (a, b) =>
      causeLabel(a.inc?.causeCode ?? '').localeCompare(causeLabel(b.inc?.causeCode ?? '')),
  }
  return rows.sort(sorters[breakdownSort.value] ?? sorters.loss!)
})

// ─── Детализация причины (32.3) ──────────────────────────────────────────────

const causeDetail = ref<string | null>(null)
const causeDetailRow = computed(() =>
  causeDetail.value ? (causeRows.value.find((r) => r.code === causeDetail.value) ?? null) : null,
)
const causeDetailIncidents = computed(() =>
  causeDetail.value
    ? selection.value.filter((i) => (i.causeCode ?? 'CA-060') === causeDetail.value)
    : [],
)

function openCauseDetail(code: string): void {
  causeDetail.value = code
}

function goIncident(id: string): void {
  // Переход из диалога детализации закрывает его (смена фокуса внимания).
  causeDetail.value = null
  router.push({ name: 'incident-details', params: { incidentId: id } })
}

function exportBreakdownCsv(): void {
  const rows = breakdownRows.value.map((row) => [
    row.inc?.incidentNumber ?? row.downtime.incidentId,
    siteName(row.downtime.siteId),
    row.downtime.zoneName ?? '',
    robotName(row.downtime.robotId),
    causeLabel(row.inc?.causeCode ?? null),
    row.downtime.startedAt.slice(0, 19).replace('T', ' '),
    row.downtime.endedAt?.slice(0, 19).replace('T', ' ') ?? '',
    row.hours.toFixed(2),
    row.downtime.ratePerHour,
    row.loss,
  ])
  downloadCsv(
    'loss-breakdown-' + new Date().toISOString().slice(0, 10) + '.csv',
    [
      'Инцидент',
      'Объект',
      'Зона',
      'Робот',
      'Причина',
      'Начало',
      'Окончание',
      'Часы',
      'Ставка',
      'Сумма',
    ],
    rows,
  )
}
</script>

<template>
  <div class="space-y-6">
    <!-- 32.1 Фильтры + представления -->
    <div class="flex flex-wrap items-end gap-3">
      <div class="flex gap-1 rounded-lg border border-border p-1">
        <Button
          v-for="v in [
            { key: 'site', label: 'Объект' },
            { key: 'fleet', label: 'Роботопарк' },
            { key: 'econ', label: 'Экономика' },
          ]"
          :key="v.key"
          :variant="view === v.key ? 'default' : 'ghost'"
          size="sm"
          class="min-h-8 h-8"
          @click="view = v.key as typeof view"
          >{{ v.label }}</Button
        >
      </div>
      <div class="space-y-1">
        <span class="text-xs text-muted-foreground block">Объект</span>
        <Select v-model="filterSite" aria-label="Фильтр по объекту">
          <SelectTrigger class="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все объекты</SelectItem>
            <SelectItem v-for="s in scopedSites" :key="s.id" :value="s.id">{{ s.name }}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div class="space-y-1">
        <span class="text-xs text-muted-foreground block">Причина</span>
        <Select v-model="filterCause" aria-label="Фильтр по причине">
          <SelectTrigger class="w-[220px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все причины</SelectItem>
            <SelectItem v-for="c in causeOptions" :key="c" :value="c">{{
              causeLabel(c)
            }}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div class="space-y-1">
        <span class="text-xs text-muted-foreground block">Зона ответственности</span>
        <Select v-model="filterZone" aria-label="Фильтр по зоне ответственности">
          <SelectTrigger class="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все зоны</SelectItem>
            <SelectItem value="OPERATIONS">Эксплуатация склада</SelectItem>
            <SelectItem value="IT">ИТ-инфраструктура</SelectItem>
            <SelectItem value="SERVICE">Сервис</SelectItem>
            <SelectItem value="INFRASTRUCTURE">Инфраструктура</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div class="space-y-1">
        <span class="text-xs text-muted-foreground block">Робот</span>
        <Select v-model="filterRobot" aria-label="Фильтр по роботу">
          <SelectTrigger class="w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все</SelectItem>
            <SelectItem v-for="r in robotOptions" :key="r.id" :value="r.id">{{
              r.name
            }}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>

    <!-- 32.2 Верхняя сводка (ТЗ v2.0 §9.2) -->
    <div class="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
      <Card>
        <CardContent class="p-4">
          <p class="text-sm text-muted-foreground">Техническая доступность</p>
          <p class="text-2xl font-bold tabular-nums text-success">
            {{
              kpis.techAvailability.toLocaleString('ru-RU', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })
            }}%
          </p>
          <p class="text-xs text-muted-foreground mt-0.5">
            1 − {{ kpis.techHours.toFixed(1) }} ч /
            {{ kpis.plannedRobotHours.toLocaleString('ru-RU') }} ч ({{ kpis.fleet }} роб. × 8 ч × 30
            дн)
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardContent class="p-4">
          <p class="text-sm text-muted-foreground">Операционная доступность мощности</p>
          <p class="text-2xl font-bold tabular-nums text-success">
            {{
              kpis.powerAvailability.toLocaleString('ru-RU', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })
            }}%
          </p>
          <p class="text-xs text-muted-foreground mt-0.5">
            влияние {{ kpis.impactHours.toFixed(1) }} ч · недоступность
            {{ kpis.techHours.toFixed(1) }} ч — раздельно
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardContent class="p-4">
          <p class="text-sm text-muted-foreground">Потери процесса</p>
          <p class="text-2xl font-bold tabular-nums text-destructive">
            {{ kpis.confirmedLoss.toLocaleString('ru-RU') }} ₽
          </p>
          <p class="text-xs text-muted-foreground mt-0.5">
            {{ kpis.impactIntervals }} влияния × ставка объекта
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardContent class="p-4">
          <p class="text-sm text-muted-foreground">Стоимость ремонта</p>
          <p class="text-2xl font-bold tabular-nums">
            {{ kpis.repairCost.toLocaleString('ru-RU') }} ₽
          </p>
          <p class="text-xs text-muted-foreground mt-0.5">
            труд + запчасти по {{ kpis.repairWorks }} работам — отдельно от потерь
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardContent class="p-4">
          <p class="text-sm text-muted-foreground">Инциденты и бэклог</p>
          <p class="text-2xl font-bold tabular-nums">
            {{ kpis.activeIncidents }}
            <span class="text-base font-normal text-muted-foreground">акт. ·</span>
            {{ kpis.backlogRobots }}
            <span class="text-base font-normal text-muted-foreground">в сервисе</span>
          </p>
          <p class="text-xs text-muted-foreground mt-0.5">
            всего {{ kpis.incidentsCount }} · работ {{ kpis.backlogWorks }} · разборов не завершено
            {{ kpis.unfinishedReviews }}
          </p>
        </CardContent>
      </Card>
      <Card :class="kpis.reserveBelow.length > 0 ? 'border-warning/40' : ''">
        <CardContent class="p-4">
          <p class="text-sm text-muted-foreground">Резерв ниже норматива</p>
          <p
            class="text-2xl font-bold tabular-nums"
            :class="kpis.reserveBelow.length > 0 ? 'text-warning' : 'text-success'"
          >
            {{ kpis.reserveBelow.length }}
          </p>
          <p class="text-xs text-muted-foreground mt-0.5">
            {{
              kpis.reserveBelow.length > 0
                ? kpis.reserveBelow.join(', ') + ' — риск устойчивости, не потеря'
                : 'норматив выдержан на всех объектах'
            }}
          </p>
        </CardContent>
      </Card>
    </div>

    <!-- Представление «Объект»: проблемы объекта по зонам/роботам/причинам -->
    <template v-if="view === 'site'">
      <!-- 32.3 Потери по причинам -->
      <Card>
        <CardHeader
          ><CardTitle>Потери по причинам</CardTitle>
          <p class="text-xs text-muted-foreground">
            Нажмите на причину — детализация до объектов, роботов и инцидентов
          </p></CardHeader
        >
        <CardContent>
          <ChartCard
            type="bar"
            :labels="causeChartLabels"
            :datasets="[{ label: 'Потери', data: causeChartData }]"
            horizontal
            suffix=" ₽"
          />
          <div class="mt-3 space-y-1">
            <button
              v-for="row in causeRows"
              :key="row.code"
              type="button"
              class="w-full flex items-center justify-between text-left text-sm px-3 py-2 rounded-lg hover:bg-accent/50"
              @click="openCauseDetail(row.code)"
            >
              <span class="truncate">{{ row.name }}</span>
              <span class="tabular-nums text-xs text-muted-foreground shrink-0 ml-3"
                >{{ row.count }} сл. · {{ row.hours.toFixed(1) }} ч ·
                {{ row.loss.toLocaleString('ru-RU') }} ₽ ({{ row.share.toFixed(0) }}%)</span
              >
            </button>
          </div>
        </CardContent>
      </Card>
    </template>

    <!-- Представление «Роботопарк»: сравнение объектов/роботов -->
    <template v-else-if="view === 'fleet'">
      <!-- 32.5 Повторяющиеся проблемы -->
      <Card>
        <CardHeader
          ><CardTitle>Повторяющиеся проблемы</CardTitle>
          <p class="text-xs text-muted-foreground">
            Повторяемость — числом случаев и охватом, не только деньгами
          </p></CardHeader
        >
        <CardContent>
          <ChartCard
            type="bar"
            :labels="repeatChartLabels"
            :datasets="[{ label: 'Случаев', data: repeatChartData, color: '#f97316' }]"
            suffix=" сл."
          />
          <Table class="mt-3">
            <TableHeader
              ><TableRow>
                <TableHead class="py-2 px-3">Причина</TableHead>
                <TableHead class="py-2 px-3">Случаев</TableHead>
                <TableHead class="py-2 px-3">Роботов</TableHead>
                <TableHead class="py-2 px-3">Объектов</TableHead>
                <TableHead class="py-2 px-3">Зон</TableHead>
                <TableHead class="py-2 px-3">Повтор</TableHead>
                <TableHead class="py-2 px-3">Часы</TableHead>
                <TableHead class="py-2 px-3">Потери</TableHead>
                <TableHead class="py-2 px-3"></TableHead> </TableRow
            ></TableHeader>
            <TableBody>
              <TableRow v-for="row in repeatRows" :key="row.code">
                <TableCell class="text-sm py-2 px-3">{{ row.name }}</TableCell>
                <TableCell class="text-sm tabular-nums py-2 px-3">{{ row.count }}</TableCell>
                <TableCell class="text-sm tabular-nums py-2 px-3">{{ row.robotsCount }}</TableCell>
                <TableCell class="text-sm tabular-nums py-2 px-3">{{ row.sitesCount }}</TableCell>
                <TableCell class="text-sm tabular-nums py-2 px-3">{{ row.zonesCount }}</TableCell>
                <TableCell class="text-xs py-2 px-3">
                  <span
                    v-if="row.sameZoneRepeat || row.sameRobotRepeat"
                    class="rounded px-1.5 py-0.5 bg-warning/15 text-warning"
                    >{{ row.sameRobotRepeat ? 'тот же робот' : 'та же зона' }}</span
                  >
                  <span v-else class="text-muted-foreground">распылено</span>
                </TableCell>
                <TableCell class="text-sm tabular-nums py-2 px-3">{{
                  row.hours.toFixed(1)
                }}</TableCell>
                <TableCell class="text-sm tabular-nums py-2 px-3"
                  >{{ row.loss.toLocaleString('ru-RU') }} ₽</TableCell
                >
                <TableCell class="py-2 px-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    class="min-h-7 h-7"
                    @click="openCauseDetail(row.code)"
                    >Инциденты</Button
                  >
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </template>

    <!-- Представление «Экономика» -->
    <template v-else>
      <!-- 32.4 Потери по объектам -->
      <Card>
        <CardHeader
          ><CardTitle>Потери по объектам</CardTitle>
          <p class="text-xs text-muted-foreground">Где физически возникли потери</p></CardHeader
        >
        <CardContent>
          <ChartCard
            type="bar-stacked"
            :labels="siteChartLabels"
            :datasets="siteZoneDatasets"
            suffix=" ₽"
          />
          <div class="mt-3 grid gap-2 md:grid-cols-3">
            <div
              v-for="row in siteLossRows"
              :key="row.siteId"
              class="border border-border rounded-lg p-3 cursor-pointer hover:border-primary/50 transition-colors"
              role="button"
              tabindex="0"
              @click="goSiteLosses(row.siteId)"
              @keydown.enter="goSiteLosses(row.siteId)"
            >
              <p class="font-medium text-sm">{{ row.name }}</p>
              <p class="text-lg font-bold tabular-nums">{{ row.loss.toLocaleString('ru-RU') }} ₽</p>
              <p class="text-xs text-muted-foreground">
                {{ row.hours.toFixed(1) }} ч · {{ row.zones }} зон · открыть расшифровку
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- 32.4 Потери по зонам ответственности -->
      <Card>
        <CardHeader
          ><CardTitle>Потери по зонам ответственности</CardTitle>
          <p class="text-xs text-muted-foreground">В чьём контуре первопричина</p></CardHeader
        >
        <CardContent class="space-y-2">
          <div
            v-for="row in zoneLossRows"
            :key="row.zone"
            class="flex items-center justify-between border border-border rounded-lg p-3"
          >
            <div>
              <p class="font-medium text-sm">
                {{ RESPONSIBILITY_ZONE_RU[row.zone] ?? row.zone }}
              </p>
              <p class="text-xs text-muted-foreground">{{ row.causes.size }} причин в контуре</p>
            </div>
            <p class="text-lg font-bold tabular-nums">{{ row.loss.toLocaleString('ru-RU') }} ₽</p>
          </div>
        </CardContent>
      </Card>
    </template>

    <!-- 32.6 Время реакции и восстановления (полный блок; во всех представлениях) -->
    <Card>
      <CardHeader
        ><CardTitle>Время реакции и восстановления</CardTitle>
        <p class="text-xs text-muted-foreground">
          Реакция = принятие в работу − создание; восстановление = подтверждение восстановления −
          начало недоступности. Открытые инциденты не входят в расчёт.
        </p></CardHeader
      >
      <CardContent class="grid gap-4 md:grid-cols-2">
        <div class="space-y-1">
          <p class="text-sm font-medium">Время реакции, мин</p>
          <div class="grid grid-cols-4 gap-2 text-center">
            <div>
              <p class="text-lg font-bold tabular-nums">{{ rtStats.reaction.avg }}</p>
              <p class="text-xs text-muted-foreground">среднее</p>
            </div>
            <div>
              <p class="text-lg font-bold tabular-nums">{{ rtStats.reaction.med }}</p>
              <p class="text-xs text-muted-foreground">медиана</p>
            </div>
            <div>
              <p class="text-lg font-bold tabular-nums">{{ rtStats.reaction.p90 }}</p>
              <p class="text-xs text-muted-foreground">90-й перцентиль</p>
            </div>
            <div>
              <p class="text-lg font-bold tabular-nums">{{ rtStats.reaction.n }}</p>
              <p class="text-xs text-muted-foreground">в расчёте</p>
            </div>
          </div>
        </div>
        <div class="space-y-1">
          <p class="text-sm font-medium">Время восстановления, мин</p>
          <div class="grid grid-cols-4 gap-2 text-center">
            <div>
              <p class="text-lg font-bold tabular-nums">{{ rtStats.recovery.avg }}</p>
              <p class="text-xs text-muted-foreground">среднее</p>
            </div>
            <div>
              <p class="text-lg font-bold tabular-nums">{{ rtStats.recovery.med }}</p>
              <p class="text-xs text-muted-foreground">медиана</p>
            </div>
            <div>
              <p class="text-lg font-bold tabular-nums">{{ rtStats.recovery.p90 }}</p>
              <p class="text-xs text-muted-foreground">90-й перцентиль</p>
            </div>
            <div>
              <p class="text-lg font-bold tabular-nums">{{ rtStats.recovery.n }}</p>
              <p class="text-xs text-muted-foreground">в расчёте</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- 32.7 Расшифровка потерь: полный реестр выборки -->
    <Card>
      <CardHeader>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>Расшифровка потерь</CardTitle>
            <p class="text-xs text-muted-foreground mt-0.5">
              Все строки текущего расчёта; итог равен агрегату
            </p>
          </div>
          <div class="flex gap-2">
            <Button size="sm" variant="outline" class="min-h-9" @click="exportBreakdownCsv"
              ><Download class="size-3.5 mr-1" /> Экспорт CSV</Button
            >
            <Select v-model="breakdownSort" aria-label="Сортировка расшифровки">
              <SelectTrigger class="w-[190px] min-h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="loss">По сумме</SelectItem>
                <SelectItem value="hours">По длительности</SelectItem>
                <SelectItem value="site">По объекту</SelectItem>
                <SelectItem value="cause">По причине</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent class="p-0">
        <div class="px-6 pt-3 flex flex-wrap gap-4 text-sm text-muted-foreground">
          <span
            >Строк:
            <strong class="text-foreground tabular-nums">{{ breakdownRows.length }}</strong>
            (все из {{ selection.length }} инцидентов)</span
          >
          <span
            >Итого:
            <strong class="text-foreground tabular-nums"
              >{{ kpis.confirmedLoss.toLocaleString('ru-RU') }} ₽</strong
            >
            · {{ kpis.impactHours.toFixed(1) }} ч влияния</span
          >
        </div>
        <div class="overflow-x-auto max-h-[480px] overflow-y-auto">
          <Table>
            <TableHeader
              ><TableRow>
                <TableHead class="py-2 px-4">Инцидент</TableHead>
                <TableHead class="py-2 px-4">Объект · зона</TableHead>
                <TableHead class="py-2 px-4">Робот</TableHead>
                <TableHead class="py-2 px-4">Причина</TableHead>
                <TableHead class="py-2 px-4">Простой</TableHead>
                <TableHead class="py-2 px-4">Часы</TableHead>
                <TableHead class="py-2 px-4">Ставка</TableHead>
                <TableHead class="py-2 px-4">Сумма</TableHead>
              </TableRow></TableHeader
            >
            <TableBody>
              <TableEmpty v-if="breakdownRows.length === 0" :colspan="8"
                >В выборке нет подтверждённых потерь.</TableEmpty
              >
              <TableRow
                v-for="row in breakdownRows"
                :key="row.downtime.id"
                class="row-interactive cursor-pointer"
                @click="row.inc && goIncident(row.inc.id)"
              >
                <TableCell class="text-xs text-primary py-2 px-4">{{
                  row.inc?.incidentNumber ?? row.downtime.incidentId
                }}</TableCell>
                <TableCell class="text-xs py-2 px-4"
                  >{{ siteName(row.downtime.siteId)
                  }}<span v-if="row.downtime.zoneName" class="text-muted-foreground">
                    · {{ row.downtime.zoneName }}</span
                  ></TableCell
                >
                <TableCell class="text-xs py-2 px-4">{{
                  robotName(row.downtime.robotId)
                }}</TableCell>
                <TableCell class="text-xs py-2 px-4 max-w-[200px]"
                  ><span class="truncate block">{{
                    causeLabel(row.inc?.causeCode ?? null)
                  }}</span></TableCell
                >
                <TableCell class="text-xs font-mono tabular-nums py-2 px-4"
                  >{{ row.downtime.startedAt.slice(0, 10) }} →
                  {{ row.downtime.endedAt?.slice(0, 10) ?? '…' }}</TableCell
                >
                <TableCell class="text-xs tabular-nums py-2 px-4">{{
                  row.hours.toFixed(2)
                }}</TableCell>
                <TableCell class="text-xs tabular-nums py-2 px-4"
                  >{{ row.downtime.ratePerHour.toLocaleString('ru-RU') }} ₽/ч</TableCell
                >
                <TableCell class="text-xs font-medium tabular-nums py-2 px-4"
                  >{{ row.loss.toLocaleString('ru-RU') }} ₽</TableCell
                >
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>

    <!-- Детализация причины (32.3) -->
    <Dialog :open="Boolean(causeDetail)" @update:open="(v) => !v && (causeDetail = null)">
      <DialogContent
        class="w-[90%] max-w-[1100px] sm:max-w-[1100px] max-h-[85vh] flex flex-col gap-0 p-0"
      >
        <DialogHeader class="p-6 pb-3 shrink-0">
          <DialogTitle>{{ causeDetailRow?.name ?? causeDetail }}</DialogTitle>
          <DialogDescription>
            Все инциденты этой причины в текущей выборке; суммы равны агрегату.
          </DialogDescription>
        </DialogHeader>
        <div class="overflow-y-auto px-6 flex-1">
          <div
            v-if="causeDetailRow"
            class="flex flex-wrap gap-4 text-sm pb-3 border-b border-border mb-3"
          >
            <span
              >Случаев: <strong class="tabular-nums">{{ causeDetailRow.count }}</strong></span
            >
            <span
              >Часов:
              <strong class="tabular-nums">{{ causeDetailRow.hours.toFixed(1) }}</strong></span
            >
            <span
              >Потери:
              <strong class="tabular-nums"
                >{{ causeDetailRow.loss.toLocaleString('ru-RU') }} ₽</strong
              >
              ({{ causeDetailRow.share.toFixed(0) }}%)</span
            >
            <span
              >Роботов: <strong class="tabular-nums">{{ causeDetailRow.robots }}</strong> ·
              объектов: {{ causeDetailRow.sitesCount }} · зон: {{ causeDetailRow.zonesCount }}</span
            >
            <span
              v-if="causeDetailRow.sitesCount > 1"
              class="text-xs text-muted-foreground self-center"
              >проблема повторяется по сети</span
            >
            <span v-else class="text-xs text-muted-foreground self-center"
              >проблема локальна для одного объекта</span
            >
          </div>
          <Table>
            <TableHeader
              ><TableRow>
                <TableHead class="py-2 px-3">Инцидент</TableHead>
                <TableHead class="py-2 px-3">Объект · зона</TableHead>
                <TableHead class="py-2 px-3">Робот</TableHead>
                <TableHead class="py-2 px-3">Статус</TableHead>
                <TableHead class="py-2 px-3">Простой</TableHead>
                <TableHead class="py-2 px-3">Потери</TableHead>
              </TableRow></TableHeader
            >
            <TableBody>
              <TableRow
                v-for="inc in causeDetailIncidents"
                :key="inc.id"
                class="row-interactive cursor-pointer"
                @click="goIncident(inc.id)"
              >
                <TableCell class="text-xs text-primary py-2 px-3">{{
                  inc.incidentNumber
                }}</TableCell>
                <TableCell class="text-xs py-2 px-3"
                  >{{ siteName(inc.siteId) }} · {{ inc.zoneName }}</TableCell
                >
                <TableCell class="text-xs py-2 px-3">{{ robotName(inc.robotId) }}</TableCell>
                <TableCell class="text-xs py-2 px-3">{{
                  inc.status === 'CLOSED' ? 'закрыт' : 'в работе'
                }}</TableCell>
                <TableCell class="text-xs tabular-nums py-2 px-3"
                  >{{ (inc.downtimeSeconds / 3600).toFixed(1) }} ч</TableCell
                >
                <TableCell class="text-xs tabular-nums py-2 px-3"
                  >{{ inc.lossRubles.toLocaleString('ru-RU') }} ₽</TableCell
                >
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  </div>
</template>
