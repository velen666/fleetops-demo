<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDemoData } from '@/composables/useDemoData'
import { useTenantScope } from '@/composables/useTenantScope'
import type { Downtime } from '@/types/domain'
import {
  DOWNTIME_STATUS_RU,
  DOWNTIME_STATUS_CLASS,
  DOWNTIME_KIND_RU,
  INTERVAL_TYPE_RU,
} from '@/data/labels'
import { causeLabel } from '@/data/generator'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Download } from 'lucide-vue-next'
import { downloadCsv } from '@/lib/csv'

const { downtimes, incidents, sites, robots, substitutions, incidentClock } = useDemoData()
const route = useRoute()
const router = useRouter()

// ─── Фильтры (ТЗ v2.0 §9.1; состояние в URL) ───────────────────────────────

function strParam(v: unknown, fallback: string): string {
  return typeof v === 'string' && v.length > 0 ? v : fallback
}

const filterSite = ref(strParam(route.query.site, 'all'))
const filterRobot = ref(strParam(route.query.robot, 'all'))
const filterBackup = ref(strParam(route.query.backup, 'all'))
const filterCause = ref(strParam(route.query.cause, 'all'))
const filterKind = ref(strParam(route.query.kind, 'all'))
const filterStatus = ref(strParam(route.query.status, 'all'))
const filterType = ref(strParam(route.query.type, 'all'))
const filterQuick = ref(strParam(route.query.quick, 'all'))
const searchText = ref(strParam(route.query.q, ''))

watch(
  [
    filterSite,
    filterRobot,
    filterBackup,
    filterCause,
    filterKind,
    filterStatus,
    filterType,
    filterQuick,
    searchText,
  ],
  ([site, robot, backup, cause, kind, status, type, quick, q]) => {
    void router.replace({
      query: {
        ...(site !== 'all' ? { site } : {}),
        ...(robot !== 'all' ? { robot } : {}),
        ...(backup !== 'all' ? { backup } : {}),
        ...(cause !== 'all' ? { cause } : {}),
        ...(kind !== 'all' ? { kind } : {}),
        ...(status !== 'all' ? { status } : {}),
        ...(type !== 'all' ? { type } : {}),
        ...(quick !== 'all' ? { quick } : {}),
        ...(q ? { q } : {}),
      },
    })
  },
)

// ─── Справочники фильтров ─────────────────────────────────────────────────────

const causeOptions = computed(() => {
  const codes = new Set(
    incidents.value.map((i) => i.causeCode).filter((c): c is string => Boolean(c)),
  )
  return [...codes].sort()
})

const robotOptions = computed(() =>
  robots.value.filter((r) => filterSite.value === 'all' || r.siteId === filterSite.value),
)

// ─── Фильтрация ──────────────────────────────────────────────────────────────

function incidentOf(dt: Downtime) {
  return incidents.value.find((i) => i.id === dt.incidentId)
}

function causeOf(dt: Downtime): string | null {
  return incidentOf(dt)?.causeCode ?? null
}

// Tenant-модель (§3): интервалы только разрешённых объектов.
const scope = useTenantScope()
const scopedDowntimes = scope.downtimes(downtimes.value)
const scopedSites = scope.sites(sites.value)

