<script setup lang="ts">
import { ref, computed } from 'vue'
import { useDemoData } from '@/composables/useDemoData'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Bot, Radio, Cpu, MapPin, AlertTriangle, Clock, TrendingDown } from 'lucide-vue-next'
import type { Robot } from '@/types/domain'
import { incidentTypeLabel, causeLabel } from '@/data/generator'
import { INCIDENT_STATUS_RU, INCIDENT_STATUS_CLASS, sourceInstanceLabel } from '@/data/labels'

const { robots, sites, incidents, downtimes, maintenance } = useDemoData()

const selectedRobot = ref<Robot | null>(null)
const filterSite = ref('all')
const filterStatus = ref('all')
const searchText = ref('')

const STATUS_RU: Record<string, string> = {
  ACTIVE: 'Активен',
  MAINTENANCE: 'Обслуживание',
  DISABLED: 'Отключён',
}

// Availability: 1 - confirmed downtime / (30 days * 24h) per robot
const ROBOT_FUND_H = 30 * 24

const robotMetrics = computed(() => {
  const map = new Map<string, { incCount: number; dtSeconds: number; loss: number }>()
  for (const r of robots.value) map.set(r.id, { incCount: 0, dtSeconds: 0, loss: 0 })
  for (const inc of incidents.value) {
    if (!inc.robotId) continue
    const e = map.get(inc.robotId)
    if (e) {
      e.incCount++
      e.dtSeconds += inc.downtimeSeconds
      e.loss += inc.lossRubles
    }
  }
  return map
})

function availability(robotId: string): number {
  const m = robotMetrics.value.get(robotId)
  if (!m || ROBOT_FUND_H === 0) return 100
  return Math.max(0, 100 - (m.dtSeconds / 3600 / ROBOT_FUND_H) * 100)
}

const filteredRobots = computed(() => {
  let result = robots.value
  if (filterSite.value !== 'all') result = result.filter((r) => r.siteId === filterSite.value)
  if (filterStatus.value !== 'all') result = result.filter((r) => r.status === filterStatus.value)
  if (searchText.value.trim()) {
    const s = searchText.value.trim().toLowerCase()
    result = result.filter(
      (r) =>
        r.name.toLowerCase().includes(s) ||
        r.model.toLowerCase().includes(s) ||
        r.vendor.toLowerCase().includes(s),
    )
  }
  return result.sort((a, b) => a.name.localeCompare(b.name))
})

