<script setup lang="ts">
import { ref, computed } from 'vue'
import { useDemoData } from '@/composables/useDemoData'
import { incidentTypeLabel, causeLabel } from '@/data/generator'
import { INCIDENT_STATUS_RU, INCIDENT_STATUS_CLASS } from '@/data/labels'
import { useRouter } from 'vue-router'
import { Card, CardContent } from '@/components/ui/card'
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

const { incidents, sites, robots } = useDemoData()
const router = useRouter()

const STATUS_RU = INCIDENT_STATUS_RU
const activeQueue = ref<string>('all')
const filterSite = ref('all')
const filterStatus = ref('all')
const searchText = ref('')

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
</script>

<template>
  <div class="space-y-4">
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
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  </div>
</template>