const filtered = computed(() => {
  let list = scopedDowntimes.value
  if (filterSite.value !== 'all') list = list.filter((d) => d.siteId === filterSite.value)
  if (filterRobot.value !== 'all') list = list.filter((d) => d.robotId === filterRobot.value)
  // Резервный робот (ТЗ §9.1): интервалы инцидентов, где он был резервом.
  if (filterBackup.value !== 'all')
    list = list.filter((d) =>
      substitutions.value.some(
        (s) => s.backupRobotId === filterBackup.value && s.incidentId === d.incidentId,
      ),
    )
  if (filterCause.value !== 'all') list = list.filter((d) => causeOf(d) === filterCause.value)
  if (filterKind.value !== 'all') list = list.filter((d) => d.kind === filterKind.value)
  if (filterStatus.value !== 'all')
    list = list.filter((d) => d.confirmationStatus === filterStatus.value)
  // Тип интервала: операционное влияние / техническая недоступность.
  if (filterType.value !== 'all') list = list.filter((d) => d.intervalType === filterType.value)

  // Быстрые представления (ТЗ §9.1)
  switch (filterQuick.value) {
    case 'operational':
      list = list.filter((d) => d.intervalType === 'OPERATIONAL_IMPACT')
      break
    case 'technical':
      list = list.filter((d) => d.intervalType === 'TECHNICAL_UNAVAILABLE')
      break
    case 'open':
      list = list.filter((d) => d.intervalState === 'OPEN')
      break
    case 'needs_confirm':
      list = list.filter(
        (d) => !['CONFIRMED', 'ADJUSTED', 'REJECTED'].includes(d.confirmationStatus),
      )
      break
    case 'top_loss': {
      const withLoss = list.filter((d) => d.lossRubles > 0)
      withLoss.sort((a, b) => b.lossRubles - a.lossRubles)
      return withLoss.slice(0, 10)
    }
    case 'organizational':
      list = list.filter((d) => d.kind === 'ORGANIZATIONAL')
      break
    case 'infrastructure':
      list = list.filter((d) => d.kind === 'INFRASTRUCTURE')
      break
    default:
      break
  }

  if (searchText.value.trim()) {
    const s = searchText.value.trim().toLowerCase()
    list = list.filter((d) => {
      const inc = incidentOf(d)
      return (
        inc?.incidentNumber.toLowerCase().includes(s) === true ||
        inc?.title.toLowerCase().includes(s) === true ||
        (d.zoneName ?? '').toLowerCase().includes(s)
      )
    })
  }
  return [...list].sort((a, b) => b.startedAt.localeCompare(a.startedAt))
})

// ─── Сводка выборки (ТЗ §9.1: часы по типам раздельно) ─────────────────────

const summary = computed(() => {
  const list = filtered.value
  const confirmed = list.filter(
    (d) => d.confirmationStatus === 'CONFIRMED' || d.confirmationStatus === 'ADJUSTED',
  )
  const impact = confirmed.filter((d) => d.intervalType === 'OPERATIONAL_IMPACT')
  const tech = confirmed.filter((d) => d.intervalType === 'TECHNICAL_UNAVAILABLE')
  const durations = impact.map((d) => d.accountableDurationSeconds).sort((a, b) => a - b)
  const median = durations.length > 0 ? (durations[Math.floor(durations.length / 2)] ?? 0) : 0
  const longest = impact.reduce<Downtime | null>(
    (max, d) => (!max || d.accountableDurationSeconds > max.accountableDurationSeconds ? d : max),
    null,
  )
  return {
    count: list.length,
    confirmedCount: confirmed.length,
    impactCount: impact.length,
    techCount: tech.length,
    impactHours: impact.reduce((s, d) => s + d.accountableDurationSeconds, 0) / 3600,
    techHours: tech.reduce((s, d) => s + d.accountableDurationSeconds, 0) / 3600,
    openCount: list.filter((d) => d.intervalState === 'OPEN').length,
    needsConfirm: list.filter(
      (d) => !['CONFIRMED', 'ADJUSTED', 'REJECTED'].includes(d.confirmationStatus),
    ).length,
    // Потери процесса — только по подтверждённому операционному влиянию.
    loss: impact.reduce((s, d) => s + d.lossRubles, 0),
    avgHours:
      impact.length > 0
        ? impact.reduce((s, d) => s + d.accountableDurationSeconds, 0) / impact.length / 3600
        : 0,
    medianHours: median / 3600,
    longestId: longest?.incidentId ?? null,
  }
})

const QUICK_VIEWS: Array<{ key: string; label: string }> = [
  { key: 'all', label: 'Все' },
  { key: 'operational', label: 'Операционное влияние' },
  { key: 'technical', label: 'Техническая недоступность' },
  { key: 'open', label: 'Открытые сейчас' },
  { key: 'needs_confirm', label: 'Требуют подтверждения' },
  { key: 'top_loss', label: 'Крупнейшие потери' },
  { key: 'organizational', label: 'Организационные' },
  { key: 'infrastructure', label: 'Инфраструктурные' },
]

