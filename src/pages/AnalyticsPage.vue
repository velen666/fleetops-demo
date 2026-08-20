<script setup lang="ts">
import { useDemoData } from '@/composables/useDemoData'
import { useAuthStore } from '@/stores/auth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import ChartCard from '@/components/ChartCard.vue'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { causeLabel, incidentTypeLabel } from '@/data/generator'
import { CAUSE_CATALOG } from '@/data/generator'
import { RESPONSIBILITY_ZONE_RU } from '@/data/labels'
import { useRouter } from 'vue-router'

const { analytics, costRates, costSnapshots, stats, incidents, sites, robots } = useDemoData()
const auth = useAuthStore()
const router = useRouter()

// Live offset (синхронизирован с дашбордом)
const liveOffset = ref({ lossRubles: 0 })
let liveTimer: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  liveTimer = setInterval(() => {
    liveOffset.value.lossRubles += Math.round(((Math.random() * 120 + 30) / 3600) * 55000)
  }, 12000)
})
onUnmounted(() => {
  if (liveTimer) clearInterval(liveTimer)
})
const liveLoss = computed(() => stats.value.totalLoss + liveOffset.value.lossRubles)

// ── Графики ──

// 1. Причины: horizontal bar (потери, ₽)
const causeLabels = computed(() =>
  analytics.value.paretoCauses.map((p) => causeLabel(p.code).split(' · ')[1] ?? p.name),
)
const causeLossData = computed(() => analytics.value.paretoCauses.map((p) => p.loss))

// 2. Объекты: stacked bar по зонам ответственности
const siteLabels = computed(() => analytics.value.lossBySite.map((s) => s.siteName))
const zoneColors: Record<string, string> = {
  OPERATIONS: '#ff6b6b',
  IT: '#00a0e9',
  SERVICE: '#fcd34d',
  INFRASTRUCTURE: '#10b981',
  UNKNOWN: '#64748b',
}
const siteZoneDatasets = computed(() => {
  const zones = new Set<string>()
  for (const inc of incidents.value) {
    if (inc.lossRubles > 0 && inc.causeCode)
      zones.add(CAUSE_CATALOG[inc.causeCode]?.zone ?? 'UNKNOWN')
  }
  return [...zones].map((zone) => ({
    label: RESPONSIBILITY_ZONE_RU[zone] ?? zone,
    color: zoneColors[zone] ?? '#64748b',
    data: sites.value.map((site) =>
      incidents.value
        .filter(
          (i) =>
            i.siteId === site.id &&
            i.lossRubles > 0 &&
            i.causeCode &&
            (CAUSE_CATALOG[i.causeCode]?.zone ?? 'UNKNOWN') === zone,
        )
        .reduce((s, i) => s + i.lossRubles, 0),
    ),
  }))
})

// 3. Повторяемость: vertical bar (количество)
const repeatLabels = computed(() =>
  analytics.value.repeatProblems.map((p) => causeLabel(p.code).split(' · ')[1] ?? p.name),
)
const repeatData = computed(() => analytics.value.repeatProblems.map((p) => p.count))

// 4. Реакция/восстановление: grouped bar (минуты)
const rtLabels = computed(() => {
  const withReaction = incidents.value.filter((i) => i.reactionSlaSeconds !== null)
  const withRecovery = incidents.value.filter((i) => i.recoverySlaSeconds !== null)
  return [`Реакция (n=${withReaction.length})`, `Восстановление (n=${withRecovery.length})`]
})
const rtDatasets = computed(() => {
  const reactions = incidents.value
    .filter((i) => i.reactionSlaSeconds !== null)
    .map((i) => (i.reactionSlaSeconds ?? 0) / 60)
  const recoveries = incidents.value
    .filter((i) => i.recoverySlaSeconds !== null)
    .map((i) => (i.recoverySlaSeconds ?? 0) / 60)
  const avg = (arr: number[]) =>
    arr.length > 0 ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length) : 0
  const median = (arr: number[]) => {
    if (arr.length === 0) return 0
    const s = [...arr].sort((a, b) => a - b)
    const mid = Math.floor(s.length / 2)
    return Math.round(s.length % 2 === 0 ? (s[mid - 1]! + s[mid]!) / 2 : s[mid]!)
  }
  return [
    { label: 'Среднее, мин', color: '#00a0e9', data: [avg(reactions), avg(recoveries)] },
    { label: 'Медиана, мин', color: '#8b5cf6', data: [median(reactions), median(recoveries)] },
    { label: 'Целевое, мин', color: '#10b981', data: [10, 120] },
  ]
})

