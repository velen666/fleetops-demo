<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useDemoData } from '@/composables/useDemoData'
import { incidentTypeLabel, causeLabel } from '@/data/generator'
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

const { incidents, sites, robots, createManualIncident, nextStep, resetDemo } = useDemoData()
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
const searchText = ref(strParam(route.query.q, ''))

watch(
  [activeQueue, filterSite, filterStatus, searchText],
  ([queue, site, status, q]) => {
    void router.replace({
      query: {
        ...(queue !== 'all' ? { queue } : {}),
        ...(site !== 'all' ? { site } : {}),
        ...(status !== 'all' ? { status } : {}),
        ...(q ? { q } : {}),
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

const queues: Queue[] = [
  { key: 'needs_review', label: 'Требуют разбора', filter: (i) => i.status === 'OPEN' },
  {
    key: 'no_coordinator',
    label: 'Без координатора',
    filter: (i) => i.status !== 'CLOSED' && !i.coordinatorName,
  },
  {
    key: 'cause_unconfirmed',
    label: 'Причина не подтверждена',
    filter: (i) => i.status !== 'CLOSED' && i.causeMaturity !== 'FINAL',
  },
  {
    key: 'downtime_unconfirmed',
    label: 'Простой не подтверждён',
    filter: (i) => i.status !== 'CLOSED' && i.hasDowntime && !i.downtimeConfirmed,
  },
  {
    key: 'waiting_service',
    label: 'Ожидают сервисных работ',
    filter: (i) => i.status === 'WAITING',
  },
  {
    key: 'need_recovery',
    label: 'Нужно подтвердить восстановление',
    filter: (i) => i.status !== 'CLOSED' && !i.recoveryConfirmed,
  },
  {
    key: 'ready_to_close',
    label: 'Готовы к закрытию',
    filter: (i) => i.status === 'READY_TO_CLOSE',
  },
  { key: 'all', label: 'Все', filter: () => true },
]

const queueCounts = computed(() => {
  const counts: Record<string, number> = {}
  for (const q of queues) {
    counts[q.key] = incidents.value.filter(q.filter).length
  }
  return counts
})

const filteredIncidents = computed(() => {
  let result = incidents.value
  if (activeQueue.value !== 'all') {
    const q = queues.find((x) => x.key === activeQueue.value)
    if (q) result = result.filter(q.filter)
  }
  if (filterSite.value !== 'all') result = result.filter((i) => i.siteId === filterSite.value)
  if (filterStatus.value !== 'all') result = result.filter((i) => i.status === filterStatus.value)
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
  if (searchText.value.trim()) q.q = searchText.value.trim()
  return q
}

function applyView(query: Record<string, string>): void {
  activeQueue.value = query.queue ?? 'all'
  filterSite.value = query.site ?? 'all'
  filterStatus.value = query.status ?? 'all'
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
      <div class="flex gap-2">
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
            <SelectItem v-for="s in sites" :key="s.id" :value="s.id">{{ s.name }}</SelectItem>
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
    </div>

    <!-- Summary -->
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
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead class="py-3 px-4">Номер</TableHead>
              <TableHead class="py-3 px-4">Что наблюдаем</TableHead>
              <TableHead class="py-3 px-4">Робот</TableHead>
              <TableHead class="py-3 px-4">Объект</TableHead>
              <TableHead class="py-3 px-4">Статус</TableHead>
              <TableHead class="py-3 px-4">Причина</TableHead>
              <TableHead class="py-3 px-4">Простой</TableHead>
              <TableHead class="py-3 px-4">Потери</TableHead>
              <TableHead class="py-3 px-4">Координатор</TableHead>
              <TableHead class="py-3 px-4">Следующее действие</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow
              v-for="inc in filteredIncidents"
              :key="inc.id"
              class="row-interactive cursor-pointer"
              @click="goTo(inc.id)"
            >
              <TableCell class="font-mono text-xs py-3 px-4">{{ inc.incidentNumber }}</TableCell>
              <TableCell class="text-xs py-3 px-4 max-w-xs">
                <p class="font-medium truncate">
                  {{ incidentTypeLabel(inc.incidentTypeCode).split(' · ')[1] }}
                </p>
                <p class="text-muted-foreground truncate">{{ inc.title }}</p>
              </TableCell>
              <TableCell class="text-xs py-3 px-4">{{ robotName(inc.robotId) }}</TableCell>
              <TableCell class="text-xs py-3 px-4">{{ siteName(inc.siteId) }}</TableCell>
              <TableCell class="py-3 px-4">
                <span
                  class="text-xs rounded px-1.5 py-0.5"
                  :class="INCIDENT_STATUS_CLASS[inc.status]"
                  >{{ STATUS_RU[inc.status] }}</span
                >
              </TableCell>
              <TableCell class="text-xs py-3 px-4 max-w-[200px]">
                <p class="truncate">{{ causeLabel(inc.causeCode).split(' · ')[1] ?? '—' }}</p>
              </TableCell>
              <TableCell class="text-xs py-3 px-4">
                <span v-if="inc.downtimeSeconds > 0" class="tabular-nums">{{
                  fmtDur(inc.downtimeSeconds)
                }}</span>
                <span v-else-if="inc.hasDowntime && !inc.downtimeConfirmed" class="text-warning"
                  >не подтв.</span
                >
                <span v-else class="text-muted-foreground">—</span>
              </TableCell>
              <TableCell class="text-xs tabular-nums py-3 px-4">
                <span v-if="inc.lossRubles > 0"
                  >{{ inc.lossRubles.toLocaleString('ru-RU') }} ₽</span
                >
                <span v-else class="text-muted-foreground">—</span>
              </TableCell>
              <TableCell class="text-xs py-3 px-4">{{ inc.coordinatorName ?? '—' }}</TableCell>
              <TableCell class="text-xs py-3 px-4 max-w-[220px]">
                <span v-if="stepLabelOf(inc.id)" class="text-muted-foreground truncate block">{{
                  stepLabelOf(inc.id)
                }}</span>
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
            наблюдение оператора; учётный интервал простоя открывается опционально.
          </DialogDescription>
        </DialogHeader>
        <div class="space-y-3">
          <div class="grid grid-cols-2 gap-3">
            <div class="space-y-1.5">
              <Label>Объект *</Label>
              <Select v-model="createSite" aria-label="Объект">
                <SelectTrigger class="min-h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="s in sites" :key="s.id" :value="s.id">{{ s.name }}</SelectItem>
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
              aria-label="Открыть учётный интервал простоя"
              class="accent-primary"
            />
            Открыть учётный интервал простоя
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