// Резервные роботы, участвовавшие в замещениях (фильтр §9.1).
const backupOptions = computed(() => {
  const ids = new Set(substitutions.value.map((s) => s.backupRobotId))
  return robots.value.filter((r) => ids.has(r.id))
})

// ─── Отображение ────────────────────────────────────────────────────────────

function siteName(id: string): string {
  return sites.value.find((s) => s.id === id)?.name ?? id
}
function robotName(id: string | null): string {
  if (!id) return '—'
  return robots.value.find((r) => r.id === id)?.name ?? id
}
function incidentNumber(incidentId: string): string {
  return incidentOf({ incidentId } as Downtime)?.incidentNumber ?? incidentId
}
function fmtTime(iso: string): string {
  return iso.slice(0, 16).replace('T', ' ')
}
function fmtDur(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  return h > 0 ? `${h} ч ${m} мин` : `${m} мин`
}

/** Текущая длительность открытого простоя по сценарному времени инцидента. */
function openDuration(dt: Downtime): number {
  const nowIso = incidentClock(dt.incidentId)
  return Math.max(0, Math.round((Date.parse(nowIso) - Date.parse(dt.startedAt)) / 1000))
}
function goToIncident(incidentId: string): void {
  router.push({ name: 'incident-details', params: { incidentId } })
}

function exportCsv(): void {
  const rows = filtered.value.map((d) => [
    incidentNumber(d.incidentId),
    INTERVAL_TYPE_RU[d.intervalType] ?? d.intervalType,
    siteName(d.siteId),
    d.zoneName ?? '',
    robotName(d.robotId),
    d.startedAt.slice(0, 19).replace('T', ' '),
    d.endedAt ? d.endedAt.slice(0, 19).replace('T', ' ') : 'продолжается',
    (d.accountableDurationSeconds / 3600).toFixed(2),
    DOWNTIME_KIND_RU[d.kind],
    causeLabel(causeOf(d)),
    DOWNTIME_STATUS_RU[d.confirmationStatus],
    d.lossRubles > 0 ? d.ratePerHour : 0,
    d.lossRubles,
  ])
  downloadCsv(
    `downtimes-${new Date().toISOString().slice(0, 10)}.csv`,
    [
      'Инцидент',
      'Тип учёта',
      'Объект',
      'Зона',
      'Робот',
      'Начало',
      'Окончание',
      'Часы',
      'Характер',
      'Причина',
      'Статус',
      'Ставка',
      'Потери',
    ],
    rows,
  )
}
</script>

