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
import { RESPONSIBILITY_ZONE_RU } from '@/data/labels'
import { METRIC_PASSPORTS } from '@/data/metric-passports'
import { useTenantScope } from '@/composables/useTenantScope'
import {
  confirmedLossRubles,
  impactSeconds,
  powerAvailabilityPct,
  techAvailabilityPct,
  techUnavailableSeconds,
} from '@/data/metrics'
import { BookOpen } from 'lucide-vue-next'

// ACC-033/034: каталог паспортов метрик (Отчёт §10.9) — раскрытый на Отчётах.
const showPassports = ref(false)

const { incidents, downtimes, analytics, robots, sites, costRates } = useDemoData()
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

// ACC-023: отчёт показывает только канонические раздельные метрики из metrics.ts.
// Операционное влияние и техническая недоступность нельзя складывать в общий «простой».
const reportMetrics = computed(() => {
  const robotCount = robots.value.filter(
    (r) =>
      scopedSiteIds.value.includes(r.siteId) &&
      (selectedSite.value === 'all' || r.siteId === selectedSite.value),
  ).length
  const selectedDowntimes = filteredDowntimes.value
  return {
    robotCount,
    technicalAvailability: techAvailabilityPct(selectedDowntimes, robotCount),
    powerAvailability: powerAvailabilityPct(selectedDowntimes, robotCount),
    impactHours: impactSeconds(selectedDowntimes) / 3600,
    technicalUnavailableHours: techUnavailableSeconds(selectedDowntimes) / 3600,
    confirmedLoss: confirmedLossRubles(selectedDowntimes),
  }
})

