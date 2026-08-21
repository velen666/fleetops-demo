<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDemoData } from '@/composables/useDemoData'
import type { Downtime } from '@/types/domain'
import { DOWNTIME_STATUS_RU, DOWNTIME_STATUS_CLASS, DOWNTIME_KIND_RU } from '@/data/labels'
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

const { downtimes, incidents, sites, robots } = useDemoData()
const route = useRoute()
const router = useRouter()

// ─── Фильтры (ТЗ §31; состояние в URL — прямая ссылка сохраняет выборку) ────

function strParam(v: unknown, fallback: string): string {
  return typeof v === 'string' && v.length > 0 ? v : fallback
}

const filterSite = ref(strParam(route.query.site, 'all'))
const filterRobot = ref(strParam(route.query.robot, 'all'))
const filterCause = ref(strParam(route.query.cause, 'all'))
const filterKind = ref(strParam(route.query.kind, 'all'))
const filterStatus = ref(strParam(route.query.status, 'all'))
const filterQuick = ref(strParam(route.query.quick, 'all'))
const searchText = ref(strParam(route.query.q, ''))

watch(
  [filterSite, filterRobot, filterCause, filterKind, filterStatus, filterQuick, searchText],
  ([site, robot, cause, kind, status, quick, q]) => {
    void router.replace({
      query: {
        ...(site !== 'all' ? { site } : {}),
        ...(robot !== 'all' ? { robot } : {}),
        ...(cause !== 'all' ? { cause } : {}),
        ...(kind !== 'all' ? { kind } : {}),
        ...(status !== 'all' ? { status } : {}),
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

const filtered = computed(() => {
  let list = downtimes.value
  if (filterSite.value !== 'all') list = list.filter((d) => d.siteId === filterSite.value)
  if (filterRobot.value !== 'all') list = list.filter((d) => d.robotId === filterRobot.value)
  if (filterCause.value !== 'all') list = list.filter((d) => causeOf(d) === filterCause.value)
  if (filterKind.value !== 'all') list = list.filter((d) => d.kind === filterKind.value)
  if (filterStatus.value !== 'all')
    list = list.filter((d) => d.confirmationStatus === filterStatus.value)

  // Быстрые представления (ТЗ §31)
  switch (filterQuick.value) {
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

// ─── Сводка выборки (ТЗ §31) ─────────────────────────────────────────────────

const summary = computed(() => {
  const list = filtered.value
  const confirmed = list.filter(
    (d) => d.confirmationStatus === 'CONFIRMED' || d.confirmationStatus === 'ADJUSTED',
  )
  const durations = confirmed.map((d) => d.accountableDurationSeconds).sort((a, b) => a - b)
  const median = durations.length > 0 ? (durations[Math.floor(durations.length / 2)] ?? 0) : 0
  const longest = confirmed.reduce<Downtime | null>(
    (max, d) => (!max || d.accountableDurationSeconds > max.accountableDurationSeconds ? d : max),
    null,
  )
  return {
    count: list.length,
    confirmedCount: confirmed.length,
    confirmedHours: confirmed.reduce((s, d) => s + d.accountableDurationSeconds, 0) / 3600,
    openCount: list.filter((d) => d.intervalState === 'OPEN').length,
    needsConfirm: list.filter(
      (d) => !['CONFIRMED', 'ADJUSTED', 'REJECTED'].includes(d.confirmationStatus),
    ).length,
    loss: confirmed.reduce((s, d) => s + d.lossRubles, 0),
    avgHours:
      confirmed.length > 0
        ? confirmed.reduce((s, d) => s + d.accountableDurationSeconds, 0) / confirmed.length / 3600
        : 0,
    medianHours: median / 3600,
    longestId: longest?.incidentId ?? null,
  }
})

const QUICK_VIEWS: Array<{ key: string; label: string }> = [
  { key: 'all', label: 'Все' },
  { key: 'open', label: 'Открытые сейчас' },
  { key: 'needs_confirm', label: 'Требуют подтверждения' },
  { key: 'top_loss', label: 'Крупнейшие потери' },
  { key: 'organizational', label: 'Организационные' },
  { key: 'infrastructure', label: 'Инфраструктурные' },
]

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
function goToIncident(incidentId: string): void {
  router.push({ name: 'incident-details', params: { incidentId } })
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
            <SelectItem v-for="s in sites" :key="s.id" :value="s.id">{{ s.name }}</SelectItem>
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
      <div class="space-y-1">
        <span class="text-xs text-muted-foreground block">Причина (через инцидент)</span>
        <Select v-model="filterCause" aria-label="Фильтр по причине">
          <SelectTrigger class="w-[220px]"><SelectValue /></SelectTrigger>
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
        <span class="text-xs text-muted-foreground block">Статус интервала</span>
        <Select v-model="filterStatus" aria-label="Фильтр по статусу интервала">
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

    <!-- Сводка текущей выборки -->
    <div class="flex flex-wrap gap-4 text-sm text-muted-foreground">
      <span
        >Интервалов:
        <strong class="text-foreground tabular-nums">{{ summary.count }}</strong>
        <span class="text-xs">(подтверждённых: {{ summary.confirmedCount }})</span></span
      >
      <span
        >Подтверждённые часы:
        <strong class="text-foreground tabular-nums">{{
          summary.confirmedHours.toFixed(1)
        }}</strong></span
      >
      <span
        >Потери:
        <strong class="text-foreground tabular-nums"
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
              <TableHead>Объект · зона</TableHead>
              <TableHead>Робот</TableHead>
              <TableHead>Начало</TableHead>
              <TableHead>Окончание</TableHead>
              <TableHead>Длительность</TableHead>
              <TableHead>Характер</TableHead>
              <TableHead>Причина</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead>Ставка</TableHead>
              <TableHead>Потери</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableEmpty v-if="filtered.length === 0" :colspan="11">
              По выбранным фильтрам интервалов нет.
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
              <TableCell class="text-xs tabular-nums py-2 px-3">{{
                fmtDur(dt.accountableDurationSeconds)
              }}</TableCell>
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
              <TableCell class="text-xs tabular-nums text-muted-foreground py-2 px-3"
                >{{ dt.ratePerHour.toLocaleString('ru-RU') }} ₽/ч</TableCell
              >
              <TableCell class="text-xs font-medium tabular-nums py-2 px-3">{{
                dt.lossRubles > 0 ? `${dt.lossRubles.toLocaleString('ru-RU')} ₽` : '—'
              }}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  </div>
</template>
