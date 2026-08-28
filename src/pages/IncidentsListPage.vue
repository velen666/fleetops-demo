<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useDemoData } from '@/composables/useDemoData'
import { useTenantScope } from '@/composables/useTenantScope'
import { incidentTypeLabel, causeLabel } from '@/data/generator'
import type { Downtime } from '@/types/domain'
import { INCIDENT_STATUS_RU, INCIDENT_STATUS_CLASS } from '@/data/labels'
import { useAuthStore } from '@/stores/auth'
import { useSavedViews } from '@/composables/useSavedViews'
import { downloadCsv } from '@/lib/csv'
import { useRoute, useRouter } from 'vue-router'
import { Plus, RotateCcw, Download, Star } from 'lucide-vue-next'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
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
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

const {
  incidents,
  sites,
  robots,
  downtimes,
  maintenance,
  substitutions,
  createManualIncident,
  nextStep,
  resetDemo,
} = useDemoData()
const auth = useAuthStore()

const STATUS_RU = INCIDENT_STATUS_RU
// TZ v1.6 §11: фильтры в URL — прямая ссылка и возврат сохраняют выборку.
const route = useRoute()
const router = useRouter()

function strParam(v: unknown, fallback: string): string {
  return typeof v === 'string' && v.length > 0 ? v : fallback
}

const activeQueue = ref<string>(strParam(route.query.queue, 'all'))
const filterSite = ref(strParam(route.query.site, 'all'))
const filterStatus = ref(strParam(route.query.status, 'all'))
const filterCause = ref(strParam(route.query.cause, 'all'))
const searchText = ref(strParam(route.query.q, ''))
// ACC-009 (Отчёт §4.2): период, зона, робот, вендор, приоритет, координатор,
// вид простоя — полный набор из ТЗ §8.3, сохраняются в URL.
const filterPeriod = ref(strParam(route.query.period, '30'))
const filterZone = ref(strParam(route.query.zone, 'all'))
const filterRobot = ref(strParam(route.query.robot, 'all'))
const filterVendor = ref(strParam(route.query.vendor, 'all'))
const filterPriority = ref(strParam(route.query.priority, 'all'))
const filterCoordinator = ref(strParam(route.query.coordinator, 'all'))
const filterDowntimeKind = ref(strParam(route.query.dt, 'all'))

watch(
  [
    activeQueue,
    filterSite,
    filterStatus,
    filterCause,
    searchText,
    filterPeriod,
    filterZone,
    filterRobot,
    filterVendor,
    filterPriority,
    filterCoordinator,
    filterDowntimeKind,
  ],
  ([queue, site, status, cause, q, period, zone, robot, vendor, priority, coordinator, dt]) => {
    void router.replace({
      query: {
        ...(queue !== 'all' ? { queue } : {}),
        ...(site !== 'all' ? { site } : {}),
        ...(status !== 'all' ? { status } : {}),
        ...(cause !== 'all' ? { cause } : {}),
        ...(q ? { q } : {}),
        ...(period !== '30' ? { period } : {}),
        ...(zone !== 'all' ? { zone } : {}),
        ...(robot !== 'all' ? { robot } : {}),
        ...(vendor !== 'all' ? { vendor } : {}),
        ...(priority !== 'all' ? { priority } : {}),
        ...(coordinator !== 'all' ? { coordinator } : {}),
        ...(dt !== 'all' ? { dt } : {}),
      },
    })
  },
  { deep: false },
)

interface Queue {
  key: string
  label: string
  filter: (i: (typeof incidents.value)[0]) => boolean
}

// Быстрые представления (ТЗ v2.0 §8.3): каждое — только подходящие инциденты.
const openTech = (i: (typeof incidents.value)[0]) =>
  downtimes.value.some(
    (d) =>
      d.incidentId === i.id &&
      d.intervalType === 'TECHNICAL_UNAVAILABLE' &&
      d.intervalState === 'OPEN',
  )
const processRestored = (i: (typeof incidents.value)[0]) => {
  const sub = substitutions.value.find((s) => s.incidentId === i.id)
  if (sub) return sub.processRestoredAt != null
  const impact = downtimes.value.find(
    (d) => d.incidentId === i.id && d.intervalType === 'OPERATIONAL_IMPACT',
  )
  return !impact || impact.intervalState === 'CLOSED'
}
const inService = (robotId: string | null) =>
  !!robotId &&
  maintenance.value.some(
    (m) => m.robotId === robotId && ['IN_PROGRESS', 'ASSIGNED', 'WAITING_PARTS'].includes(m.status),
  )