const filteredStats = computed(() => {
  const incs = filteredIncidents.value
  const active = incs.filter((i) => i.status !== 'CLOSED').length
  const unclassified = incs.filter(
    (i) => i.causeMaturity === 'NONE' || i.causeCode === 'CA-060',
  ).length
  return {
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

function exportReport(): void {
  const metrics = reportMetrics.value
  const lines = [
    'ZIMA FleetOps — Управленческий отчёт',
    `Период: последние 30 дней | Объект: ${siteName.value}`,
    `Дата формирования: ${new Date().toLocaleString('ru-RU')}`,
    '',
    '=== СВОДКА ===',
    `Техническая доступность: ${metrics.technicalAvailability.toFixed(2)}% (парк ${metrics.robotCount} × 8 ч × 30 дней)`,
    `Операционная доступность мощности: ${metrics.powerAvailability.toFixed(2)}%`,
    `Подтверждённое операционное влияние: ${metrics.impactHours.toFixed(1)} ч`,
    `Техническая недоступность: ${metrics.technicalUnavailableHours.toFixed(1)} ч`,
    `Подтверждённые потери: ${metrics.confirmedLoss.toLocaleString('ru-RU')} ₽`,
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
          <div class="border border-border rounded-lg p-3">
            <p class="text-muted-foreground text-xs">Техническая доступность</p>
            <p class="text-xl font-bold tabular-nums">
              {{ reportMetrics.technicalAvailability.toFixed(2) }}%
            </p>
          </div>
          <div class="border border-border rounded-lg p-3">
            <p class="text-muted-foreground text-xs">Операционная доступность мощности</p>
            <p class="text-xl font-bold tabular-nums">
              {{ reportMetrics.powerAvailability.toFixed(2) }}%
            </p>
          </div>
          <div class="border border-border rounded-lg p-3">
            <p class="text-muted-foreground text-xs">Подтверждённое операционное влияние</p>
            <p class="text-xl font-bold tabular-nums">
              {{ reportMetrics.impactHours.toFixed(1) }} ч
            </p>
          </div>
          <div class="border border-border rounded-lg p-3">
            <p class="text-muted-foreground text-xs">Техническая недоступность</p>
            <p class="text-xl font-bold tabular-nums">
              {{ reportMetrics.technicalUnavailableHours.toFixed(1) }} ч
            </p>
          </div>
          <div
            class="kpi-clickable border border-border rounded-lg p-3"
            @click="openBreakdown('Подтверждённые потери')"
          >
            <p class="text-muted-foreground text-xs">Подтверждённые потери</p>
            <p class="text-xl font-bold tabular-nums text-destructive">
              {{ reportMetrics.confirmedLoss.toLocaleString('ru-RU') }} ₽
            </p>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- Top causes -->
    <Card>
      <CardHeader><CardTitle>Топ причин по потерям</CardTitle></CardHeader>
      <CardContent class="p-0">
        <Table class="lg:max-2xl:table-fixed lg:max-2xl:[&_td]:px-2 lg:max-2xl:[&_th]:px-2">
          <TableHeader
            ><TableRow>
              <TableHead class="py-2 px-4 lg:max-2xl:w-[34%]">Причина</TableHead>
              <TableHead class="py-2 px-4 lg:max-2xl:w-[26%] lg:max-2xl:whitespace-normal"
                >Зона ответственности</TableHead
              >
              <TableHead class="py-2 px-4 lg:max-2xl:w-18">Случаев</TableHead>
              <TableHead class="py-2 px-4 lg:max-2xl:w-16">Часов</TableHead>
              <TableHead class="py-2 px-4 lg:max-2xl:w-24">Потери</TableHead>
            </TableRow></TableHeader
          >
          <TableBody>
            <TableRow
              v-for="c in topCauses"
              :key="c.code"
              class="row-interactive cursor-pointer"
              @click="router.push({ name: 'incidents', query: { cause: c.code } })"
            >
              <TableCell
                class="text-sm py-3 px-4 lg:max-2xl:whitespace-normal lg:max-2xl:leading-4"
                >{{ causeLabel(c.code) }}</TableCell
              >
              <TableCell
                class="text-xs py-3 px-4 lg:max-2xl:whitespace-normal lg:max-2xl:leading-4"
                :title="RESPONSIBILITY_ZONE_RU[CAUSE_CATALOG[c.code]?.zone ?? 'UNKNOWN']"
                >{{ RESPONSIBILITY_ZONE_RU[CAUSE_CATALOG[c.code]?.zone ?? 'UNKNOWN'] }}</TableCell
              >
              <TableCell class="text-sm tabular-nums py-3 px-4 whitespace-nowrap">{{
                c.count
              }}</TableCell>
              <TableCell class="text-sm tabular-nums py-3 px-4 whitespace-nowrap">{{
                c.hours.toFixed(1)
              }}</TableCell>
              <TableCell class="text-sm font-medium tabular-nums py-3 px-4 whitespace-nowrap"
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

    <!-- Реакция и восстановление (ACC-021): объяснимые метрики вместо SLA-цифр
         без контекста — определение, норматив, числитель/знаменатель, формула. -->
    <div class="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Реакция на инцидент</CardTitle>
          <p class="text-xs text-muted-foreground">
            Определение: время от обнаружения инцидента до принятия его в работу координатором.
            Норматив: 10 минут. Источник: FleetOps (история инцидента), 30 дней.
          </p>
        </CardHeader>
        <CardContent class="space-y-2">
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
          <p class="text-xs text-muted-foreground">
            Числитель: инциденты, принятые в работу ≤ 10 мин. Знаменатель: инциденты с
            зафиксированным временем реакции —
            {{ analytics.sla.reactionMet + analytics.sla.reactionViolated }}. Доля в норме:
            {{
              (
                (analytics.sla.reactionMet /
                  Math.max(1, analytics.sla.reactionMet + analytics.sla.reactionViolated)) *
                100
              ).toFixed(0)
            }}%. Детализация — реестр инцидентов.
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Восстановление робота</CardTitle>
          <p class="text-xs text-muted-foreground">
            Определение: время от обнаружения инцидента до возврата робота в парк (окончание
            технической недоступности). Норматив: 120 минут. Источник: FleetOps (контрольные точки),
            30 дней.
          </p>
        </CardHeader>
        <CardContent class="space-y-2">
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
          <p class="text-xs text-muted-foreground">
            Числитель: возвраты в парк ≤ 120 мин. Знаменатель: закрытые инциденты с технической
            недоступностью —
            {{ analytics.sla.recoveryMet + analytics.sla.recoveryViolated }}. Доля в норме:
            {{
              (
                (analytics.sla.recoveryMet /
                  Math.max(1, analytics.sla.recoveryMet + analytics.sla.recoveryViolated)) *
                100
              ).toFixed(0)
            }}%. Распределение (медиана / среднее / 90-й перцентиль) — «Аналитика и экономика».
          </p>
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
          <DialogDescription>
            Расшифровка показателя — {{ siteName }}. Клик по строке открывает карточку инцидента.
          </DialogDescription>
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
