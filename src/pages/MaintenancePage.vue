<script setup lang="ts">
import { ref, computed } from 'vue'
import { useDemoData } from '@/composables/useDemoData'
import { useTenantScope } from '@/composables/useTenantScope'
import { useAuthStore } from '@/stores/auth'
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
  DialogFooter,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { useRouter } from 'vue-router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const { maintenance, sites, robots, incidents, completeMaintenance, returnRobotFromBacklog } =
  useDemoData()
const router = useRouter()
const auth = useAuthStore()

// Tenant-модель (§3): работы только разрешённых объектов.
const scope = useTenantScope()
const scopedMaintenance = scope.maintenance(maintenance.value)
const scopedSites = scope.sites(sites.value)

const filterType = ref('all')
const filterStatus = ref('all')
const filterSite = ref('all')
const filterExecutor = ref('all')
// Точка входа сервисного инженера (ACC-005/019): «мои работы» по умолчанию.
const isEngineer = computed(() => auth.activeRoleCode === 'SERVICE_ENGINEER')
const filterQuick = ref(isEngineer.value ? 'mine' : 'all')
const searchText = ref('')
const selected = ref<MaintenanceWork | null>(null)
const actionError = ref<string | null>(null)

// Завершение ремонта (диалог)
const showComplete = ref(false)
const completeResult = ref('')
const completeTestRun = ref(true)
const completeParts = ref(0)
const completeLabor = ref(0)

const executors = computed(() => [...new Set(maintenance.value.map((m) => m.executor))].sort())

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
  let result = scopedMaintenance.value
  if (filterType.value !== 'all') result = result.filter((m) => m.type === filterType.value)
  if (filterStatus.value !== 'all') result = result.filter((m) => m.status === filterStatus.value)
  if (filterSite.value !== 'all') result = result.filter((m) => m.siteId === filterSite.value)
  if (filterExecutor.value !== 'all')
    result = result.filter((m) => m.executor === filterExecutor.value)
  switch (filterQuick.value) {
    // Представления сервисного бэклога (ТЗ v2.0 §8.6)
    case 'mine':
      // Личная очередь инженера (ACC-019): назначенные мне незавершённые работы.
      result = result.filter(
        (m) =>
          m.executor === (auth.user?.name ?? '') &&
          !['RESULT_CONFIRMED', 'CANCELLED'].includes(m.status),
      )
      break
    case 'new':
      result = result.filter((m) => ['PLANNED', 'ASSIGNED'].includes(m.status))
      break
    case 'diagnostics':
      result = result.filter(
        (m) =>
          m.type === 'DIAGNOSTIC' && !['DONE', 'RESULT_CONFIRMED', 'CANCELLED'].includes(m.status),
      )
      break
    case 'waiting_parts':
      result = result.filter((m) => m.status === 'WAITING_PARTS')
      break
    case 'in_repair':
      result = result.filter((m) => m.status === 'IN_PROGRESS')
      break
    case 'test_run':
      result = result.filter((m) => m.status === 'DONE' && !m.returnedToParkAt)
      break
    case 'overdue':
      result = result.filter((m) => isOverdue(m))
      break
    case 'ready_return':
      result = result.filter(
        (m) => m.status === 'DONE' && m.testRunPassed === true && !m.returnedToParkAt,
      )
      break
    case 'incident':
      result = result.filter((m) => m.incidentId !== null)
      break
    default:
      break
  }
  if (searchText.value.trim()) {
    const s = searchText.value.trim().toLowerCase()
    result = result.filter(
      (m) => m.title.toLowerCase().includes(s) || m.executor.toLowerCase().includes(s),
    )
  }
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

function incidentNumberOf(m: MaintenanceWork): string | null {
  if (!m.incidentId) return null
  return incidents.value.find((i) => i.id === m.incidentId)?.incidentNumber ?? null
}

function goIncident(m: MaintenanceWork): void {
  if (m.incidentId) router.push({ name: 'incident-details', params: { incidentId: m.incidentId } })
}

function openWork(m: MaintenanceWork): void {
  selected.value = m
  actionError.value = null
}

