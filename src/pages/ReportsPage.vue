<script setup lang="ts">
import { ref, computed } from 'vue'
import { useDemoData } from '@/composables/useDemoData'
import { useAuthStore } from '@/stores/auth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Download } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { useRouter } from 'vue-router'
import { incidentTypeLabel, causeLabel, CAUSE_CATALOG } from '@/data/generator'
import { RESPONSIBILITY_ZONE_RU, MAINTENANCE_STATUS_RU } from '@/data/labels'
import ChartCard from '@/components/ChartCard.vue'
import LossFlowGraph from '@/components/LossFlowGraph.vue'
import { METRIC_PASSPORTS } from '@/data/metric-passports'
import { useTenantScope } from '@/composables/useTenantScope'
import { impactSeconds, techAvailabilityPct, techUnavailableSeconds } from '@/data/metrics'
import { BookOpen } from 'lucide-vue-next'

// ACC-033/034: каталог паспортов метрик (Отчёт §10.9) — раскрытый на Отчётах.
const showPassports = ref(false)

const { incidents, downtimes, analytics, robots, sites, costRates, maintenance } = useDemoData()
const auth = useAuthStore()
const router = useRouter()

// Объектовая область роли (ACC-007): отчёты ограничены разрешёнными объектами.
const scope = useTenantScope()
const scopedSiteIds = computed(() => scope.sites(sites.value).value.map((s) => s.id))

/** Строки расшифровки диалога: инциденты с подтверждёнными потерями, по убыванию суммы. */
const breakdownRows = computed(() =>
  incidents.value
    .filter((i) => i.lossRubles > 0 && scopedSiteIds.value.includes(i.siteId))
    .sort((a, b) => b.lossRubles - a.lossRubles),
)

const selectedSite = ref('all')
const showBreakdown = ref(false)
const breakdownTitle = ref('')

/** Объекты, доступные роли: пересечение tenant-scope и ручного выбора. */
const availableSites = computed(() => scope.sites(sites.value).value)

const siteName = computed(() =>
  selectedSite.value === 'all'
    ? scope.scoped.value
      ? 'Объекты моей зоны ответственности'
      : 'Все объекты'
    : (sites.value.find((s) => s.id === selectedSite.value)?.name ?? ''),
)

const filteredIncidents = computed(() =>
  incidents.value.filter(
    (i) =>
      scopedSiteIds.value.includes(i.siteId) &&
      (selectedSite.value === 'all' || i.siteId === selectedSite.value),
  ),
)
const filteredDowntimes = computed(() =>
  downtimes.value.filter(
    (d) =>
      scopedSiteIds.value.includes(d.siteId) &&
      (selectedSite.value === 'all' || d.siteId === selectedSite.value),
  ),
)

const filteredStats = computed(() => {
  const incs = filteredIncidents.value
  const dts = filteredDowntimes.value.filter((d) => d.confirmationStatus === 'CONFIRMED')
  const totalDowntime = dts.reduce((s, d) => s + d.accountableDurationSeconds, 0)
  const totalLoss = dts.reduce((s, d) => s + d.lossRubles, 0)
  const active = incs.filter((i) => i.status !== 'CLOSED').length
  const unclassified = incs.filter(
    (i) => i.causeMaturity === 'NONE' || i.causeCode === 'CA-060',
  ).length
  return {
    totalDowntime,
    totalLoss,
    active,
    unclassified,
    total: incs.length,
    classified: incs.length - unclassified,
  }
})

const topCauses = computed(() => {
  const map = new Map<string, { code: string; count: number; loss: number; hours: number }>()
  for (const inc of filteredIncidents.value) {
    if (inc.lossRubles > 0 && inc.causeCode) {
      const e = map.get(inc.causeCode) ?? { code: inc.causeCode, count: 0, loss: 0, hours: 0 }
      e.count++
      e.loss += inc.lossRubles
      e.hours += inc.downtimeSeconds / 3600
      map.set(inc.causeCode, e)
    }
  }
  return [...map.values()].sort((a, b) => b.loss - a.loss).slice(0, 5)
})