<template>
  <div class="space-y-4">
    <!-- Быстрые представления -->
    <div class="flex flex-wrap gap-2">
      <Button
        v-for="q in QUICK_VIEWS.filter((x) => x.key !== 'all')"
        :key="q.key"
        :variant="filterQuick === q.key ? 'default' : 'outline'"
        size="sm"
        class="min-h-9"
        @click="filterQuick = filterQuick === q.key ? 'all' : q.key"
      >
        {{ q.label }}
      </Button>
    </div>

    <!-- Фильтры -->
    <div class="flex flex-wrap items-end gap-3">
      <div class="space-y-1">
        <span class="text-xs text-muted-foreground block">Объект</span>
        <Select v-model="filterSite" aria-label="Фильтр по объекту">
          <SelectTrigger class="w-[170px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все</SelectItem>
            <SelectItem v-for="s in scopedSites" :key="s.id" :value="s.id">{{ s.name }}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div class="space-y-1">
        <span class="text-xs text-muted-foreground block">Тип учёта</span>
        <Select v-model="filterType" aria-label="Фильтр по типу учёта">
          <SelectTrigger class="w-[230px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все типы</SelectItem>
            <SelectItem value="OPERATIONAL_IMPACT">Операционное влияние</SelectItem>
            <SelectItem value="TECHNICAL_UNAVAILABLE">Техническая недоступность</SelectItem>
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
      <div v-if="backupOptions.length > 0" class="space-y-1">
        <span class="text-xs text-muted-foreground block">Резервный робот</span>
        <Select v-model="filterBackup" aria-label="Фильтр по резервному роботу">
          <SelectTrigger class="w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все</SelectItem>
            <SelectItem v-for="r in backupOptions" :key="r.id" :value="r.id">{{
              r.name
            }}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div class="space-y-1">
        <span class="text-xs text-muted-foreground block">Причина (через инцидент)</span>
        <Select v-model="filterCause" aria-label="Фильтр по причине">
          <SelectTrigger class="w-[220px]" aria-label="Фильтр по причине"
            ><SelectValue
          /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все</SelectItem>
            <SelectItem v-for="c in causeOptions" :key="c" :value="c">{{
              causeLabel(c)
            }}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div class="space-y-1">
        <span class="text-xs text-muted-foreground block">Характер</span>
        <Select v-model="filterKind" aria-label="Фильтр по характеру простоя">
          <SelectTrigger class="w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все</SelectItem>
            <SelectItem value="UNPLANNED_TECHNICAL">Внеплановый технический</SelectItem>
            <SelectItem value="INFRASTRUCTURE">Инфраструктурный</SelectItem>
            <SelectItem value="ORGANIZATIONAL">Организационный / процессный</SelectItem>
            <SelectItem value="ACCIDENT_SAFETY">Аварийный / безопасность</SelectItem>
            <SelectItem value="PLANNED_MAINTENANCE">Плановое обслуживание</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div class="space-y-1">
        <span class="text-xs text-muted-foreground block">Статус подтверждения</span>
        <Select v-model="filterStatus" aria-label="Фильтр по статусу подтверждения">
          <SelectTrigger class="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все</SelectItem>
            <SelectItem value="PROPOSED">Предложен</SelectItem>
            <SelectItem value="CONFIRMED">Подтверждён</SelectItem>
            <SelectItem value="ADJUSTED">Скорректирован</SelectItem>
            <SelectItem value="REJECTED">Отклонён</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div class="space-y-1 flex-1 min-w-[180px]">
        <span class="text-xs text-muted-foreground block">Поиск</span>
        <Input
          v-model="searchText"
          aria-label="Поиск по простоям"
          placeholder="Инцидент, зона, описание..."
        />
      </div>
    </div>

    <!-- Сводка текущей выборки (ТЗ §9.1: часы и потери по типам раздельно) -->
    <div class="flex flex-wrap gap-4 text-sm text-muted-foreground">
      <span
        >Записей:
        <strong class="text-foreground tabular-nums">{{ summary.count }}</strong>
        <span class="text-xs text-muted-foreground"
          >(подтверждено {{ summary.confirmedCount }}: влияние {{ summary.impactCount }} ·
          недоступность {{ summary.techCount }})</span
        ></span
      >
      <span
        >Операционное влияние:
        <strong class="text-foreground tabular-nums">{{ summary.impactHours.toFixed(1) }}</strong>
        ч</span
      >
      <span
        >Техническая недоступность:
        <strong class="text-foreground tabular-nums">{{ summary.techHours.toFixed(1) }}</strong>
        ч</span
      >
      <span
        >Потери процесса:
        <strong class="text-destructive tabular-nums"
          >{{ summary.loss.toLocaleString('ru-RU') }} ₽</strong
        ></span
      >
      <span
        >Открытых:
        <strong class="text-foreground tabular-nums">{{ summary.openCount }}</strong></span
      >
      <span
        >Требуют подтверждения:
        <strong class="text-warning tabular-nums">{{ summary.needsConfirm }}</strong></span
      >
      <span class="text-xs"
        >средняя {{ summary.avgHours.toFixed(1) }} ч · медианная
        {{ summary.medianHours.toFixed(1) }} ч</span
      >
      <Button size="sm" variant="outline" class="min-h-8 h-8" @click="exportCsv"
        ><Download class="size-3.5 mr-1" /> Экспорт CSV</Button
      >
      <button
        v-if="summary.longestId"
        type="button"
        class="text-primary text-xs underline underline-offset-2"
        @click="goToIncident(summary.longestId)"
      >
        самый длительный →
      </button>
    </div>

    <Card>
      <CardContent class="p-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Инцидент</TableHead>
              <TableHead>Тип учёта</TableHead>
              <TableHead>Объект · зона</TableHead>
              <TableHead>Робот</TableHead>
              <TableHead>Начало</TableHead>
              <TableHead>Окончание</TableHead>
              <TableHead>Длительность</TableHead>
              <TableHead>Характер</TableHead>
              <TableHead>Причина</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead>Формула потерь</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableEmpty v-if="filtered.length === 0" :colspan="12">
              По выбранным фильтрам записей нет.
            </TableEmpty>
            <TableRow
              v-for="dt in filtered"
              :key="dt.id"
              class="row-interactive cursor-pointer"
              @click="goToIncident(dt.incidentId)"
            >
              <TableCell class="text-xs text-primary py-2 px-3">{{
                incidentNumber(dt.incidentId)
              }}</TableCell>
              <TableCell class="py-2 px-3">
                <span
                  class="text-xs rounded px-1.5 py-0.5"
                  :class="
                    dt.intervalType === 'OPERATIONAL_IMPACT'
                      ? 'bg-destructive/15 text-destructive'
                      : 'bg-muted text-muted-foreground'
                  "
                  >{{
                    dt.intervalType === 'OPERATIONAL_IMPACT'
                      ? 'Операционное влияние'
                      : 'Техническая недоступность'
                  }}</span
                >
              </TableCell>
              <TableCell class="text-xs py-2 px-3"
                >{{ siteName(dt.siteId)
                }}<span v-if="dt.zoneName" class="text-muted-foreground"> · {{ dt.zoneName }}</span>
              </TableCell>
              <TableCell class="text-xs py-2 px-3">{{ robotName(dt.robotId) }}</TableCell>
              <TableCell class="text-xs font-mono tabular-nums py-2 px-3">{{
                fmtTime(dt.startedAt)
              }}</TableCell>
              <TableCell class="text-xs font-mono tabular-nums py-2 px-3">
                <span v-if="dt.endedAt">{{ fmtTime(dt.endedAt) }}</span>
                <span v-else class="text-warning">продолжается</span>
              </TableCell>
              <TableCell class="text-xs tabular-nums py-2 px-3">
                <!-- Открытый простой: «идёт» + сценарная текущая длительность (ACC-015). -->
                <template v-if="dt.intervalState === 'OPEN' && !dt.endedAt">
                  <span class="text-warning">идёт {{ fmtDur(openDuration(dt)) }}</span>
                </template>
                <template v-else>{{ fmtDur(dt.accountableDurationSeconds) }}</template>
              </TableCell>
              <TableCell class="text-xs text-muted-foreground py-2 px-3">{{
                DOWNTIME_KIND_RU[dt.kind]
              }}</TableCell>
              <TableCell class="text-xs py-2 px-3 max-w-[180px]">
                <span class="truncate block">{{ causeLabel(causeOf(dt)) }}</span>
              </TableCell>
              <TableCell class="py-2 px-3">
                <span
                  class="text-xs rounded px-1.5 py-0.5"
                  :class="DOWNTIME_STATUS_CLASS[dt.confirmationStatus]"
                  >{{ DOWNTIME_STATUS_RU[dt.confirmationStatus] }}</span
                >
              </TableCell>
              <TableCell class="text-xs tabular-nums py-2 px-3 whitespace-nowrap">
                <span v-if="dt.lossRubles > 0" class="font-medium"
                  >{{ (dt.accountableDurationSeconds / 3600).toFixed(2) }} ч ×
                  {{ dt.ratePerHour.toLocaleString('ru-RU') }} ₽/ч =
                  {{ dt.lossRubles.toLocaleString('ru-RU') }} ₽</span
                >
                <span
                  v-else-if="dt.intervalType === 'TECHNICAL_UNAVAILABLE'"
                  class="text-muted-foreground"
                  >без начисления потерь</span
                >
                <span v-else class="text-muted-foreground">—</span>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  </div>
</template>