// Drill-down
const showBreakdown = ref(false)
const breakdownTitle = ref('')
function openBreakdown(title: string): void {
  breakdownTitle.value = title
  showBreakdown.value = true
}
const lossIncidents = computed(() => incidents.value.filter((i) => i.lossRubles > 0))
</script>

<template>
  <div class="space-y-6">
    <!-- KPIs -->
    <div class="grid gap-4 md:grid-cols-4">
      <Card class="kpi-clickable" @click="openBreakdown('Суммарные подтверждённые потери')">
        <CardContent class="p-4">
          <p class="text-sm text-muted-foreground">Подтверждённые потери</p>
          <p class="text-2xl font-bold tabular-nums">{{ liveLoss.toLocaleString('ru-RU') }} ₽</p>
          <p class="text-xs text-muted-foreground mt-0.5">
            {{ lossIncidents.length }} инцидентов с потерями
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardContent class="p-4">
          <p class="text-sm text-muted-foreground">Средний ущерб на инцидент</p>
          <p class="text-2xl font-bold tabular-nums">
            {{
              lossIncidents.length > 0
                ? Math.round(liveLoss / lossIncidents.length).toLocaleString('ru-RU')
                : 0
            }}
            ₽
          </p>
          <p class="text-xs text-muted-foreground mt-0.5">
            на {{ lossIncidents.length }} инц. с подтверждёнными потерями
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardContent class="p-4">
          <p class="text-sm text-muted-foreground">Неклассифицированные потери</p>
          <p class="text-2xl font-bold tabular-nums text-warning">
            {{
              incidents
                .filter(
                  (i) =>
                    (i.causeMaturity === 'NONE' || i.causeCode === 'CA-060') && i.lossRubles > 0,
                )
                .reduce((s, i) => s + i.lossRubles, 0)
                .toLocaleString('ru-RU')
            }}
            ₽
          </p>
          <p class="text-xs text-muted-foreground mt-0.5">
            {{
              incidents.filter(
                (i) => (i.causeMaturity === 'NONE' || i.causeCode === 'CA-060') && i.lossRubles > 0,
              ).length
            }}
            инц. без причины
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardContent class="p-4">
          <p class="text-sm text-muted-foreground">Доступность парка (30 дней)</p>
          <p class="text-2xl font-bold tabular-nums text-success">
            {{ stats.availability.toFixed(1) }}%
          </p>
          <p class="text-xs text-muted-foreground mt-0.5">
            {{ robots.length }} роботов · {{ stats.totalDowntimeHours }} ч простой
          </p>
        </CardContent>
      </Card>
    </div>

    <!-- Причины: horizontal bar -->
    <Card class="card-interactive" @click="openBreakdown('Потери по причинам')">
      <CardHeader><CardTitle>Потери по причинам</CardTitle></CardHeader>
      <CardContent>
        <ChartCard
          type="bar"
          :labels="causeLabels"
          :datasets="[{ label: 'Потери', data: causeLossData }]"
          horizontal
          suffix=" ₽"
        />
      </CardContent>
    </Card>

    <!-- Объекты: stacked bar по зонам -->
    <Card class="card-interactive" @click="openBreakdown('Потери по объектам')">
      <CardHeader><CardTitle>Потери по объектам и зонам ответственности</CardTitle></CardHeader>
      <CardContent>
        <ChartCard
          type="bar-stacked"
          :labels="siteLabels"
          :datasets="siteZoneDatasets"
          suffix=" ₽"
        />
      </CardContent>
    </Card>

    <!-- Повторяемость + Время реакции -->
    <div class="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>Повторяемость причин</CardTitle></CardHeader>
        <CardContent>
          <ChartCard
            type="bar"
            :labels="repeatLabels"
            :datasets="[{ label: 'Инцидентов', data: repeatData, color: '#f97316' }]"
            suffix=" инц."
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Время реакции и восстановления</CardTitle></CardHeader>
        <CardContent>
          <ChartCard type="bar" :labels="rtLabels" :datasets="rtDatasets" suffix=" мин" />
        </CardContent>
      </Card>
    </div>

    <!-- Детализация повторяемости -->
    <Card>
      <CardHeader><CardTitle>Повторяемость проблем — детализация</CardTitle></CardHeader>
      <CardContent>
        <div class="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <div
            v-for="item in analytics.repeatProblems"
            :key="item.code"
            class="card-interactive border border-border rounded-lg p-3 cursor-pointer"
            @click="router.push({ name: 'incidents' })"
          >
            <div class="flex justify-between mb-1">
              <span class="font-medium text-sm">{{ causeLabel(item.code) }}</span>
              <span class="text-lg font-bold tabular-nums">{{ item.count }}×</span>
            </div>
            <p class="text-xs text-muted-foreground">
              {{ item.loss.toLocaleString('ru-RU') }} ₽ потерь
            </p>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- Ставки -->
    <Card v-if="auth.can('economics.rates.manage')">
      <CardHeader><CardTitle>Ставки стоимости простоя</CardTitle></CardHeader>
      <CardContent class="p-0">
        <Table>
          <TableHeader
            ><TableRow>
              <TableHead class="py-2 px-4">Объект</TableHead
              ><TableHead class="py-2 px-4">Ставка</TableHead>
              <TableHead class="py-2 px-4">Действует с</TableHead
              ><TableHead class="py-2 px-4">Основание</TableHead>
            </TableRow></TableHeader
          >
          <TableBody>
            <TableRow v-for="rate in costRates" :key="rate.id" class="row-interactive">
              <TableCell class="text-sm py-3 px-4">{{ rate.siteName }}</TableCell>
              <TableCell class="text-sm font-medium tabular-nums py-3 px-4"
                >{{ rate.ratePerHour.toLocaleString('ru-RU') }} ₽/ч</TableCell
              >
              <TableCell class="text-xs font-mono py-3 px-4">{{
                rate.effectiveFrom.slice(0, 10)
              }}</TableCell>
              <TableCell class="text-xs py-3 px-4">{{ rate.basis }}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>

    <!-- Расшифровка -->
    <Card>
      <CardHeader>
        <div class="flex items-center justify-between">
          <CardTitle>Расшифровка потерь</CardTitle>
          <button
            class="text-xs text-primary hover:underline"
            @click="openBreakdown('Расшифровка потерь')"
          >
            Показать все →
          </button>
        </div>
      </CardHeader>
      <CardContent class="p-0">
        <Table>
          <TableHeader
            ><TableRow>
              <TableHead class="py-2 px-4">Инцидент</TableHead
              ><TableHead class="py-2 px-4">Часов</TableHead>
              <TableHead class="py-2 px-4">Ставка</TableHead
              ><TableHead class="py-2 px-4">Формула</TableHead
              ><TableHead class="py-2 px-4">Сумма</TableHead>
            </TableRow></TableHeader
          >
          <TableBody>
            <TableRow
              v-for="snap in costSnapshots.slice(0, 10)"
              :key="snap.downtimeId"
              class="row-interactive cursor-pointer"
              @click="
                router.push({ name: 'incident-details', params: { incidentId: snap.incidentId } })
              "
            >
              <TableCell class="text-xs py-3 px-4 text-primary hover:underline">{{
                snap.incidentId
              }}</TableCell>
              <TableCell class="text-sm tabular-nums py-3 px-4">{{
                snap.hours.toFixed(2)
              }}</TableCell>
              <TableCell class="text-sm tabular-nums py-3 px-4"
                >{{ snap.ratePerHour.toLocaleString('ru-RU') }} ₽</TableCell
              >
              <TableCell class="text-xs text-muted-foreground py-3 px-4">{{
                snap.formula
              }}</TableCell>
              <TableCell class="text-sm font-medium tabular-nums py-3 px-4"
                >{{ snap.totalRubles.toLocaleString('ru-RU') }} ₽</TableCell
              >
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>

    <!-- Drill-down -->
    <Dialog v-model:open="showBreakdown">
      <DialogContent class="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{{ breakdownTitle }}</DialogTitle>
          <DialogDescription>Детализация: каждая запись из расчёта</DialogDescription>
        </DialogHeader>
        <Table>
          <TableHeader
            ><TableRow>
              <TableHead>Инцидент</TableHead><TableHead>Тип</TableHead
              ><TableHead>Причина</TableHead> <TableHead>Часов</TableHead
              ><TableHead>Сумма</TableHead>
            </TableRow></TableHeader
          >
          <TableBody>
            <TableRow
              v-for="inc in lossIncidents"
              :key="inc.id"
              class="row-interactive cursor-pointer"
              @click="
                router.push({ name: 'incident-details', params: { incidentId: inc.id } })
                showBreakdown = false
              "
            >
              <TableCell class="text-xs py-2 px-4 text-primary">{{ inc.incidentNumber }}</TableCell>
              <TableCell class="text-xs py-2 px-4">{{
                incidentTypeLabel(inc.incidentTypeCode).split(' · ')[1]
              }}</TableCell>
              <TableCell class="text-xs py-2 px-4">{{
                causeLabel(inc.causeCode).split(' · ')[1] ?? '—'
              }}</TableCell>
              <TableCell class="text-xs tabular-nums py-2 px-4">{{
                (inc.downtimeSeconds / 3600).toFixed(1)
              }}</TableCell>
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