// Живой срез выбранной работы (обновляется после действий).
const selectedLive = computed(
  () => maintenance.value.find((m) => m.id === selected.value?.id) ?? null,
)

function openComplete(): void {
  const m = selectedLive.value
  if (!m) return
  completeResult.value = m.result ?? ''
  completeTestRun.value = true
  completeParts.value = m.partsCost
  completeLabor.value = m.laborCost
  actionError.value = null
  showComplete.value = true
}

function submitComplete(): void {
  const m = selectedLive.value
  if (!m || !completeResult.value.trim()) return
  const res = completeMaintenance(
    m.id,
    {
      result: completeResult.value.trim(),
      testRunPassed: completeTestRun.value,
      laborCost: completeLabor.value,
      partsCost: completeParts.value,
    },
    m.executor,
  )
  if (!res.ok) {
    actionError.value = res.reason ?? 'Не удалось завершить работу'
    return
  }
  showComplete.value = false
}

function submitReturn(): void {
  const m = selectedLive.value
  if (!m) return
  const res = returnRobotFromBacklog(m.id, m.executor)
  if (!res.ok) {
    actionError.value = res.reason ?? 'Не удалось вернуть робота'
    return
  }
}

function totalCost(m: MaintenanceWork): number {
  return m.laborCost + m.partsCost + m.externalCost
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

    <!-- Quick views (ТЗ v2.0 §8.6) -->
    <div class="flex flex-wrap gap-2">
      <Button
        v-for="q in [
          { key: 'mine', label: 'Мои работы' },
          { key: 'new', label: 'Новые' },
          { key: 'diagnostics', label: 'Диагностика' },
          { key: 'waiting_parts', label: 'Ожидает запчасти' },
          { key: 'in_repair', label: 'В ремонте' },
          { key: 'test_run', label: 'Контрольный запуск' },
          { key: 'overdue', label: 'Просрочено' },
          { key: 'ready_return', label: 'Готов к возврату' },
          { key: 'incident', label: 'Связанные с инцидентами' },
        ]"
        :key="q.key"
        :variant="filterQuick === q.key ? 'default' : 'outline'"
        size="sm"
        class="min-h-9"
        @click="filterQuick = filterQuick === q.key ? 'all' : q.key"
        >{{ q.label }}</Button
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
        <span class="text-xs text-muted-foreground block">Исполнитель</span>
        <Select v-model="filterExecutor" aria-label="Фильтр по исполнителю">
          <SelectTrigger class="w-[170px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все</SelectItem>
            <SelectItem v-for="e in executors" :key="e" :value="e">{{ e }}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div class="space-y-1 flex-1 min-w-[170px]">
        <span class="text-xs text-muted-foreground block">Поиск</span>
        <Input
          v-model="searchText"
          aria-label="Поиск по работам"
          placeholder="Название, исполнитель..."
        />
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
        <Table class="lg:max-2xl:table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead class="py-3 px-4 lg:max-2xl:w-26">Вид</TableHead>
              <TableHead class="py-3 px-4 lg:max-2xl:w-[42%]">Название</TableHead>
              <TableHead class="py-3 px-4 lg:max-2xl:hidden">Робот</TableHead>
              <TableHead class="py-3 px-4 lg:max-2xl:hidden">Объект</TableHead>
              <TableHead class="py-3 px-4 lg:max-2xl:hidden">Инцидент</TableHead>
              <TableHead class="py-3 px-4 lg:max-2xl:hidden">Исполнитель</TableHead>
              <TableHead class="py-3 px-4 lg:max-2xl:w-28">Срок возврата</TableHead>
              <TableHead class="py-3 px-4 lg:max-2xl:w-36">Статус</TableHead>
              <TableHead class="py-3 px-4 lg:max-2xl:w-24">Стоимость</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow
              v-for="m in filtered"
              :key="m.id"
              class="row-interactive cursor-pointer"
              @click="openWork(m)"
            >
              <TableCell class="py-3 px-4 lg:max-2xl:w-26">
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
              <TableCell
                class="text-xs py-3 px-4 max-w-xs lg:max-2xl:w-[42%] lg:max-2xl:max-w-none"
              >
                <p class="font-medium truncate" :title="m.title">{{ m.title }}</p>
                <p v-if="m.incidentId" class="text-primary text-xs">связан с инцидентом</p>
              </TableCell>
              <TableCell class="text-xs py-3 px-4 lg:max-2xl:hidden">{{
                robotName(m.robotId)
              }}</TableCell>
              <TableCell class="text-xs py-3 px-4 lg:max-2xl:hidden">{{
                siteName(m.siteId)
              }}</TableCell>
              <TableCell class="text-xs py-3 px-4 lg:max-2xl:hidden">
                <button
                  v-if="m.incidentId"
                  type="button"
                  class="text-primary hover:underline"
                  @click.stop="goIncident(m)"
                >
                  {{ incidentNumberOf(m) ?? m.incidentId }}
                </button>
                <span v-else class="text-muted-foreground">—</span>
              </TableCell>
              <TableCell class="text-xs py-3 px-4 lg:max-2xl:hidden">{{ m.executor }}</TableCell>
              <TableCell class="text-xs py-3 px-4 lg:max-2xl:w-28">
                {{ fmtDate(m.dueAt) }}
                <span v-if="isOverdue(m)" class="block text-destructive">просрочено</span>
                <span v-if="m.returnedToParkAt" class="block text-success">возвращён в парк</span>
              </TableCell>
              <TableCell class="py-3 px-4 lg:max-2xl:w-36">
                <span class="text-xs rounded px-1.5 py-0.5" :class="STATUS_CLASS[m.status]">{{
                  MAINTENANCE_STATUS_RU[m.status]
                }}</span>
                <span
                  v-if="m.testRunPassed"
                  class="ml-1 text-xs rounded px-1.5 py-0.5 bg-success/15 text-success"
                  >контр. запуск</span
                >
              </TableCell>
              <TableCell class="text-xs py-3 px-4 tabular-nums lg:max-2xl:w-24">
                <span v-if="totalCost(m) > 0">{{ totalCost(m).toLocaleString('ru-RU') }} ₽</span>
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
        <div v-if="selectedLive" class="space-y-4 text-sm">
          <div class="grid grid-cols-2 gap-3">
            <div>
              <p class="text-xs text-muted-foreground">Робот</p>
              <p>{{ robotName(selectedLive.robotId) }}</p>
            </div>
            <div>
              <p class="text-xs text-muted-foreground">Объект</p>
              <p>{{ siteName(selectedLive.siteId) }}</p>
            </div>
            <div>
              <p class="text-xs text-muted-foreground">Исполнитель</p>
              <p>{{ selectedLive.executor }}</p>
            </div>
            <div>
              <p class="text-xs text-muted-foreground">Целевой срок возврата</p>
              <p :class="isOverdue(selectedLive) ? 'text-destructive' : ''">
                {{ fmtDate(selectedLive.dueAt) }}
              </p>
            </div>
            <div v-if="selectedLive.completedAt">
              <p class="text-xs text-muted-foreground">Ремонт завершён</p>
              <p>{{ fmtDate(selectedLive.completedAt) }}</p>
            </div>
            <div v-if="selectedLive.returnedToParkAt">
              <p class="text-xs text-muted-foreground">Возвращён в парк</p>
              <p class="text-success">{{ fmtDate(selectedLive.returnedToParkAt) }}</p>
            </div>
          </div>
          <div v-if="selectedLive.problem" class="border-t pt-3">
            <p class="text-xs text-muted-foreground mb-1">Проблема</p>
            <p>{{ selectedLive.problem }}</p>
          </div>
          <div v-if="selectedLive.result" class="border-t pt-3">
            <p class="text-xs text-muted-foreground mb-1">Результат</p>
            <p>{{ selectedLive.result }}</p>
            <p
              v-if="selectedLive.testRunPassed !== null"
              class="text-xs mt-1"
              :class="selectedLive.testRunPassed ? 'text-success' : 'text-destructive'"
            >
              Контрольный запуск: {{ selectedLive.testRunPassed ? 'пройден' : 'не пройден' }}
            </p>
          </div>
          <div
            v-if="totalCost(selectedLive) > 0"
            class="border-t pt-3 grid grid-cols-3 gap-2 text-xs"
          >
            <div>
              <p class="text-muted-foreground">Труд</p>
              <p class="tabular-nums">{{ selectedLive.laborCost.toLocaleString('ru-RU') }} ₽</p>
            </div>
            <div>
              <p class="text-muted-foreground">Запчасти</p>
              <p class="tabular-nums">{{ selectedLive.partsCost.toLocaleString('ru-RU') }} ₽</p>
            </div>
            <div>
              <p class="text-muted-foreground">Итого ремонт</p>
              <p class="tabular-nums font-semibold">
                {{ totalCost(selectedLive).toLocaleString('ru-RU') }} ₽
              </p>
            </div>
          </div>
          <p v-if="actionError" class="text-xs text-destructive border-t pt-3">{{ actionError }}</p>
          <!-- Действия бэклога (ТЗ §8.6): завершить ремонт / вернуть в парк -->
          <div
            v-if="
              !['RESULT_CONFIRMED', 'CANCELLED'].includes(selectedLive.status) ||
              !selectedLive.returnedToParkAt
            "
            class="border-t pt-3 flex flex-wrap gap-2"
          >
            <Button
              v-if="!['DONE', 'RESULT_CONFIRMED'].includes(selectedLive.status)"
              size="sm"
              class="min-h-9"
              @click="openComplete"
            >
              Завершить ремонт с контрольным запуском
            </Button>
            <Button
              v-if="selectedLive.status === 'DONE' && !selectedLive.returnedToParkAt"
              size="sm"
              @click="submitReturn"
            >
              Вернуть робота в парк
            </Button>
          </div>
          <div v-if="selectedLive.incidentId" class="border-t pt-3">
            <button
              class="text-primary hover:underline text-sm"
              @click="
                () => {
                  if (!selectedLive?.incidentId) return
                  router.push({
                    name: 'incident-details',
                    params: { incidentId: selectedLive.incidentId },
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

    <!-- Диалог: завершение ремонта (контрольный запуск + стоимость) -->
    <Dialog :open="showComplete" @update:open="(v) => (showComplete = v)">
      <DialogContent class="max-w-md">
        <DialogHeader>
          <DialogTitle>Завершить ремонт</DialogTitle>
          <DialogDescription>
            Зафиксируйте результат, контрольный запуск и стоимость. Возврат робота в парк —
            отдельная контрольная точка после этой операции.
          </DialogDescription>
        </DialogHeader>
        <div class="space-y-3">
          <div class="space-y-1">
            <span class="text-xs text-muted-foreground block">Результат (минимум 20 символов)</span>
            <Textarea
              v-model="completeResult"
              aria-label="Результат ремонта"
              placeholder="Например: приводной модуль заменён, крепёж затянут моментом, тестовый маршрут пройден без ошибок"
            />
          </div>
          <label class="flex items-center gap-2 text-sm">
            <input
              v-model="completeTestRun"
              type="checkbox"
              aria-label="Контрольный запуск пройден"
            />
            Контрольный запуск пройден
          </label>
          <div class="grid grid-cols-2 gap-3">
            <div class="space-y-1">
              <span class="text-xs text-muted-foreground block">Труд, ₽</span>
              <Input
                v-model.number="completeLabor"
                type="number"
                min="0"
                aria-label="Стоимость труда"
              />
            </div>
            <div class="space-y-1">
              <span class="text-xs text-muted-foreground block">Запчасти, ₽</span>
              <Input
                v-model.number="completeParts"
                type="number"
                min="0"
                aria-label="Стоимость запчастей"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="showComplete = false">Отмена</Button>
          <Button
            :disabled="completeResult.trim().length < 20"
            :title="
              completeResult.trim().length < 20
                ? `Минимум 20 символов · осталось ${20 - completeResult.trim().length}`
                : ''
            "
            @click="submitComplete"
          >
            Завершить ремонт
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