const selIncidents = computed(() =>
  selectedRobot.value
    ? incidents.value
        .filter((i) => i.robotId === selectedRobot.value!.id)
        .sort((a, b) => b.detectedAt.localeCompare(a.detectedAt))
    : [],
)
const selDowntime = computed(() => {
  if (!selectedRobot.value) return { seconds: 0, loss: 0 }
  const dts = downtimes.value.filter(
    (d) => d.robotId === selectedRobot.value!.id && d.confirmationStatus === 'CONFIRMED',
  )
  return {
    seconds: dts.reduce((s, d) => s + d.accountableDurationSeconds, 0),
    loss: dts.reduce((s, d) => s + d.lossRubles, 0),
  }
})
const selMaints = computed(() =>
  selectedRobot.value ? maintenance.value.filter((m) => m.robotId === selectedRobot.value!.id) : [],
)
const selRepeatCauses = computed(() => {
  const map = new Map<string, number>()
  for (const inc of selIncidents.value) {
    if (inc.causeCode) map.set(inc.causeCode, (map.get(inc.causeCode) ?? 0) + 1)
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
})

function siteName(id: string): string {
  return sites.value.find((s) => s.id === id)?.name ?? id
}
function availClass(v: number): string {
  return v >= 99 ? 'text-success' : v >= 95 ? 'text-warning' : 'text-destructive'
}
</script>

<template>
  <div class="space-y-4">
    <!-- Filters -->
    <div class="flex flex-wrap items-end gap-3">
      <div class="space-y-1">
        <span class="text-xs text-muted-foreground block">Объект</span>
        <Select v-model="filterSite" aria-label="Фильтр по объекту">
          <SelectTrigger class="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все ({{ robots.length }})</SelectItem>
            <SelectItem v-for="s in sites" :key="s.id" :value="s.id">{{ s.name }}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div class="space-y-1">
        <span class="text-xs text-muted-foreground block">Статус</span>
        <Select v-model="filterStatus" aria-label="Фильтр по статусу">
          <SelectTrigger class="w-[160px]"><SelectValue /></SelectTrigger>
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
          aria-label="Поиск по роботам"
          placeholder="Имя, модель, вендор..."
        />
      </div>
    </div>

    <!-- Table -->
    <Card>
      <CardContent class="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead class="py-3 px-4">Робот</TableHead>
              <TableHead class="py-3 px-4">Модель</TableHead>
              <TableHead class="py-3 px-4">Вендор</TableHead>
              <TableHead class="py-3 px-4">Объект</TableHead>
              <TableHead class="py-3 px-4">Статус</TableHead>
              <TableHead class="py-3 px-4">Доступность</TableHead>
              <TableHead class="py-3 px-4">Инцидентов</TableHead>
              <TableHead class="py-3 px-4">Простой</TableHead>
              <TableHead class="py-3 px-4">Потери</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow
              v-for="robot in filteredRobots"
              :key="robot.id"
              class="row-interactive cursor-pointer"
              @click="selectedRobot = robot"
            >
              <TableCell class="font-medium text-sm py-3 px-4">{{ robot.name }}</TableCell>
              <TableCell class="text-xs py-3 px-4">{{ robot.model }}</TableCell>
              <TableCell class="text-xs py-3 px-4">{{ robot.vendor }}</TableCell>
              <TableCell class="text-xs py-3 px-4">{{ siteName(robot.siteId) }}</TableCell>
              <TableCell class="py-3 px-4">
                <span
                  class="text-xs rounded px-1.5 py-0.5"
                  :class="{
                    'bg-success/15 text-success': robot.status === 'ACTIVE',
                    'bg-warning/15 text-warning': robot.status === 'MAINTENANCE',
                    'bg-muted text-muted-foreground': robot.status === 'DISABLED',
                  }"
                  >{{ STATUS_RU[robot.status] }}</span
                >
              </TableCell>
              <TableCell
                class="text-sm font-medium tabular-nums py-3 px-4"
                :class="availClass(availability(robot.id))"
              >
                {{ availability(robot.id).toFixed(1) }}%
              </TableCell>
              <TableCell class="text-sm tabular-nums py-3 px-4">{{
                robotMetrics.get(robot.id)?.incCount ?? 0
              }}</TableCell>
              <TableCell class="text-sm tabular-nums py-3 px-4"
                >{{ ((robotMetrics.get(robot.id)?.dtSeconds ?? 0) / 3600).toFixed(1) }} ч</TableCell
              >
              <TableCell class="text-sm font-medium tabular-nums py-3 px-4 text-destructive"
                >{{ (robotMetrics.get(robot.id)?.loss ?? 0).toLocaleString('ru-RU') }} ₽</TableCell
              >
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>

    <!-- Robot detail dialog -->
    <Dialog :open="!!selectedRobot" @update:open="(v) => !v && (selectedRobot = null)">
      <DialogContent class="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader class="pb-4 border-b border-border">
          <DialogTitle class="flex items-center gap-2"
            ><Bot class="size-5 text-primary" /> {{ selectedRobot?.name }}</DialogTitle
          >
          <DialogDescription
            >{{ selectedRobot?.model }} · {{ selectedRobot?.vendor }} ·
            {{ selectedRobot ? siteName(selectedRobot.siteId) : '' }}</DialogDescription
          >
        </DialogHeader>
        <div v-if="selectedRobot" class="space-y-5">
          <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div class="border border-border rounded-lg p-3">
              <div class="flex items-center gap-1.5 mb-1">
                <Cpu class="size-3 text-muted-foreground" />
                <p class="text-xs text-muted-foreground">Статус</p>
              </div>
              <p class="text-sm font-medium">{{ STATUS_RU[selectedRobot.status] }}</p>
            </div>
            <div class="border border-border rounded-lg p-3">
              <div class="flex items-center gap-1.5 mb-1">
                <Radio class="size-3 text-muted-foreground" />
                <p class="text-xs text-muted-foreground">Источник</p>
              </div>
              <p class="text-sm font-medium">
                {{ sourceInstanceLabel('RMS', selectedRobot.siteId) }}
              </p>
            </div>
            <div class="border border-border rounded-lg p-3">
              <div class="flex items-center gap-1.5 mb-1">
                <MapPin class="size-3 text-muted-foreground" />
                <p class="text-xs text-muted-foreground">Объект</p>
              </div>
              <p class="text-sm font-medium">{{ siteName(selectedRobot.siteId) }}</p>
            </div>
            <div class="border border-border rounded-lg p-3">
              <div class="flex items-center gap-1.5 mb-1">
                <Clock class="size-3 text-muted-foreground" />
                <p class="text-xs text-muted-foreground">Доступность (30д)</p>
              </div>
              <p
                class="text-sm font-bold tabular-nums"
                :class="availClass(availability(selectedRobot.id))"
              >
                {{ availability(selectedRobot.id).toFixed(1) }}%
              </p>
            </div>
          </div>

          <div class="grid grid-cols-3 gap-3">
            <div class="bg-muted/30 rounded-lg p-3 text-center">
              <div class="flex items-center justify-center gap-1 mb-0.5">
                <AlertTriangle class="size-3 text-muted-foreground" />
                <p class="text-xs text-muted-foreground">Инцидентов</p>
              </div>
              <p class="text-xl font-bold tabular-nums">{{ selIncidents.length }}</p>
            </div>
            <div class="bg-muted/30 rounded-lg p-3 text-center">
              <div class="flex items-center justify-center gap-1 mb-0.5">
                <Clock class="size-3 text-muted-foreground" />
                <p class="text-xs text-muted-foreground">Простой</p>
              </div>
              <p class="text-xl font-bold tabular-nums">
                {{ (selDowntime.seconds / 3600).toFixed(1) }} ч
              </p>
            </div>
            <div class="bg-muted/30 rounded-lg p-3 text-center">
              <div class="flex items-center justify-center gap-1 mb-0.5">
                <TrendingDown class="size-3 text-muted-foreground" />
                <p class="text-xs text-muted-foreground">Потери</p>
              </div>
              <p class="text-xl font-bold tabular-nums text-destructive">
                {{ selDowntime.loss.toLocaleString('ru-RU') }} ₽
              </p>
            </div>
          </div>

          <div v-if="selRepeatCauses.length > 0">
            <p class="text-sm font-medium mb-2">Повторяющиеся причины</p>
            <div class="flex flex-wrap gap-2">
              <span
                v-for="[code, count] in selRepeatCauses"
                :key="code"
                class="text-xs rounded-lg bg-muted/40 px-2.5 py-1.5"
              >
                {{ causeLabel(code) }} <strong class="ml-1">{{ count }}×</strong>
              </span>
            </div>
          </div>

          <div v-if="selMaints.length > 0">
            <p class="text-sm font-medium mb-2">Работы ТОиР</p>
            <div class="space-y-1.5">
              <div
                v-for="m in selMaints"
                :key="m.id"
                class="rounded-lg border border-border p-2.5 text-sm"
              >
                <div class="flex justify-between items-center">
                  <span class="font-medium">{{ m.title }}</span>
                  <span class="text-xs text-muted-foreground">{{ m.dueAt.slice(0, 10) }}</span>
                </div>
              </div>
            </div>
          </div>

          <div>
            <p class="text-sm font-medium mb-2">История инцидентов</p>
            <div v-if="selIncidents.length === 0" class="text-xs text-muted-foreground py-2">
              Нет инцидентов
            </div>
            <div v-else class="space-y-1.5">
              <RouterLink
                v-for="inc in selIncidents"
                :key="inc.id"
                :to="{ name: 'incident-details', params: { incidentId: inc.id } }"
                class="card-interactive flex items-center justify-between rounded-lg border border-border p-2.5"
                @click="selectedRobot = null"
              >
                <div class="min-w-0">
                  <div class="flex items-center gap-2">
                    <p class="text-sm font-mono">{{ inc.incidentNumber }}</p>
                    <span
                      class="text-xs rounded px-1.5 py-0.5"
                      :class="INCIDENT_STATUS_CLASS[inc.status]"
                      >{{ INCIDENT_STATUS_RU[inc.status] }}</span
                    >
                  </div>
                  <p class="text-xs text-muted-foreground truncate mt-0.5">
                    {{ incidentTypeLabel(inc.incidentTypeCode).split(' · ')[1] }}
                  </p>
                </div>
                <p
                  v-if="inc.lossRubles > 0"
                  class="text-xs font-medium tabular-nums text-destructive shrink-0 ml-2"
                >
                  {{ inc.lossRubles.toLocaleString('ru-RU') }} ₽
                </p>
              </RouterLink>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  </div>
</template>
