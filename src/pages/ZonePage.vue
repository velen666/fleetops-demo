<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDemoData } from '@/composables/useDemoData'
import { causeLabel } from '@/data/generator'
import {
  FLEET_STATE_RU,
  FLEET_STATE_CLASS,
  INCIDENT_STATUS_RU,
  INCIDENT_STATUS_CLASS,
  INTERVAL_TYPE_RU,
  DOWNTIME_STATUS_RU,
} from '@/data/labels'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ChevronRight, MapPin } from 'lucide-vue-next'

const route = useRoute()
const router = useRouter()
const { sites, robots, incidents, downtimes, zones, maintenance } = useDemoData()

const siteId = computed(() => String(route.params.siteId ?? ''))
const zoneCode = computed(() => String(route.params.zoneCode ?? ''))

const site = computed(() => sites.value.find((s) => s.id === siteId.value))
const zone = computed(() =>
  zones.value.find((z) => z.siteId === siteId.value && z.code === zoneCode.value),
)
const zoneName = computed(() => zone.value?.name ?? zoneCode.value)

// Мощность: требуемая из справочника, фактическая — работающие в зоне (§8.2).
const workingNow = computed(
  () =>
    robots.value.filter((r) => r.zoneId === zone.value?.id && r.fleetState === 'WORKING').length,
)
const deficit = computed(() =>
  zone.value ? Math.max(0, zone.value.requiredCapacity - workingNow.value) : 0,
)

// Роботы зоны: работающие/назначенные + затронутые инцидентами зоны.
const zoneRobots = computed(() => {
  const inZone = new Set<string>()
  for (const r of robots.value)
    if (r.zoneId === zone.value?.id || (r.zoneName ?? '').startsWith(zoneCode.value))
      inZone.add(r.id)
  for (const i of zoneIncidents.value) if (i.robotId) inZone.add(i.robotId)
  return robots.value
    .filter((r) => inZone.has(r.id))
    .map((r) => ({
      ...r,
      activeWork: maintenance.value.find(
        (m) => m.robotId === r.id && !['DONE', 'RESULT_CONFIRMED', 'CANCELLED'].includes(m.status),
      ),
      activeIncident: incidents.value.find((i) => i.robotId === r.id && i.status !== 'CLOSED'),
    }))
})

const zoneIncidents = computed(() =>
  incidents.value
    .filter((i) => i.siteId === siteId.value && (i.zoneName ?? '').startsWith(zoneCode.value))
    .sort((a, b) => b.detectedAt.localeCompare(a.detectedAt)),
)

const zoneDowntimes = computed(() =>
  downtimes.value.filter(
    (d) => d.siteId === siteId.value && (d.zoneName ?? '').startsWith(zoneCode.value),
  ),
)

const impact = computed(() =>
  zoneDowntimes.value.filter(
    (d) =>
      d.intervalType === 'OPERATIONAL_IMPACT' &&
      (d.confirmationStatus === 'CONFIRMED' || d.confirmationStatus === 'ADJUSTED'),
  ),
)

const loss = computed(() => impact.value.reduce((s, d) => s + d.lossRubles, 0))
const impactHours = computed(
  () => impact.value.reduce((s, d) => s + d.accountableDurationSeconds, 0) / 3600,
)
const techHours = computed(
  () =>
    zoneDowntimes.value
      .filter((d) => d.intervalType === 'TECHNICAL_UNAVAILABLE' && d.intervalState === 'CLOSED')
      .reduce((s, d) => s + d.accountableDurationSeconds, 0) / 3600,
)

const topCauses = computed(() => {
  const by = new Map<string, number>()
  for (const i of zoneIncidents.value)
    if (i.causeCode && i.causeMaturity !== 'NONE')
      by.set(i.causeCode, (by.get(i.causeCode) ?? 0) + 1)
  return [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4)
})

function fmtTime(iso: string | null): string {
  return iso ? iso.slice(0, 16).replace('T', ' ') : '—'
}
function fmtDur(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  return h > 0 ? `${h} ч ${m} мин` : `${m} мин`
}
function goIncident(id: string): void {
  router.push({ name: 'incident-details', params: { incidentId: id } })
}
function goRobot(id: string): void {
  router.push({ name: 'robot-details', params: { robotId: id } })
}
</script>