const robotStats = computed(() => {
  const map = new Map<
    string,
    { name: string; model: string; site: string; count: number; downtime: number; loss: number }
  >()
  for (const r of robots.value) {
    if (!scopedSiteIds.value.includes(r.siteId)) continue
    if (selectedSite.value !== 'all' && r.siteId !== selectedSite.value) continue
    map.set(r.id, {
      name: r.name,
      model: r.model,
      site: sites.value.find((s) => s.id === r.siteId)?.name ?? r.siteId,
      count: 0,
      downtime: 0,
      loss: 0,
    })
  }
  for (const inc of filteredIncidents.value) {
    if (!inc.robotId) continue
    const e = map.get(inc.robotId)
    if (e) {
      e.count++
      e.downtime += inc.downtimeSeconds
      e.loss += inc.lossRubles
    }
  }
  return [...map.values()].filter((e) => e.count > 0).sort((a, b) => b.loss - a.loss)
})

// ─── Визуализации: этапы, Гант ТОиР, граф потерь (итерация 2026-08) ──────

const PHASES = ['Открыт', 'В работе', 'Ожидание', 'Готов к завершению', 'Закрыт'] as const
type Phase = (typeof PHASES)[number]

const INCIDENT_PHASE: Record<string, Phase> = {
  OPEN: 'Открыт',
  IN_PROGRESS: 'В работе',
  WAITING: 'Ожидание',
  READY_TO_CLOSE: 'Готов к завершению',
  CLOSED: 'Закрыт',
}
const WORK_PHASE: Record<string, Phase> = {
  PLANNED: 'Открыт',
  ASSIGNED: 'В работе',
  IN_PROGRESS: 'В работе',
  WAITING_PARTS: 'Ожидание',
  DONE: 'Готов к завершению',
  RESULT_CONFIRMED: 'Закрыт',
}

const phaseData = computed(() => {
  const inc = [0, 0, 0, 0, 0]
  const wrk = [0, 0, 0, 0, 0]
  for (const i of filteredIncidents.value)
    inc[PHASES.indexOf(INCIDENT_PHASE[i.status] ?? 'Открыт')]++
  for (const w of maintenance.value) {
    if (!scopedSiteIds.value.includes(w.siteId)) continue
    if (selectedSite.value !== 'all' && w.siteId !== selectedSite.value) continue
    if (w.status === 'CANCELLED') continue
    wrk[PHASES.indexOf(WORK_PHASE[w.status] ?? 'Открыт')]++
  }
  return { inc, wrk }
})

const ganttWorks = computed(() =>
  maintenance.value
    .filter((w) => {
      if (!scopedSiteIds.value.includes(w.siteId)) return false
      if (selectedSite.value !== 'all' && w.siteId !== selectedSite.value) return false
      return w.status !== 'CANCELLED'
    })
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
    .slice(0, 12),
)

const DAY = 86400000

const ganttDatasets = computed(() => {
  const now = Date.now()
  const byStatus = new Map<string, Array<[number, number]>>()
  const rows = ganttWorks.value
  for (const w of rows) {
    const due = new Date(w.dueAt).getTime()
    const end = w.completedAt ? new Date(w.completedAt).getTime() : due
    const start = w.startedAt ? new Date(w.startedAt).getTime() : due - 2 * DAY
    const arr = byStatus.get(w.status) ?? []
    arr.push([Math.round((start - now) / DAY), Math.round((end - now) / DAY)])
    byStatus.set(w.status, arr)
  }
  const tokens: Record<string, string> = {
    PLANNED: '--chart-3',
    ASSIGNED: '--chart-1',
    IN_PROGRESS: '--chart-1',
    WAITING_PARTS: '--warning',
    DONE: '--success',
    RESULT_CONFIRMED: '--success',
  }
  return [...byStatus.entries()].map(([status, data]) => ({
    label: MAINTENANCE_STATUS_RU[status] ?? status,
    color: tokens[status] ?? '--chart-1',
    data,
  }))
})

const ganttLabels = computed(() =>
  ganttWorks.value.map((w) => {
    const robot = robots.value.find((r) => r.id === w.robotId)?.name ?? w.robotId
    const t = w.title.length > 22 ? w.title.slice(0, 21) + '…' : w.title
    return `${robot} · ${t}`
  }),
)