const queues: Queue[] = [
  {
    key: 'needs_review',
    label: 'Требует разбора',
    filter: (i) => i.status === 'OPEN' || (i.status !== 'CLOSED' && !i.safetyConfirmedAt),
  },
  {
    key: 'no_coordinator',
    label: 'Без координатора',
    filter: (i) => i.status !== 'CLOSED' && !i.coordinatorName,
  },
  {
    key: 'need_substitution',
    label: 'Нужно замещение',
    filter: (i) =>
      i.status !== 'CLOSED' &&
      openTech(i) &&
      !substitutions.value.some((s) => s.incidentId === i.id),
  },
  {
    key: 'process_not_restored',
    label: 'Процесс не восстановлен',
    filter: (i) => i.status !== 'CLOSED' && !processRestored(i),
  },
  {
    key: 'cause_unconfirmed',
    label: 'Причина не подтверждена',
    filter: (i) => i.status !== 'CLOSED' && i.causeMaturity !== 'FINAL',
  },
  {
    key: 'in_service',
    label: 'В сервисе / ремонте',
    filter: (i) => i.status !== 'CLOSED' && openTech(i) && inService(i.robotId),
  },
  {
    key: 'waiting_parts',
    label: 'Ожидает запчасти',
    filter: (i) =>
      i.status !== 'CLOSED' &&
      !!i.robotId &&
      maintenance.value.some((m) => m.robotId === i.robotId && m.status === 'WAITING_PARTS'),
  },
  {
    key: 'ready_return',
    label: 'Готов к возврату',
    filter: (i) =>
      i.status !== 'CLOSED' &&
      openTech(i) &&
      i.recoveryConfirmed &&
      maintenance.value.some(
        (m) =>
          m.robotId === i.robotId &&
          (m.status === 'DONE' || (m.status === 'IN_PROGRESS' && m.testRunPassed === true)),
      ),
  },
  {
    key: 'ready_to_close',
    label: 'Готов к закрытию',
    filter: (i) =>
      i.status === 'READY_TO_CLOSE' ||
      (i.status !== 'CLOSED' &&
        !openTech(i) &&
        processRestored(i) &&
        i.causeMaturity === 'FINAL' &&
        i.recoveryConfirmed),
  },
  { key: 'all', label: 'Все', filter: () => true },
]

// Tenant-модель (§3): база реестра и очередей — только разрешённые объекты роли.
const scope = useTenantScope()
const scopedIncidents = scope.incidents(incidents.value)
const scopedSites = scope.sites(sites.value)
const scopedRobots = scope.robots(robots.value)

// Опции фильтров (ACC-009): зоны/роботы/вендоры текущей области роли.
const zoneOptions = computed(() => {
  const codes = new Set<string>()
  for (const i of scopedIncidents.value) {
    const code = i.zoneName?.split(' ')[0]
    if (code) codes.add(code)
  }
  return [...codes].sort()
})
const robotOptions = computed(() => scopedRobots.value.map((r) => ({ id: r.id, name: r.name })))
const vendorOptions = computed(() => [...new Set(scopedRobots.value.map((r) => r.vendor))].sort())
const coordinatorOptions = computed(() => {
  const names = new Set<string>()
  for (const i of scopedIncidents.value) if (i.coordinatorName) names.add(i.coordinatorName)
  return [...names].sort()
})

const queueCounts = computed(() => {
  const counts: Record<string, number> = {}
  for (const q of queues) {
    counts[q.key] = scopedIncidents.value.filter(q.filter).length
  }
  return counts
})

