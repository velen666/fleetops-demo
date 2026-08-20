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

const { incidents, downtimes, analytics, robots, sites, costRates } = useDemoData()
const auth = useAuthStore()
const router = useRouter()

const selectedSite = ref('all')
const showBreakdown = ref(false)
const breakdownTitle = ref('')

const siteName = computed(() =>
  selectedSite.value === 'all'
    ? 'Все объекты'
    : (sites.value.find((s) => s.id === selectedSite.value)?.name ?? ''),
)

const filteredIncidents = computed(() =>
  selectedSite.value === 'all'
    ? incidents.value
    : incidents.value.filter((i) => i.siteId === selectedSite.value),
)
const filteredDowntimes = computed(() =>
  selectedSite.value === 'all'
    ? downtimes.value
    : downtimes.value.filter((d) => d.siteId === selectedSite.value),
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
  const lines = [
    'ZIMA FleetOps — Управленческий отчёт',
    `Период: последние 30 дней | Объект: ${siteName.value}`,
    `Дата формирования: ${new Date().toLocaleString('ru-RU')}`,
    '',
    '=== СВОДКА ===',
    `Доступность: ${(100 - (filteredStats.value.totalDowntime / (30 * 24 * 3600)) * 100).toFixed(1)}%`,
    `Простой: ${(filteredStats.value.totalDowntime / 3600).toFixed(1)} ч`,
    `Потери: ${filteredStats.value.totalLoss.toLocaleString('ru-RU')} ₽`,
    `Инцидентов: ${filteredStats.value.total} (активных: ${filteredStats.value.active})`,
    `Неклассифицированных: ${filteredStats.value.unclassified} (${filteredStats.value.total > 0 ? ((filteredStats.value.unclassified / filteredStats.value.total) * 100).toFixed(0) : 0}%)`,
    '',
    '=== ТОП ПРИЧИН ===',
    ...topCauses.value.map(
      (c, i) =>
        `  ${i + 1}. ${causeLabel(c.code)}: ${c.count} случаев, ${c.hours.toFixed(1)} ч, ${c.loss.toLocaleString('ru-RU')} ₽`,
    ),
    '',
    '=== SLA ===',
    `Реакция: ${analytics.value.sla.reactionMet} в норме, ${analytics.value.sla.reactionViolated} нарушено`,
    `Восстановление: ${analytics.value.sla.recoveryMet} в норме, ${analytics.value.sla.recoveryViolated} нарушено`,
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
    <!-- Toolbar -->
    <div class="flex items-center gap-3">
      <div class="space-y-1">
        <span class="text-xs text-muted-foreground block">Объект</span>
        <Select v-model="selectedSite" aria-label="Выбор объекта">
          <SelectTrigger class="w-[220px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все объекты</SelectItem>
            <SelectItem v-for="s in sites" :key="s.id" :value="s.id">{{ s.name }}</SelectItem>
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
                CAUSE_CATALOG[c.code]?.zone ?? '—'
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

    <!-- SLA summary -->
    <div class="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>SLA реакции</CardTitle></CardHeader>
        <CardContent>
          <div class="flex gap-6">
            <div class="text-center">
              <p class="text-3xl font-bold text-success tabular-nums">
                {{ analytics.sla.reactionMet }}
              </p>
              <p class="text-xs text-muted-foreground">в норме</p>
            </div>
            <div class="text-center">
              <p class="text-3xl font-bold text-destructive tabular-nums">
                {{ analytics.sla.reactionViolated }}
              </p>
              <p class="text-xs text-muted-foreground">нарушено</p>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>SLA восстановления</CardTitle></CardHeader>
        <CardContent>
          <div class="flex gap-6">
            <div class="text-center">
              <p class="text-3xl font-bold text-success tabular-nums">
                {{ analytics.sla.recoveryMet }}
              </p>
              <p class="text-xs text-muted-foreground">в норме</p>
            </div>
            <div class="text-center">
              <p class="text-3xl font-bold text-destructive tabular-nums">
                {{ analytics.sla.recoveryViolated }}
              </p>
              <p class="text-xs text-muted-foreground">нарушено</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- Breakdown dialog -->
    <Dialog v-model:open="showBreakdown">
      <DialogContent class="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{{ breakdownTitle }}</DialogTitle>
          <DialogDescription>Расшифровка показателя — {{ siteName }}</DialogDescription>
        </DialogHeader>
        <Table>
          <TableHeader
            ><TableRow>
              <TableHead>Инцидент</TableHead><TableHead>Тип</TableHead
              ><TableHead>Причина</TableHead> <TableHead>Простой</TableHead
              ><TableHead>Потери</TableHead>
            </TableRow></TableHeader
          >
          <TableBody>
            <TableRow
              v-for="inc in filteredIncidents.filter((i) => i.lossRubles > 0)"
              :key="inc.id"
              class="row-interactive cursor-pointer"
              @click="
                router.push({ name: 'incident-details', params: { incidentId: inc.id } })
                showBreakdown = false
              "
            >
              <TableCell class="text-xs py-2 px-4 text-primary">{{ inc.incidentNumber }}</TableCell>
              <TableCell class="text-xs py-2 px-4">{{
                incidentTypeLabel(inc.incidentTypeCode)
              }}</TableCell>
              <TableCell class="text-xs py-2 px-4">{{ causeLabel(inc.causeCode) }}</TableCell>
              <TableCell class="text-xs tabular-nums py-2 px-4"
                >{{ (inc.downtimeSeconds / 3600).toFixed(1) }} ч</TableCell
              >
              <TableCell class="text-xs font-medium tabular-nums py-2 px-4"
                >{{ inc.lossRubles.toLocaleString('ru-RU') }} ₽</TableCell
              >
            </TableRow>
          </TableBody>
        </Table>
      </DialogContent>
    </Dialog>
  </div>
</template>