const flowLinks = computed(() => {
  const byCause = new Map<string, Map<string, number>>()
  for (const i of filteredIncidents.value) {
    if (!i.causeCode || i.lossRubles <= 0) continue
    const site = sites.value.find((s) => s.id === i.siteId)?.name ?? i.siteId
    const inner = byCause.get(i.causeCode) ?? new Map<string, number>()
    inner.set(site, (inner.get(site) ?? 0) + i.lossRubles)
    byCause.set(i.causeCode, inner)
  }
  const totals = [...byCause.entries()]
    .map(([code, sitesMap]) => ({
      code,
      total: [...sitesMap.values()].reduce((s, v) => s + v, 0),
      sitesMap,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 4)
  const tokens = ['--chart-1', '--chart-2', '--chart-3', '--chart-4']
  const links: Array<{ from: string; to: string; value: number; colorToken: string }> = []
  totals.forEach((t, idx) => {
    const name = causeLabel(t.code).split(' · ')[1] ?? causeLabel(t.code)
    for (const [site, value] of t.sitesMap)
      links.push({ from: name, to: site, value, colorToken: tokens[idx] })
  })
  return links
})

function exportReport(): void {
  // Единые метрики (ACC-023): доступность — по формуле metrics.ts.
  const scopedRobotCount = robots.value.filter(
    (r) =>
      scopedSiteIds.value.includes(r.siteId) &&
      (selectedSite.value === 'all' || r.siteId === selectedSite.value),
  ).length
  const techAvail = techAvailabilityPct(filteredDowntimes.value, scopedRobotCount)
  const impactH = impactSeconds(filteredDowntimes.value) / 3600
  const techH = techUnavailableSeconds(filteredDowntimes.value) / 3600
  const lines = [
    'ZIMA FleetOps — Управленческий отчёт',
    `Период: последние 30 дней | Объект: ${siteName.value}`,
    `Дата формирования: ${new Date().toLocaleString('ru-RU')}`,
    '',
    '=== СВОДКА ===',
    `Техническая доступность: ${techAvail.toFixed(1)}% (парк ${scopedRobotCount} × 8 ч × 30 дней)`,
    `Операционное влияние: ${impactH.toFixed(1)} ч`,
    `Техническая недоступность: ${techH.toFixed(1)} ч`,
    `Потери процесса: ${filteredStats.value.totalLoss.toLocaleString('ru-RU')} ₽`,
    `Инцидентов: ${filteredStats.value.total} (активных: ${filteredStats.value.active})`,
    `Неклассифицированных: ${filteredStats.value.unclassified} (${filteredStats.value.total > 0 ? ((filteredStats.value.unclassified / filteredStats.value.total) * 100).toFixed(0) : 0}%)`,
    '',
    '=== ТОП ПРИЧИН ===',
    ...topCauses.value.map(
      (c, i) =>
        `  ${i + 1}. ${causeLabel(c.code)}: ${c.count} случаев, ${c.hours.toFixed(1)} ч, ${c.loss.toLocaleString('ru-RU')} ₽`,
    ),
    '',
    '=== Реакция и восстановление (нормативы: реакция 10 мин, возврат 120 мин) ===',
    `Реакция (обнаружение → принятие в работу): ${analytics.value.sla.reactionMet} в норме, ${analytics.value.sla.reactionViolated} нарушено`,
    `Восстановление (обнаружение → возврат в парк): ${analytics.value.sla.recoveryMet} в норме, ${analytics.value.sla.recoveryViolated} нарушено`,
    '',
    '=== ПО РОБОТАМ ===',
    ...robotStats.value.map(
      (r) =>
        `  ${r.name} (${r.model}, ${r.site}): ${r.count} инц., ${(r.downtime / 3600).toFixed(1)} ч, ${r.loss.toLocaleString('ru-RU')} ₽`,
    ),
    '',
    '=== СТАВКИ ===',
    ...costRates.value.map((r) => `  ${r.siteName}: ${r.ratePerHour.toLocaleString('ru-RU')} ₽/ч`),
  ]
  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `fleetops-report-${new Date().toISOString().slice(0, 10)}.txt`
  a.click()
  URL.revokeObjectURL(url)
  toast.success('Отчёт экспортирован')
}

function openBreakdown(title: string): void {
  breakdownTitle.value = title
  showBreakdown.value = true
}
</script>

<template>
  <div class="space-y-4">
    <!-- Паспорта метрик (ACC-033/034, Отчёт §10.9) -->
    <Card>
      <CardHeader class="cursor-pointer select-none" @click="showPassports = !showPassports">
        <CardTitle class="flex items-center gap-2 text-base">
          <BookOpen class="size-4" /> Паспорта метрик ({{ METRIC_PASSPORTS.length }})
          <span class="text-xs font-normal text-muted-foreground">
            {{ showPassports ? 'свернуть' : 'формула, источник, период, детализация' }}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent v-if="showPassports" class="space-y-3">
        <div
          v-for="p in METRIC_PASSPORTS"
          :key="p.code"
          class="rounded-lg border border-border p-3 space-y-1"
        >
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <p class="text-sm font-medium">{{ p.name }}</p>
            <span class="text-xs rounded px-1.5 py-0.5 bg-muted">{{ p.status }}</span>
          </div>
          <p class="text-xs text-muted-foreground">{{ p.question }}</p>
          <div class="grid gap-x-6 gap-y-1 text-xs md:grid-cols-2 mt-1">
            <p><span class="text-muted-foreground">Формула:</span> {{ p.formula }}</p>
            <p><span class="text-muted-foreground">Числитель:</span> {{ p.numerator }}</p>
            <p><span class="text-muted-foreground">Знаменатель:</span> {{ p.denominator }}</p>
            <p><span class="text-muted-foreground">Единица:</span> {{ p.unit }}</p>
            <p><span class="text-muted-foreground">Источник:</span> {{ p.source }}</p>
            <p><span class="text-muted-foreground">Период:</span> {{ p.period }}</p>
            <p><span class="text-muted-foreground">Агрегация:</span> {{ p.aggregation }}</p>
            <p><span class="text-muted-foreground">Исключения:</span> {{ p.exclusions }}</p>
            <p>
              <span class="text-muted-foreground">При неполных данных:</span> {{ p.incomplete }}
            </p>
            <p><span class="text-muted-foreground">Детализация:</span> {{ p.drilldown }}</p>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- Toolbar -->
    <div class="flex items-center gap-3">
      <div class="space-y-1">
        <span class="text-xs text-muted-foreground block">Объект</span>
        <Select v-model="selectedSite" aria-label="Выбор объекта">
          <SelectTrigger class="w-[220px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все объекты</SelectItem>
            <SelectItem v-for="s in availableSites" :key="s.id" :value="s.id">{{
              s.name
            }}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button
        v-if="auth.can('reports.export')"
        variant="outline"
        size="sm"
        class="ml-auto mt-5"
        @click="exportReport"
      >
        <Download class="size-4 mr-1" /> Экспорт
      </Button>
    </div>

    <!-- Summary KPIs -->
    <Card>
      <CardHeader
        ><CardTitle>Управленческий отчёт — {{ siteName }}</CardTitle></CardHeader
      >
      <CardContent>
        <div class="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div
            class="kpi-clickable border border-border rounded-lg p-3"
            @click="openBreakdown('Доступность')"
          >
            <p class="text-muted-foreground text-xs">Доступность</p>
            <p class="text-xl font-bold tabular-nums">
              {{ (100 - (filteredStats.totalDowntime / (30 * 24 * 3600)) * 100).toFixed(1) }}%
            </p>
          </div>
          <div
            class="kpi-clickable border border-border rounded-lg p-3"
            @click="openBreakdown('Простой')"
          >
            <p class="text-muted-foreground text-xs">Простой</p>
            <p class="text-xl font-bold tabular-nums">
              {{ (filteredStats.totalDowntime / 3600).toFixed(1) }} ч
            </p>
          </div>
          <div
            class="kpi-clickable border border-border rounded-lg p-3"
            @click="openBreakdown('Потери')"
          >
            <p class="text-muted-foreground text-xs">Потери</p>
            <p class="text-xl font-bold tabular-nums">
              {{ filteredStats.totalLoss.toLocaleString('ru-RU') }} ₽
            </p>
          </div>
          <div class="border border-border rounded-lg p-3">
            <p class="text-muted-foreground text-xs">Активные</p>
            <p class="text-xl font-bold tabular-nums">{{ filteredStats.active }}</p>
          </div>
          <div class="border border-border rounded-lg p-3">
            <p class="text-muted-foreground text-xs">Неклассиф.</p>
            <p class="text-xl font-bold tabular-nums text-warning">
              {{ filteredStats.unclassified }}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- Top causes -->
    <Card>
      <CardHeader><CardTitle>Топ причин по потерям</CardTitle></CardHeader>
      <CardContent class="p-0">
        <Table>
          <TableHeader
            ><TableRow>
              <TableHead class="py-2 px-4">Причина</TableHead>
              <TableHead class="py-2 px-4">Зона ответственности</TableHead>
              <TableHead class="py-2 px-4">Случаев</TableHead>
              <TableHead class="py-2 px-4">Часов</TableHead>
              <TableHead class="py-2 px-4">Потери</TableHead>
            </TableRow></TableHeader
          >
          <TableBody>
            <TableRow
              v-for="c in topCauses"
              :key="c.code"
              class="row-interactive cursor-pointer"
              @click="router.push({ name: 'analytics' })"
            >
              <TableCell class="text-sm py-3 px-4">{{ causeLabel(c.code) }}</TableCell>
              <TableCell class="text-xs py-3 px-4">{{
                RESPONSIBILITY_ZONE_RU[CAUSE_CATALOG[c.code]?.zone ?? ''] ??
                CAUSE_CATALOG[c.code]?.zone ??
                '—'
              }}</TableCell>
              <TableCell class="text-sm tabular-nums py-3 px-4">{{ c.count }}</TableCell>
              <TableCell class="text-sm tabular-nums py-3 px-4">{{ c.hours.toFixed(1) }}</TableCell>
              <TableCell class="text-sm font-medium tabular-nums py-3 px-4"
                >{{ c.loss.toLocaleString('ru-RU') }} ₽</TableCell
              >
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>

    <!-- Robot stats -->
    <Card>
      <CardHeader><CardTitle>Инциденты по роботам</CardTitle></CardHeader>
      <CardContent class="p-0">
        <Table>
          <TableHeader
            ><TableRow>
              <TableHead class="py-2 px-4">Робот</TableHead>
              <TableHead class="py-2 px-4">Модель</TableHead>
              <TableHead class="py-2 px-4">Объект</TableHead>
              <TableHead class="py-2 px-4">Инц.</TableHead>
              <TableHead class="py-2 px-4">Простой</TableHead>
              <TableHead class="py-2 px-4">Потери</TableHead>
            </TableRow></TableHeader
          >
          <TableBody>
            <TableRow v-for="rs in robotStats" :key="rs.name" class="row-interactive">
              <TableCell class="font-medium text-sm py-3 px-4">{{ rs.name }}</TableCell>
              <TableCell class="text-xs py-3 px-4">{{ rs.model }}</TableCell>
              <TableCell class="text-xs py-3 px-4">{{ rs.site }}</TableCell>
              <TableCell class="text-sm tabular-nums py-3 px-4">{{ rs.count }}</TableCell>
              <TableCell class="text-sm tabular-nums py-3 px-4"
                >{{ (rs.downtime / 3600).toFixed(1) }} ч</TableCell
              >
              <TableCell class="text-sm font-medium tabular-nums py-3 px-4"
                >{{ rs.loss.toLocaleString('ru-RU') }} ₽</TableCell
              >
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>

    <!-- Визуальный блок: этапы + Гант (bento 2-col), граф потерь fullwidth (итерация 2026-08) -->
    <div class="grid gap-4 lg:grid-cols-2">
      <Card class="card-glass">
        <CardHeader
          ><CardTitle>Задачи по этапам</CardTitle>
          <p class="text-xs text-muted-foreground">
            Инциденты и работы ТОиР по фазам процесса: где скапливается очередь
          </p></CardHeader
        >
        <CardContent>
          <ChartCard
            type="bar-stacked"
            horizontal
            :labels="[...PHASES]"
            :datasets="[
              { label: 'Инциденты', color: '--chart-1', data: phaseData.inc },
              { label: 'Работы ТОиР', color: '--chart-2', data: phaseData.wrk },
            ]"
          />
        </CardContent>
      </Card>

      <Card class="card-glass">
        <CardHeader
          ><CardTitle>Гант работ ТОиР</CardTitle>
          <p class="text-xs text-muted-foreground">
            План и факт по дням относительно сегодняшнего дня; цвет — стадия работы
          </p></CardHeader
        >
        <CardContent>
          <ChartCard
            type="bar"
            horizontal
            suffix=" дн"
            :labels="ganttLabels"
            :datasets="ganttDatasets"
          />
        </CardContent>
      </Card>
    </div>

    <!-- Граф потерь: причина → объект, толщина ленты ∝ потерям -->
    <Card class="card-glass">
      <CardHeader
        ><CardTitle>Потери: причина → объект</CardTitle>
        <p class="text-xs text-muted-foreground">
          Топ-4 причин по потерям и их распределение по объектам; наведите на ленту для суммы
        </p></CardHeader
      >
      <CardContent>
        <LossFlowGraph :links="flowLinks" unit=" ₽" />
      </CardContent>
    </Card>

    <!-- Реакция и восстановление (ACC-021): объяснимые метрики вместо SLA-цифр
         без контекста — определение, норматив, числитель/знаменатель, формула. -->
    <div class="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Реакция на инцидент</CardTitle>
        </CardHeader>
        <CardContent class="space-y-3">
          <div class="flex gap-6">
            <div class="text-center">
              <p class="text-3xl font-bold text-success tabular-nums">
                {{ analytics.sla.reactionMet }}
              </p>
              <p class="text-xs text-muted-foreground">уложились в норматив</p>
            </div>
            <div class="text-center">
              <p class="text-3xl font-bold text-destructive tabular-nums">
                {{ analytics.sla.reactionViolated }}
              </p>
              <p class="text-xs text-muted-foreground">превышен норматив</p>
            </div>
          </div>
          <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs border-t border-border pt-2">
            <dt class="text-muted-foreground">Определение</dt>
            <dd>время от обнаружения инцидента до принятия его в работу координатором</dd>
            <dt class="text-muted-foreground">Норматив</dt>
            <dd>10 минут</dd>
            <dt class="text-muted-foreground">Числитель</dt>
            <dd>инциденты, принятые в работу ≤ 10 мин</dd>
            <dt class="text-muted-foreground">Знаменатель</dt>
            <dd>
              инциденты с зафиксированным временем реакции —
              {{ analytics.sla.reactionMet + analytics.sla.reactionViolated }} (доля в норме:
              {{
                (
                  (analytics.sla.reactionMet /
                    Math.max(1, analytics.sla.reactionMet + analytics.sla.reactionViolated)) *
                  100
                ).toFixed(0)
              }}%)
            </dd>
            <dt class="text-muted-foreground">Источник</dt>
            <dd>FleetOps (история инцидента), 30 дней · детализация — реестр инцидентов</dd>
          </dl>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Восстановление робота</CardTitle>
        </CardHeader>
        <CardContent class="space-y-3">
          <div class="flex gap-6">
            <div class="text-center">
              <p class="text-3xl font-bold text-success tabular-nums">
                {{ analytics.sla.recoveryMet }}
              </p>
              <p class="text-xs text-muted-foreground">уложились в норматив</p>
            </div>
            <div class="text-center">
              <p class="text-3xl font-bold text-destructive tabular-nums">
                {{ analytics.sla.recoveryViolated }}
              </p>
              <p class="text-xs text-muted-foreground">превышен норматив</p>
            </div>
          </div>
          <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs border-t border-border pt-2">
            <dt class="text-muted-foreground">Определение</dt>
            <dd>
              время от обнаружения инцидента до возврата робота в парк (окончание технической
              недоступности)
            </dd>
            <dt class="text-muted-foreground">Норматив</dt>
            <dd>120 минут</dd>
            <dt class="text-muted-foreground">Числитель</dt>
            <dd>возвраты в парк ≤ 120 мин</dd>
            <dt class="text-muted-foreground">Знаменатель</dt>
            <dd>
              закрытые инциденты с технической недоступностью —
              {{ analytics.sla.recoveryMet + analytics.sla.recoveryViolated }} (доля в норме:
              {{
                (
                  (analytics.sla.recoveryMet /
                    Math.max(1, analytics.sla.recoveryMet + analytics.sla.recoveryViolated)) *
                  100
                ).toFixed(0)
              }}%)
            </dd>
            <dt class="text-muted-foreground">Источник</dt>
            <dd>
              FleetOps (контрольные точки), 30 дней · распределение (медиана / среднее / 90-й
              перцентиль) — «Аналитика и экономика»
            </dd>
          </dl>
        </CardContent>
      </Card>
    </div>

    <!-- Breakdown dialog: полноширинная таблица с прокруткой по X и Y, закреплённый заголовок, итог -->
    <Dialog v-model:open="showBreakdown">
      <DialogContent
        class="w-[90%] max-w-[1200px] sm:max-w-[1200px] max-h-[85vh] flex flex-col gap-0 p-0"
      >
        <DialogHeader class="p-6 pb-3 shrink-0">
          <DialogTitle>{{ breakdownTitle }}</DialogTitle>
          <DialogDescription> Расшифровка показателя — {{ siteName }} </DialogDescription>
        </DialogHeader>
        <div class="flex-1 min-h-0 overflow-auto px-6">
          <p class="text-xs text-muted-foreground mb-2">
            Строк: {{ breakdownRows.length }} · Итого:
            {{ breakdownRows.reduce((s, i) => s + i.lossRubles, 0).toLocaleString('ru-RU') }} ₽ ·
            {{ (breakdownRows.reduce((s, i) => s + i.downtimeSeconds, 0) / 3600).toFixed(1) }} ч
          </p>
          <table class="w-max min-w-full border-collapse">
            <thead class="sticky top-0 z-10 bg-background">
              <tr class="border-b">
                <th
                  v-for="h in [
                    'Инцидент',
                    'Наблюдение',
                    'Тип',
                    'Причина',
                    'Объект · зона',
                    'Робот',
                    'Статус',
                    'Простой',
                    'Потери',
                    'Координатор',
                  ]"
                  :key="h"
                  class="text-left text-xs font-medium text-muted-foreground py-2 px-3 whitespace-nowrap"
                >
                  {{ h }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="inc in breakdownRows"
                :key="inc.id"
                class="row-interactive cursor-pointer border-b border-border/40"
                @click="
                  () => {
                    router.push({ name: 'incident-details', params: { incidentId: inc.id } })
                    showBreakdown = false
                  }
                "
              >
                <td class="text-xs py-2 px-3 text-primary whitespace-nowrap">
                  {{ inc.incidentNumber }}
                </td>
                <td class="text-xs py-2 px-3 max-w-[260px]">
                  <span class="truncate block">{{ inc.title }}</span>
                </td>
                <td class="text-xs py-2 px-3 whitespace-nowrap">
                  {{ incidentTypeLabel(inc.incidentTypeCode) }}
                </td>
                <td class="text-xs py-2 px-3 max-w-[200px]">
                  <span class="truncate block">{{ causeLabel(inc.causeCode) }}</span>
                </td>
                <td class="text-xs py-2 px-3 whitespace-nowrap">
                  {{ siteName }} · {{ inc.zoneName ?? '—' }}
                </td>
                <td class="text-xs py-2 px-3 whitespace-nowrap">
                  {{ robots.find((r) => r.id === inc.robotId)?.name ?? '—' }}
                </td>
                <td class="text-xs py-2 px-3 whitespace-nowrap">
                  {{ inc.status === 'CLOSED' ? 'закрыт' : 'в работе' }}
                </td>
                <td class="text-xs tabular-nums py-2 px-3 whitespace-nowrap">
                  {{ (inc.downtimeSeconds / 3600).toFixed(1) }} ч
                </td>
                <td class="text-xs font-medium tabular-nums py-2 px-3 whitespace-nowrap">
                  {{ inc.lossRubles.toLocaleString('ru-RU') }} ₽
                </td>
                <td class="text-xs py-2 px-3 whitespace-nowrap">
                  {{ inc.coordinatorName ?? '—' }}
                </td>
              </tr>
            </tbody>
          </table>
          <p
            v-if="breakdownRows.length === 0"
            class="text-sm text-muted-foreground py-6 text-center"
          >
            Нет инцидентов с подтверждёнными потерями в этой категории.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  </div>
</template>
