<script setup lang="ts">
import { ref, computed } from 'vue'
import { useDemoData } from '@/composables/useDemoData'
import { MAINTENANCE_STATUS_RU, MAINTENANCE_TYPE_RU } from '@/data/labels'
import type { MaintenanceWork } from '@/types/domain'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
import { useRouter } from 'vue-router'

const { maintenance, sites, robots } = useDemoData()
const router = useRouter()

const filterType = ref('all')
const filterStatus = ref('all')
const selected = ref<MaintenanceWork | null>(null)

const STATUS_CLASS: Record<string, string> = {
  PLANNED: 'bg-muted text-muted-foreground',
  ASSIGNED: 'bg-primary/15 text-primary',
  IN_PROGRESS: 'bg-primary/15 text-primary',
  WAITING_PARTS: 'bg-warning/15 text-warning',
  DONE: 'bg-success/15 text-success',
  RESULT_CONFIRMED: 'bg-success/15 text-success',
  CANCELLED: 'bg-destructive/15 text-destructive',
}

const filtered = computed(() => {
  let result = maintenance.value
  if (filterType.value !== 'all') result = result.filter((m) => m.type === filterType.value)
  if (filterStatus.value !== 'all') result = result.filter((m) => m.status === filterStatus.value)
  return result
})

const summary = computed(() => ({
  total: maintenance.value.length,
  overdue: maintenance.value.filter((m) => !m.completedAt && new Date(m.dueAt) < new Date()).length,
  inProgress: maintenance.value.filter((m) =>
    ['ASSIGNED', 'IN_PROGRESS', 'WAITING_PARTS'].includes(m.status),
  ).length,
  done: maintenance.value.filter((m) => ['DONE', 'RESULT_CONFIRMED'].includes(m.status)).length,
}))

function siteName(id: string): string {
  return sites.value.find((s) => s.id === id)?.name ?? id
}
function robotName(id: string): string {
  return robots.value.find((r) => r.id === id)?.name ?? id
}
function fmtDate(iso: string): string {
  return iso.slice(0, 10)
}
function isOverdue(m: MaintenanceWork): boolean {
  return !m.completedAt && new Date(m.dueAt) < new Date()
}

function openWork(m: MaintenanceWork): void {
  selected.value = m
}
</script>