<template>
  <div v-if="site && zone" class="space-y-4">
    <!-- Хлебные крошки: Объекты → РЦ Подольск → C-12 (ТЗ v2.0 §4) -->
    <nav class="flex items-center gap-1 text-sm text-muted-foreground" aria-label="Хлебные крошки">
      <button
        type="button"
        class="hover:text-foreground underline-offset-2"
        @click="router.push({ name: 'sites' })"
      >
        Объекты
      </button>
      <ChevronRight class="size-3.5" />
      <button
        type="button"
        class="hover:text-foreground underline-offset-2"
        @click="router.push({ name: 'site-details', params: { siteId } })"
      >
        {{ site.name }}
      </button>
      <ChevronRight class="size-3.5" />
      <span class="text-foreground font-medium">{{ zoneName }}</span>
    </nav>

    <!-- Заголовок и мощность -->
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex items-center gap-3">
        <MapPin class="size-5 text-primary" />
        <div>
          <h1 class="text-xl font-semibold">{{ zoneName }}</h1>
          <p class="text-sm text-muted-foreground">
            {{ site.name }} · Процесс: {{ zone.process }} · Ответственный:
            {{ zone.responsibleName }}
          </p>
        </div>
      </div>
      <div
        class="rounded-lg border px-4 py-2"
        :class="deficit > 0 ? 'border-destructive/50 bg-destructive/5' : 'border-success/50'"
      >
        <p class="text-xs text-muted-foreground">Мощность зоны</p>
        <p
          class="text-lg font-bold tabular-nums"
          :class="deficit > 0 ? 'text-destructive' : 'text-success'"
        >
          {{ workingNow }} / {{ zone.requiredCapacity }}
          <span v-if="deficit > 0" class="text-sm font-normal">· дефицит {{ deficit }} ед.</span>
        </p>
      </div>
    </div>

    <!-- Экономика зоны -->
    <div class="grid gap-4 grid-cols-2 md:grid-cols-4">
      <Card>
        <CardContent class="p-4">
          <p class="text-sm text-muted-foreground">Операционное влияние</p>
          <p class="text-2xl font-bold tabular-nums">{{ impactHours.toFixed(1) }} ч</p>
          <p class="text-xs text-muted-foreground mt-0.5">{{ impact.length }} подтверждённых</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent class="p-4">
          <p class="text-sm text-muted-foreground">Потери процесса</p>
          <p class="text-2xl font-bold tabular-nums text-destructive">
            {{ loss.toLocaleString('ru-RU') }} ₽
          </p>
          <p class="text-xs text-muted-foreground mt-0.5">
            ставка {{ site.ratePerHour.toLocaleString('ru-RU') }} ₽/ч
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardContent class="p-4">
          <p class="text-sm text-muted-foreground">Технедоступность</p>
          <p class="text-2xl font-bold tabular-nums">{{ techHours.toFixed(1) }} ч</p>
          <p class="text-xs text-muted-foreground mt-0.5">без начисления потерь</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent class="p-4">
          <p class="text-sm text-muted-foreground">Инциденты</p>
          <p class="text-2xl font-bold tabular-nums">{{ zoneIncidents.length }}</p>
          <p class="text-xs text-muted-foreground mt-0.5">
            активных: {{ zoneIncidents.filter((i) => i.status !== 'CLOSED').length }}
          </p>
        </CardContent>
      </Card>
    </div>

    <!-- Роботы зоны -->
    <Card>
      <CardHeader
        ><CardTitle class="text-base">Роботы зоны ({{ zoneRobots.length }})</CardTitle>
        <p class="text-xs text-muted-foreground">
          Затронутые инцидентами единицы включаются в срез с их текущим состоянием
        </p></CardHeader
      >
      <CardContent class="p-0">
        <Table>
          <TableHeader
            ><TableRow>
              <TableHead class="py-2 px-3">Робот</TableHead>
              <TableHead class="py-2 px-3">Состояние</TableHead>
              <TableHead class="py-2 px-3">Активный инцидент</TableHead>
              <TableHead class="py-2 px-3">Сервисная работа</TableHead>
            </TableRow></TableHeader
          >
          <TableBody>
            <TableEmpty v-if="zoneRobots.length === 0" :colspan="4">Роботов в зоне нет.</TableEmpty>
            <TableRow
              v-for="r in zoneRobots"
              :key="r.id"
              class="row-interactive cursor-pointer"
              @click="goRobot(r.id)"
            >
              <TableCell class="text-sm font-medium py-2 px-3">{{ r.name }}</TableCell>
              <TableCell class="py-2 px-3">
                <span
                  class="text-xs rounded px-1.5 py-0.5"
                  :class="FLEET_STATE_CLASS[r.fleetState]"
                >
                  {{ FLEET_STATE_RU[r.fleetState] }}
                </span>
              </TableCell>
              <TableCell class="text-xs py-2 px-3">
                <span v-if="r.activeIncident" class="text-primary">
                  {{ r.activeIncident.incidentNumber }}
                </span>
                <span v-else class="text-muted-foreground">—</span>
              </TableCell>
              <TableCell class="text-xs py-2 px-3 max-w-[260px]">
                <span v-if="r.activeWork" class="truncate block">
                  {{ r.activeWork.title }} (срок {{ r.activeWork.dueAt.slice(0, 10) }})
                </span>
                <span v-else class="text-muted-foreground">—</span>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>

    <div class="grid gap-4 lg:grid-cols-2">
      <!-- Инциденты зоны -->
      <Card>
        <CardHeader><CardTitle class="text-base">Инциденты зоны</CardTitle></CardHeader>
        <CardContent class="p-0">
          <Table>
            <TableHeader
              ><TableRow>
                <TableHead class="py-2 px-3">Инцидент</TableHead>
                <TableHead class="py-2 px-3">Статус</TableHead>
                <TableHead class="py-2 px-3">Причина</TableHead>
              </TableRow></TableHeader
            >
            <TableBody>
              <TableEmpty v-if="zoneIncidents.length === 0" :colspan="3"
                >Инцидентов в зоне нет.</TableEmpty
              >
              <TableRow
                v-for="i in zoneIncidents"
                :key="i.id"
                class="row-interactive cursor-pointer"
                @click="goIncident(i.id)"
              >
                <TableCell class="py-2 px-3">
                  <p class="text-xs text-primary font-mono">{{ i.incidentNumber }}</p>
                  <p class="text-xs text-muted-foreground truncate max-w-[220px]">{{ i.title }}</p>
                </TableCell>
                <TableCell class="py-2 px-3">
                  <span
                    class="text-xs rounded px-1.5 py-0.5"
                    :class="INCIDENT_STATUS_CLASS[i.status]"
                    >{{ INCIDENT_STATUS_RU[i.status] }}</span
                  >
                </TableCell>
                <TableCell class="text-xs py-2 px-3">{{ causeLabel(i.causeCode) }}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <!-- Простои зоны -->
      <Card>
        <CardHeader><CardTitle class="text-base">Простои зоны</CardTitle></CardHeader>
        <CardContent class="p-0">
          <Table>
            <TableHeader
              ><TableRow>
                <TableHead class="py-2 px-3">Тип</TableHead>
                <TableHead class="py-2 px-3">Период</TableHead>
                <TableHead class="py-2 px-3">Длительность</TableHead>
                <TableHead class="py-2 px-3">Статус</TableHead>
              </TableRow></TableHeader
            >
            <TableBody>
              <TableEmpty v-if="zoneDowntimes.length === 0" :colspan="4">Записей нет.</TableEmpty>
              <TableRow
                v-for="d in zoneDowntimes"
                :key="d.id"
                class="row-interactive cursor-pointer"
                @click="goIncident(d.incidentId)"
              >
                <TableCell class="text-xs py-2 px-3">{{
                  INTERVAL_TYPE_RU[d.intervalType]
                }}</TableCell>
                <TableCell class="text-xs font-mono py-2 px-3">
                  {{ fmtTime(d.startedAt) }} — {{ d.endedAt ? fmtTime(d.endedAt) : 'продолжается' }}
                </TableCell>
                <TableCell class="text-xs tabular-nums py-2 px-3">
                  {{
                    d.accountableDurationSeconds > 0 ? fmtDur(d.accountableDurationSeconds) : '—'
                  }}
                </TableCell>
                <TableCell class="text-xs py-2 px-3">{{
                  DOWNTIME_STATUS_RU[d.confirmationStatus]
                }}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>

    <!-- Причины зоны -->
    <Card>
      <CardHeader><CardTitle class="text-base">Причины в зоне</CardTitle></CardHeader>
      <CardContent>
        <div v-if="topCauses.length === 0" class="text-sm text-muted-foreground">
          Причины не подтверждены — разбор продолжается.
        </div>
        <div v-else class="flex flex-wrap gap-2">
          <span
            v-for="[code, n] in topCauses"
            :key="code"
            class="rounded-lg border border-border px-3 py-1.5 text-sm"
          >
            {{ causeLabel(code) }} · <span class="tabular-nums">{{ n }} сл.</span>
          </span>
        </div>
      </CardContent>
    </Card>
  </div>
  <div v-else class="space-y-4">
    <p class="text-sm text-muted-foreground">Зона не найдена.</p>
    <Button variant="outline" @click="router.back()">Назад</Button>
  </div>
</template>