const filteredIncidents = computed(() => {
  let result = scopedIncidents.value
  if (activeQueue.value !== 'all') {
    const q = queues.find((x) => x.key === activeQueue.value)
    if (q) result = result.filter(q.filter)
  }
  if (filterSite.value !== 'all') result = result.filter((i) => i.siteId === filterSite.value)
  if (filterStatus.value !== 'all') result = result.filter((i) => i.status === filterStatus.value)
  if (filterCause.value !== 'all') result = result.filter((i) => i.causeCode === filterCause.value)
  // ACC-009: период от сегодня назад по detectedAt.
  if (filterPeriod.value !== 'all') {
    const days = Number(filterPeriod.value)
    if (Number.isFinite(days) && days > 0) {
      const from = Date.now() - days * 86_400_000
      result = result.filter((i) => Date.parse(i.detectedAt) >= from)
    }
  }
  if (filterZone.value !== 'all')
    result = result.filter((i) => (i.zoneName ?? '').startsWith(filterZone.value))
  if (filterRobot.value !== 'all') result = result.filter((i) => i.robotId === filterRobot.value)
  if (filterVendor.value !== 'all') {
    const robotIds = new Set(
      scopedRobots.value.filter((r) => r.vendor === filterVendor.value).map((r) => r.id),
    )
    result = result.filter((i) => i.robotId != null && robotIds.has(i.robotId))
  }
  if (filterPriority.value !== 'all')
    result = result.filter((i) => i.severity === filterPriority.value)
  if (filterCoordinator.value !== 'all') {
    result = result.filter((i) =>
      filterCoordinator.value === '__none__'
        ? !i.coordinatorName
        : i.coordinatorName === filterCoordinator.value,
    )
  }
  if (filterDowntimeKind.value !== 'all') {
    // ACC-009: вид простоя — «с влиянием на процесс» / «технедоступность».
    const byIncident = new Map<string, Downtime[]>()
    for (const d of downtimes.value) {
      if (!d.incidentId) continue
      byIncident.set(d.incidentId, [...(byIncident.get(d.incidentId) ?? []), d])
    }
    result = result.filter((i) => {
      const dts = byIncident.get(i.id) ?? []
      return filterDowntimeKind.value === 'impact'
        ? dts.some((d) => d.intervalType === 'OPERATIONAL_IMPACT')
        : dts.some((d) => d.intervalType === 'TECHNICAL_UNAVAILABLE')
    })
  }
  if (searchText.value.trim()) {
    const s = searchText.value.trim().toLowerCase()
    result = result.filter(
      (i) =>
        i.incidentNumber.toLowerCase().includes(s) ||
        i.title.toLowerCase().includes(s) ||
        i.description.toLowerCase().includes(s),
    )
  }
  return result.sort((a, b) => b.detectedAt.localeCompare(a.detectedAt))
})

const summary = computed(() => {
  const list = filteredIncidents.value
  return {
    count: list.length,
    confirmedDowntime: list
      .filter((i) => i.downtimeConfirmed)
      .reduce((s, i) => s + i.downtimeSeconds, 0),
    loss: list.filter((i) => i.downtimeConfirmed).reduce((s, i) => s + i.lossRubles, 0),
  }
})

function siteName(id: string): string {
  return sites.value.find((s) => s.id === id)?.name ?? id
}
function robotName(id: string | null): string {
  return id ? (robots.value.find((r) => r.id === id)?.name ?? id) : '—'
}
function fmtDur(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  return h > 0 ? `${h} ч ${m} мин` : `${m} мин`
}
function goTo(id: string): void {
  router.push({ name: 'incident-details', params: { incidentId: id } })
}

function stepLabelOf(id: string): string | null {
  return nextStep(id)?.label ?? null
}

// ─── Ручное создание инцидента (ТЗ §15) ──────────────────────────────────────

const showCreate = ref(false)
const createSite = ref('')
const createZone = ref('')
const createRobot = ref('__none__')
const createSeverity = ref<string>('MEDIUM')
const createObservation = ref('')
const createWithDowntime = ref(true)

function openCreate(): void {
  createSite.value = sites.value[0]?.id ?? ''
  createZone.value = ''
  createRobot.value = '__none__'
  createSeverity.value = 'MEDIUM'
  createObservation.value = ''
  createWithDowntime.value = true
  showCreate.value = true
}

function submitCreate(): void {
  if (!createSite.value || !createZone.value.trim() || !createObservation.value.trim()) return
  const created = createManualIncident({
    siteId: createSite.value,
    zoneName: createZone.value.trim(),
    robotId: createRobot.value === '__none__' ? null : createRobot.value,
    observation: createObservation.value.trim(),
    severity: createSeverity.value as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
    actorName: auth.user?.name ?? 'Демо-пользователь',
    hasDowntime: createWithDowntime.value,
  })
  showCreate.value = false
  router.push({ name: 'incident-details', params: { incidentId: created.id } })
}