<template>
  <div class="space-y-4">
    <!-- Summary -->
    <div class="grid gap-4 md:grid-cols-4">
      <Card
        ><CardContent class="p-4">
          <p class="text-sm text-muted-foreground">Всего работ</p>
          <p class="text-2xl font-bold tabular-nums">{{ summary.total }}</p>
        </CardContent></Card
      >
      <Card
        ><CardContent class="p-4">
          <p class="text-sm text-muted-foreground">В работе</p>
          <p class="text-2xl font-bold text-primary tabular-nums">{{ summary.inProgress }}</p>
        </CardContent></Card
      >
      <Card
        ><CardContent class="p-4">
          <p class="text-sm text-muted-foreground">Просрочено</p>
          <p class="text-2xl font-bold text-destructive tabular-nums">{{ summary.overdue }}</p>
        </CardContent></Card
      >
      <Card
        ><CardContent class="p-4">
          <p class="text-sm text-muted-foreground">Выполнено</p>
          <p class="text-2xl font-bold text-success tabular-nums">{{ summary.done }}</p>
        </CardContent></Card
      >
    </div>

    <!-- Filters -->
    <div class="flex flex-wrap items-end gap-3">
      <div class="space-y-1">
        <span class="text-xs text-muted-foreground block">Вид работы</span>
        <Select v-model="filterType" aria-label="Фильтр по виду работ">
          <SelectTrigger class="w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все</SelectItem>
            <SelectItem v-for="(ru, code) in MAINTENANCE_TYPE_RU" :key="code" :value="code">{{
              ru
            }}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div class="space-y-1">
        <span class="text-xs text-muted-foreground block">Статус</span>
        <Select v-model="filterStatus" aria-label="Фильтр по статусу">
          <SelectTrigger class="w-[220px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все</SelectItem>
            <SelectItem v-for="(ru, code) in MAINTENANCE_STATUS_RU" :key="code" :value="code">{{
              ru
            }}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>

    <!-- Table -->
    <Card>
      <CardContent class="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead class="py-3 px-4">Вид</TableHead>
              <TableHead class="py-3 px-4">Название</TableHead>
              <TableHead class="py-3 px-4">Робот</TableHead>
              <TableHead class="py-3 px-4">Объект</TableHead>
              <TableHead class="py-3 px-4">Исполнитель</TableHead>
              <TableHead class="py-3 px-4">Срок</TableHead>
              <TableHead class="py-3 px-4">Статус</TableHead>
              <TableHead class="py-3 px-4">Результат</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow
              v-for="m in filtered"
              :key="m.id"
              class="row-interactive cursor-pointer"
              @click="openWork(m)"
            >
              <TableCell class="py-3 px-4">
                <span
                  class="text-xs rounded px-1.5 py-0.5"
                  :class="
                    m.type === 'EMERGENCY'
                      ? 'bg-destructive/15 text-destructive'
                      : m.type === 'PLANNED'
                        ? 'bg-primary/15 text-primary'
                        : 'bg-muted text-muted-foreground'
                  "
                  >{{ MAINTENANCE_TYPE_RU[m.type] }}</span
                >
              </TableCell>
              <TableCell class="text-xs py-3 px-4 max-w-xs">
                <p class="font-medium truncate">{{ m.title }}</p>
                <p v-if="m.incidentId" class="text-primary text-xs">связан с инцидентом</p>
              </TableCell>
              <TableCell class="text-xs py-3 px-4">{{ robotName(m.robotId) }}</TableCell>
              <TableCell class="text-xs py-3 px-4">{{ siteName(m.siteId) }}</TableCell>
              <TableCell class="text-xs py-3 px-4">{{ m.executor }}</TableCell>
              <TableCell
                class="text-xs py-3 px-4"
                :class="isOverdue(m) ? 'text-destructive font-medium' : ''"
              >
                {{ fmtDate(m.dueAt) }}
                <span v-if="isOverdue(m)" class="block text-destructive">просрочено</span>
              </TableCell>
              <TableCell class="py-3 px-4">
                <span class="text-xs rounded px-1.5 py-0.5" :class="STATUS_CLASS[m.status]">{{
                  MAINTENANCE_STATUS_RU[m.status]
                }}</span>
              </TableCell>
              <TableCell class="text-xs py-3 px-4 max-w-[200px]">
                <p v-if="m.result" class="truncate text-muted-foreground">{{ m.result }}</p>
                <span v-else class="text-muted-foreground">—</span>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>

    <!-- Detail dialog -->
    <Dialog :open="!!selected" @update:open="(v) => !v && (selected = null)">
      <DialogContent class="max-w-xl">
        <DialogHeader class="pb-4 border-b border-border">
          <DialogTitle>{{ selected?.title }}</DialogTitle>
          <DialogDescription
            >{{ MAINTENANCE_TYPE_RU[selected?.type ?? ''] }} ·
            {{ MAINTENANCE_STATUS_RU[selected?.status ?? ''] }}</DialogDescription
          >
        </DialogHeader>
        <div v-if="selected" class="space-y-4 text-sm">
          <div class="grid grid-cols-2 gap-3">
            <div>
              <p class="text-xs text-muted-foreground">Робот</p>
              <p>{{ robotName(selected.robotId) }}</p>
            </div>
            <div>
              <p class="text-xs text-muted-foreground">Объект</p>
              <p>{{ siteName(selected.siteId) }}</p>
            </div>
            <div>
              <p class="text-xs text-muted-foreground">Исполнитель</p>
              <p>{{ selected.executor }}</p>
            </div>
            <div>
              <p class="text-xs text-muted-foreground">Срок</p>
              <p :class="isOverdue(selected) ? 'text-destructive' : ''">
                {{ fmtDate(selected.dueAt) }}
              </p>
            </div>
            <div v-if="selected.completedAt">
              <p class="text-xs text-muted-foreground">Выполнено</p>
              <p>{{ fmtDate(selected.completedAt) }}</p>
            </div>
          </div>
          <div v-if="selected.result" class="border-t pt-3">
            <p class="text-xs text-muted-foreground mb-1">Результат</p>
            <p>{{ selected.result }}</p>
          </div>
          <div v-if="selected.incidentId" class="border-t pt-3">
            <button
              class="text-primary hover:underline text-sm"
              @click="
                () => {
                  if (!selected?.incidentId) return
                  router.push({
                    name: 'incident-details',
                    params: { incidentId: selected.incidentId },
                  })
                  selected = null
                }
              "
            >
              Открыть связанный инцидент →
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  </div>
</template>