const robotsForSite = computed(() =>
  robots.value.filter((r) => !createSite.value || r.siteId === createSite.value),
)

// ─── Сохранённые представления + экспорт (§20-H) ─────────────────────────────

const { views: savedViews, save: saveView, remove: removeView } = useSavedViews('incidents')

const showSaveView = ref(false)
const newViewName = ref('')

function currentQuery(): Record<string, string> {
  const q: Record<string, string> = {}
  if (activeQueue.value !== 'all') q.queue = activeQueue.value
  if (filterSite.value !== 'all') q.site = filterSite.value
  if (filterStatus.value !== 'all') q.status = filterStatus.value
  if (filterCause.value !== 'all') q.cause = filterCause.value
  if (searchText.value.trim()) q.q = searchText.value.trim()
  return q
}

function applyView(query: Record<string, string>): void {
  activeQueue.value = query.queue ?? 'all'
  filterSite.value = query.site ?? 'all'
  filterStatus.value = query.status ?? 'all'
  filterCause.value = query.cause ?? 'all'
  searchText.value = query.q ?? ''
}

function submitSaveView(): void {
  if (!newViewName.value.trim()) return
  if (saveView(newViewName.value.trim(), currentQuery())) {
    newViewName.value = ''
    showSaveView.value = false
  }
}

function exportCsv(): void {
  const rows = filteredIncidents.value.map((i) => [
    i.incidentNumber,
    i.title,
    siteName(i.siteId),
    robotName(i.robotId),
    i.zoneName ?? '',
    INCIDENT_STATUS_RU[i.status] ?? i.status,
    i.causeCode ?? '',
    i.downtimeSeconds > 0 ? (i.downtimeSeconds / 3600).toFixed(2) : '',
    i.lossRubles,
    i.coordinatorName ?? '',
    i.detectedAt.slice(0, 19).replace('T', ' '),
  ])
  downloadCsv(
    `incidents-${new Date().toISOString().slice(0, 10)}.csv`,
    [
      'Инцидент',
      'Наблюдение',
      'Объект',
      'Робот',
      'Зона',
      'Статус',
      'Причина',
      'Простой (ч)',
      'Потери (₽)',
      'Координатор',
      'Обнаружен',
    ],
    rows,
  )
}
</script>

<template>
  <div class="space-y-4">
    <!-- Actions header -->
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="text-sm text-muted-foreground">
        Рабочая очередь разбора: откройте инцидент и пройдите его от причины до закрытия.
      </p>
      <div class="flex w-full flex-wrap gap-2 lg:w-auto">
        <Button v-if="auth.can('incidents.create')" size="sm" class="min-h-9" @click="openCreate"
          ><Plus class="size-4 mr-1" /> Создать инцидент</Button
        >
        <Button size="sm" variant="ghost" class="min-h-9" @click="resetDemo"
          ><RotateCcw class="size-4 mr-1" /> Сбросить демо-данные</Button
        >
        <Button size="sm" variant="outline" class="min-h-9" @click="exportCsv"
          ><Download class="size-4 mr-1" /> Экспорт CSV</Button
        >
        <Button size="sm" variant="outline" class="min-h-9" @click="showSaveView = true"
          ><Star class="size-4 mr-1" /> Сохранить представление</Button
        >
      </div>
    </div>

    <!-- Saved views -->
    <div v-if="savedViews.length > 0" class="flex flex-wrap gap-2 items-center">
      <span class="text-xs text-muted-foreground">Представления:</span>
      <span
        v-for="v in savedViews"
        :key="v.id"
        class="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs cursor-pointer hover:bg-accent"
        title="Применить сохранённый фильтр"
        @click="applyView(v.query)"
      >
        {{ v.name }}
        <button
          type="button"
          class="text-muted-foreground hover:text-destructive"
          aria-label="Удалить представление"
          @click.stop="removeView(v.id)"
        >
          ×
        </button>
      </span>
    </div>

    <!-- Quick queues -->
    <div class="flex flex-wrap gap-2">
      <Button
        v-for="q in queues.filter((x) => x.key !== 'all')"
        :key="q.key"
        :variant="activeQueue === q.key ? 'default' : 'outline'"
        size="sm"
        class="min-h-9"
        @click="activeQueue = activeQueue === q.key ? 'all' : q.key"
      >
        {{ q.label }}
        <span
          class="ml-1 rounded-full px-1.5 text-xs tabular-nums"
          :class="activeQueue === q.key ? 'bg-primary-foreground/20' : 'bg-muted'"
          >{{ queueCounts[q.key] }}</span
        >
      </Button>
    </div>

    <!-- Filters -->
    <div class="flex flex-wrap items-end gap-3">
      <div class="space-y-1">
        <span class="text-xs text-muted-foreground block">Объект</span>
        <Select v-model="filterSite" aria-label="Фильтр по объекту">
          <SelectTrigger class="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все</SelectItem>
            <SelectItem v-for="s in scopedSites" :key="s.id" :value="s.id">{{ s.name }}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div class="space-y-1">
        <span class="text-xs text-muted-foreground block">Статус</span>
        <Select v-model="filterStatus" aria-label="Фильтр по статусу">
          <SelectTrigger class="w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все</SelectItem>
            <SelectItem v-for="(ru, code) in STATUS_RU" :key="code" :value="code">{{
              ru
            }}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div class="space-y-1 flex-1 min-w-[200px]">
        <span class="text-xs text-muted-foreground block">Поиск</span>
        <Input
          v-model="searchText"
          aria-label="Поиск по инцидентам"
          placeholder="Номер, название, описание..."
        />
      </div>
      <!-- ACC-009: период, зона, робот, вендор, приоритет, координатор, вид простоя. -->
      <div class="space-y-1">
        <span class="text-xs text-muted-foreground block">Период</span>
        <Select v-model="filterPeriod" aria-label="Фильтр по периоду">
          <SelectTrigger class="w-[130px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="30">30 дней</SelectItem>
            <SelectItem value="7">7 дней</SelectItem>
            <SelectItem value="14">14 дней</SelectItem>
            <SelectItem value="90">90 дней</SelectItem>
            <SelectItem value="all">Весь период</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div class="space-y-1">
        <span class="text-xs text-muted-foreground block">Зона</span>
        <Select v-model="filterZone" aria-label="Фильтр по зоне">
          <SelectTrigger class="w-[110px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все</SelectItem>
            <SelectItem v-for="z in zoneOptions" :key="z" :value="z">{{ z }}</SelectItem>
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
        <span class="text-xs text-muted-foreground block">Вендор</span>
        <Select v-model="filterVendor" aria-label="Фильтр по вендору">
          <SelectTrigger class="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все</SelectItem>
            <SelectItem v-for="v in vendorOptions" :key="v" :value="v">{{ v }}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div class="space-y-1">
        <span class="text-xs text-muted-foreground block">Приоритет</span>
        <Select v-model="filterPriority" aria-label="Фильтр по приоритету">
          <SelectTrigger class="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все</SelectItem>
            <SelectItem value="CRITICAL">Критический</SelectItem>
            <SelectItem value="HIGH">Высокий</SelectItem>
            <SelectItem value="MEDIUM">Средний</SelectItem>
            <SelectItem value="LOW">Низкий</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div class="space-y-1">
        <span class="text-xs text-muted-foreground block">Координатор</span>
        <Select v-model="filterCoordinator" aria-label="Фильтр по координатору">
          <SelectTrigger class="w-[170px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все</SelectItem>
            <SelectItem value="__none__">Не назначен</SelectItem>
            <SelectItem v-for="c in coordinatorOptions" :key="c" :value="c">{{ c }}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div class="space-y-1">
        <span class="text-xs text-muted-foreground block">Вид простоя</span>
        <Select v-model="filterDowntimeKind" aria-label="Фильтр по виду простоя">
          <SelectTrigger class="w-[210px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все</SelectItem>
            <SelectItem value="impact">С влиянием на процесс</SelectItem>
            <SelectItem value="tech">Техническая недоступность</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>

    <!-- Summary -->
    <div
      v-if="filterCause !== 'all'"
      class="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm"
    >
      <span>
        Причина:
        <strong class="text-foreground">{{ causeLabel(filterCause) }}</strong>
      </span>
      <Button size="sm" variant="ghost" class="h-7 px-2" @click="filterCause = 'all'">
        Сбросить
      </Button>
    </div>
    <div class="flex flex-wrap gap-4 text-sm text-muted-foreground">
      <span
        >Инцидентов: <strong class="text-foreground tabular-nums">{{ summary.count }}</strong></span
      >
      <span
        >Подтверждённый простой:
        <strong class="text-foreground tabular-nums">{{
          fmtDur(summary.confirmedDowntime)
        }}</strong></span
      >
      <span
        >Потери:
        <strong class="text-foreground tabular-nums"
          >{{ summary.loss.toLocaleString('ru-RU') }} ₽</strong
        ></span
      >
    </div>

    <!-- Table -->
    <Card>
      <CardContent class="p-0">
        <Table class="lg:max-2xl:table-fixed lg:max-2xl:[&_td]:px-3 lg:max-2xl:[&_th]:px-3">
          <TableHeader>
            <TableRow>
              <TableHead class="py-3 px-4 lg:max-2xl:w-30">Номер</TableHead>
              <TableHead class="py-3 px-4 lg:max-2xl:w-[33%]">Что наблюдаем</TableHead>
              <TableHead class="py-3 px-4 lg:max-2xl:hidden">Робот</TableHead>
              <TableHead class="py-3 px-4 lg:max-2xl:hidden">Объект</TableHead>
              <TableHead class="py-3 px-4 lg:max-2xl:w-30">Статус</TableHead>
              <TableHead class="py-3 px-4 lg:max-2xl:hidden">Причина</TableHead>
              <TableHead class="py-3 px-4 lg:max-2xl:w-20">Простой</TableHead>
              <TableHead class="py-3 px-4 lg:max-2xl:w-24">Потери</TableHead>
              <TableHead class="py-3 px-4 lg:max-2xl:hidden">Координатор</TableHead>
              <TableHead class="py-3 px-4 lg:max-2xl:w-44">Следующее действие</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow
              v-for="inc in filteredIncidents"
              :key="inc.id"
              class="row-interactive cursor-pointer"
              @click="goTo(inc.id)"
            >
              <TableCell class="font-mono text-xs py-3 px-4 lg:max-2xl:w-30">{{
                inc.incidentNumber
              }}</TableCell>
              <TableCell
                class="text-xs py-3 px-4 max-w-xs lg:max-2xl:w-[33%] lg:max-2xl:max-w-none"
              >
                <p
                  class="font-medium truncate"
                  :title="incidentTypeLabel(inc.incidentTypeCode).split(' · ')[1]"
                >
                  {{ incidentTypeLabel(inc.incidentTypeCode).split(' · ')[1] }}
                </p>
                <p class="text-muted-foreground truncate" :title="inc.title">{{ inc.title }}</p>
              </TableCell>
              <TableCell class="text-xs py-3 px-4 lg:max-2xl:hidden">{{
                robotName(inc.robotId)
              }}</TableCell>
              <TableCell class="text-xs py-3 px-4 lg:max-2xl:hidden">{{
                siteName(inc.siteId)
              }}</TableCell>
              <TableCell class="py-3 px-4 lg:max-2xl:w-30 lg:max-2xl:whitespace-normal">
                <span
                  class="text-xs rounded px-1.5 py-0.5"
                  :class="INCIDENT_STATUS_CLASS[inc.status]"
                  >{{ STATUS_RU[inc.status] }}</span
                >
              </TableCell>
              <TableCell class="text-xs py-3 px-4 max-w-[200px] lg:max-2xl:hidden">
                <p class="truncate" :title="causeLabel(inc.causeCode).split(' · ')[1] ?? '—'">
                  {{ causeLabel(inc.causeCode).split(' · ')[1] ?? '—' }}
                </p>
              </TableCell>
              <TableCell class="text-xs py-3 px-4 lg:max-2xl:w-20">
                <span v-if="inc.downtimeSeconds > 0" class="tabular-nums">{{
                  fmtDur(inc.downtimeSeconds)
                }}</span>
                <span v-else-if="inc.hasDowntime && !inc.downtimeConfirmed" class="text-warning"
                  >не подтв.</span
                >
                <span v-else class="text-muted-foreground">—</span>
              </TableCell>
              <TableCell class="text-xs py-3 px-4 tabular-nums lg:max-2xl:w-24">
                <span v-if="inc.lossRubles > 0"
                  >{{ inc.lossRubles.toLocaleString('ru-RU') }} ₽</span
                >
                <span v-else class="text-muted-foreground">—</span>
              </TableCell>
              <TableCell class="text-xs py-3 px-4 lg:max-2xl:hidden">{{
                inc.coordinatorName ?? '—'
              }}</TableCell>
              <TableCell
                class="text-xs py-3 px-4 max-w-[220px] lg:max-2xl:w-44 lg:max-2xl:max-w-none"
              >
                <span
                  v-if="stepLabelOf(inc.id)"
                  class="text-muted-foreground truncate block"
                  :title="stepLabelOf(inc.id) ?? undefined"
                  >{{ stepLabelOf(inc.id) }}</span
                >
                <span v-else class="text-success">закрыт</span>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>

    <!-- Диалог: ручная регистрация инцидента (ТЗ §15) -->
    <Dialog :open="showCreate" @update:open="(v) => (showCreate = v)">
      <DialogContent class="max-w-lg">
        <DialogHeader>
          <DialogTitle>Ручная регистрация инцидента</DialogTitle>
          <DialogDescription>
            Обязательные поля: объект, зона, наблюдение и приоритет. Первичное доказательство —
            наблюдение оператора; простой с влиянием на процесс открывается опционально.
          </DialogDescription>
        </DialogHeader>
        <div class="space-y-3">
          <div class="grid grid-cols-2 gap-3">
            <div class="space-y-1.5">
              <Label>Объект *</Label>
              <Select v-model="createSite" aria-label="Объект">
                <SelectTrigger class="min-h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="s in scopedSites" :key="s.id" :value="s.id">{{
                    s.name
                  }}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div class="space-y-1.5">
              <Label for="cr-zone">Зона *</Label>
              <Input id="cr-zone" v-model="createZone" placeholder="A-3" />
            </div>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div class="space-y-1.5">
              <Label>Робот</Label>
              <Select v-model="createRobot" aria-label="Робот">
                <SelectTrigger class="min-h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Не выбран</SelectItem>
                  <SelectItem v-for="r in robotsForSite" :key="r.id" :value="r.id">{{
                    r.name
                  }}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div class="space-y-1.5">
              <Label>Приоритет *</Label>
              <Select v-model="createSeverity" aria-label="Приоритет">
                <SelectTrigger class="min-h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="LOW">Низкий</SelectItem>
                  <SelectItem value="MEDIUM">Средний</SelectItem>
                  <SelectItem value="HIGH">Высокий</SelectItem>
                  <SelectItem value="CRITICAL">Критический</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div class="space-y-1.5">
            <Label for="cr-obs">Наблюдение *</Label>
            <Textarea
              id="cr-obs"
              v-model="createObservation"
              rows="3"
              maxlength="240"
              placeholder="Что наблюдаем на объекте (факт, не причина)"
            />
          </div>
          <label class="flex items-center gap-2 text-sm">
            <input
              v-model="createWithDowntime"
              type="checkbox"
              aria-label="Открыть простой с влиянием на процесс"
              class="accent-primary"
            />
            Открыть простой с влиянием на процесс
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" class="min-h-10" @click="showCreate = false">Отмена</Button>
          <Button
            class="min-h-10"
            :disabled="!createSite || !createZone.trim() || !createObservation.trim()"
            @click="submitCreate"
            >Зарегистрировать</Button
          >
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Диалог: сохранить представление -->
    <Dialog :open="showSaveView" @update:open="(v) => (showSaveView = v)">
      <DialogContent class="max-w-sm">
        <DialogHeader>
          <DialogTitle>Сохранить представление</DialogTitle>
          <DialogDescription>
            Текущие фильтры ({{ Object.keys(currentQuery()).length }}) сохранятся под этим именем и
            будут доступны на любом устройстве этой сессии.
          </DialogDescription>
        </DialogHeader>
        <div class="space-y-2">
          <Input
            v-model="newViewName"
            aria-label="Название представления"
            placeholder="Например: Подольск — сеть"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" class="min-h-10" @click="showSaveView = false">Отмена</Button>
          <Button class="min-h-10" :disabled="!newViewName.trim()" @click="submitSaveView"
            >Сохранить</Button
          >
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
