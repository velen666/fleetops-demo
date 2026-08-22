<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDemoData } from '@/composables/useDemoData'
import { causeLabel } from '@/data/generator'
import {
  INCIDENT_STATUS_RU,
  INCIDENT_STATUS_CLASS,
  MAINTENANCE_STATUS_RU,
  MAINTENANCE_TYPE_RU,
  sourceInstanceLabel,
} from '@/data/labels'
import { Button } from '@/components/ui/button'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ArrowLeft, Bot } from 'lucide-vue-next'

const route = useRoute()
const router = useRouter()
const { robots, sites, incidents, downtimes, events, maintenance } = useDemoData()

const robotId = computed(() => String(route.params.robotId ?? ''))
const robot = computed(() => robots.value.find((r) => r.id === robotId.value))

function siteName(id: string): string {
  return sites.value.find((s) => s.id === id)?.name ?? id
}
function fmtTime(iso: string | null): string {
  return iso ? iso.slice(0, 16).replace('T', ' ') : '—'
}
function fmtDur(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  return h > 0 ? `${h} ч ${m} мин` : `${m} мин`
}

const robotIncidents = computed(() =>
  incidents.value
    .filter((i) => i.robotId === robotId.value)
    .sort((a, b) => b.detectedAt.localeCompare(a.detectedAt)),
)
const robotDowntimes = computed(() => downtimes.value.filter((d) => d.robotId === robotId.value))
const robotEvents = computed(() =>
  events.value
    .filter((e) => e.robotId === robotId.value)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 50),
)
const robotMaintenance = computed(() =>
  maintenance.value
    .filter((m) => m.robotId === robotId.value)
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt)),
)

const metrics = computed(() => {
  const confirmed = robotDowntimes.value.filter(
    (d) => d.confirmationStatus === 'CONFIRMED' || d.confirmationStatus === 'ADJUSTED',
  )
  const dtSec = confirmed.reduce((s, d) => s + d.accountableDurationSeconds, 0)
  const fund = 30 * 24
  // повторяющиеся причины робота
  const byCause = new Map<string, number>()
  for (const i of robotIncidents.value) {
    if (i.causeCode) byCause.set(i.causeCode, (byCause.get(i.causeCode) ?? 0) + 1)
  }
  const repeatCauses = [...byCause.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
  const sorted = [...robotMaintenance.value].sort((a, b) => a.dueAt.localeCompare(b.dueAt))
  return {
    incidentsCount: robotIncidents.value.length,
    activeIncidents: robotIncidents.value.filter((i) => i.status !== 'CLOSED').length,
    dtHours: dtSec / 3600,
    loss: confirmed.reduce((s, d) => s + d.lossRubles, 0),
    availability: Math.max(0, 100 - (dtSec / 3600 / fund) * 100),
    repeatCauses,
    lastWork: sorted.find((m) => m.completedAt) ?? null,
    nextWork: sorted.find((m) => !m.completedAt) ?? null,
  }
})

function goBack(): void {
  router.push({ name: 'robots' })
}
function goIncident(id: string): void {
  router.push({ name: 'incident-details', params: { incidentId: id } })
}
</script>

<template>
  <div v-if="robot" class="space-y-4">
    <Button variant="ghost" size="sm" @click="goBack"
      ><ArrowLeft class="size-4 mr-1" /> К парку</Button
    >

    <!-- Шапка + верхняя лента показателей (§33.2) -->
    <Card>
      <CardContent class="p-5 space-y-3">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="space-y-1">
            <div class="flex items-center gap-2">
              <Bot class="size-5 text-primary" />
              <h1 class="text-xl font-bold">{{ robot.name }}</h1>
            </div>
            <p class="text-sm text-muted-foreground">
              {{ robot.vendor }} · {{ robot.model }}
              <span class="ml-2 font-mono text-xs">S/N {{ robot.serialNumber ?? '—' }}</span>
            </p>
            <p class="text-xs text-muted-foreground">
              {{ siteName(robot.siteId)
              }}<span v-if="robot.zoneName"> · зона {{ robot.zoneName }}</span> · источник:
              {{ sourceInstanceLabel('RMS', robot.siteId) }}
            </p>
          </div>
        </div>
        <div class="grid grid-cols-2 md:grid-cols-5 gap-4 border-t pt-3">
          <div>
            <p class="text-xs text-muted-foreground">Доступность (30 дней)</p>
            <p class="text-lg font-bold tabular-nums text-success">
              {{ metrics.availability.toFixed(1) }}%
            </p>
          </div>
          <div>
            <p class="text-xs text-muted-foreground">Активных инцидентов</p>
            <p class="text-lg font-bold tabular-nums">{{ metrics.activeIncidents }}</p>
          </div>
          <div>
            <p class="text-xs text-muted-foreground">Простой</p>
            <p class="text-lg font-bold tabular-nums">{{ metrics.dtHours.toFixed(1) }} ч</p>
          </div>
          <div>
            <p class="text-xs text-muted-foreground">Потери</p>
            <p class="text-lg font-bold tabular-nums">
              {{ metrics.loss.toLocaleString('ru-RU') }} ₽
            </p>
          </div>
          <div>
            <p class="text-xs text-muted-foreground">Повторяющиеся причины</p>
            <p
              v-for="[code, n] in metrics.repeatCauses"
              :key="code"
              class="text-xs text-muted-foreground"
            >
              {{ causeLabel(code) }} × {{ n }}
            </p>
            <p v-if="metrics.repeatCauses.length === 0" class="text-xs text-muted-foreground">—</p>
          </div>
        </div>
        <div
          v-if="metrics.nextWork || metrics.lastWork"
          class="flex flex-wrap gap-4 text-xs text-muted-foreground border-t pt-2"
        >
          <span v-if="metrics.nextWork">
            Ближайшая работа: {{ metrics.nextWork.title }} · {{ fmtTime(metrics.nextWork.dueAt) }} ·
            {{ MAINTENANCE_STATUS_RU[metrics.nextWork.status] }}</span
          >
          <span v-if="metrics.lastWork">
            Последняя завершённая: {{ metrics.lastWork.title }} ·
            {{ fmtTime(metrics.lastWork.completedAt) }}</span
          >
        </div>
      </CardContent>
    </Card>

    <Tabs default-value="incidents">
      <TabsList>
        <TabsTrigger value="incidents">Инциденты ({{ robotIncidents.length }})</TabsTrigger>
        <TabsTrigger value="downtimes">Простои ({{ robotDowntimes.length }})</TabsTrigger>
        <TabsTrigger value="maintenance"
          >Сервисные работы ({{ robotMaintenance.length }})</TabsTrigger
        >
        <TabsTrigger value="events">События ({{ robotEvents.length }})</TabsTrigger>
        <TabsTrigger value="history">История</TabsTrigger>
      </TabsList>

      <TabsContent value="incidents" class="tabs-content-spacing">
        <Card
          ><CardContent class="p-0">
            <Table>
              <TableHeader
                ><TableRow>
                  <TableHead class="py-2 px-3">Инцидент</TableHead>
                  <TableHead class="py-2 px-3">Наблюдение</TableHead>
                  <TableHead class="py-2 px-3">Зона</TableHead>
                  <TableHead class="py-2 px-3">Статус</TableHead>
                  <TableHead class="py-2 px-3">Причина</TableHead>
                  <TableHead class="py-2 px-3">Потери</TableHead>
                </TableRow></TableHeader
              >
              <TableBody>
                <TableEmpty v-if="robotIncidents.length === 0" :colspan="6"
                  >У робота нет инцидентов за период.</TableEmpty
                >
                <TableRow
                  v-for="inc in robotIncidents"
                  :key="inc.id"
                  class="row-interactive cursor-pointer"
                  @click="goIncident(inc.id)"
                >
                  <TableCell class="text-xs text-primary py-2 px-3">{{
                    inc.incidentNumber
                  }}</TableCell>
                  <TableCell class="text-xs py-2 px-3 max-w-[260px]"
                    ><span class="truncate block">{{ inc.title }}</span></TableCell
                  >
                  <TableCell class="text-xs py-2 px-3">{{ inc.zoneName ?? '—' }}</TableCell>
                  <TableCell class="py-2 px-3"
                    ><span
                      class="text-xs rounded px-1.5 py-0.5"
                      :class="INCIDENT_STATUS_CLASS[inc.status]"
                      >{{ INCIDENT_STATUS_RU[inc.status] }}</span
                    ></TableCell
                  >
                  <TableCell class="text-xs py-2 px-3">{{
                    inc.causeCode ? causeLabel(inc.causeCode) : '—'
                  }}</TableCell>
                  <TableCell class="text-xs tabular-nums py-2 px-3"
                    >{{ inc.lossRubles.toLocaleString('ru-RU') }} ₽</TableCell
                  >
                </TableRow>
              </TableBody>
            </Table>
          </CardContent></Card
        >
      </TabsContent>

      <TabsContent value="downtimes" class="tabs-content-spacing">
        <Card
          ><CardContent class="p-0">
            <Table>
              <TableHeader
                ><TableRow>
                  <TableHead class="py-2 px-3">Начало</TableHead>
                  <TableHead class="py-2 px-3">Окончание</TableHead>
                  <TableHead class="py-2 px-3">Длительность</TableHead>
                  <TableHead class="py-2 px-3">Ставка</TableHead>
                  <TableHead class="py-2 px-3">Потери</TableHead>
                </TableRow></TableHeader
              >
              <TableBody>
                <TableRow v-for="d in robotDowntimes" :key="d.id">
                  <TableCell class="text-xs font-mono py-2 px-3">{{
                    fmtTime(d.startedAt)
                  }}</TableCell>
                  <TableCell class="text-xs font-mono py-2 px-3">{{
                    d.endedAt ? fmtTime(d.endedAt) : 'продолжается'
                  }}</TableCell>
                  <TableCell class="text-xs tabular-nums py-2 px-3">{{
                    fmtDur(d.accountableDurationSeconds)
                  }}</TableCell>
                  <TableCell class="text-xs tabular-nums py-2 px-3"
                    >{{ d.ratePerHour.toLocaleString('ru-RU') }} ₽/ч</TableCell
                  >
                  <TableCell class="text-xs font-medium tabular-nums py-2 px-3"
                    >{{ d.lossRubles.toLocaleString('ru-RU') }} ₽</TableCell
                  >
                </TableRow>
              </TableBody>
            </Table>
          </CardContent></Card
        >
      </TabsContent>

      <TabsContent value="maintenance" class="tabs-content-spacing">
        <Card
          ><CardContent class="p-0">
            <Table>
              <TableHeader
                ><TableRow>
                  <TableHead class="py-2 px-3">Работа</TableHead>
                  <TableHead class="py-2 px-3">Вид</TableHead>
                  <TableHead class="py-2 px-3">Исполнитель</TableHead>
                  <TableHead class="py-2 px-3">Срок</TableHead>
                  <TableHead class="py-2 px-3">Статус</TableHead>
                  <TableHead class="py-2 px-3">Результат</TableHead>
                </TableRow></TableHeader
              >
              <TableBody>
                <TableEmpty v-if="robotMaintenance.length === 0" :colspan="6"
                  >Сервисных работ нет.</TableEmpty
                >
                <TableRow v-for="m in robotMaintenance" :key="m.id">
                  <TableCell class="text-xs py-2 px-3">{{ m.title }}</TableCell>
                  <TableCell class="text-xs py-2 px-3">{{ MAINTENANCE_TYPE_RU[m.type] }}</TableCell>
                  <TableCell class="text-xs py-2 px-3">{{ m.executor }}</TableCell>
                  <TableCell class="text-xs font-mono py-2 px-3">{{ fmtTime(m.dueAt) }}</TableCell>
                  <TableCell class="py-2 px-3"
                    ><span class="text-xs rounded px-1.5 py-0.5 bg-muted">{{
                      MAINTENANCE_STATUS_RU[m.status]
                    }}</span></TableCell
                  >
                  <TableCell class="text-xs py-2 px-3">{{ m.result ?? '—' }}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent></Card
        >
      </TabsContent>

      <TabsContent value="events" class="tabs-content-spacing">
        <Card
          ><CardContent class="p-4 space-y-2">
            <div v-if="robotEvents.length === 0" class="text-sm text-muted-foreground">
              Событий нет.
            </div>
            <div
              v-for="e in robotEvents"
              :key="e.id"
              class="flex items-start justify-between gap-3 border-b border-border/60 pb-1"
            >
              <div class="min-w-0">
                <p class="text-sm">{{ e.humanInterpretation }}</p>
                <p class="text-xs text-muted-foreground font-mono">{{ e.rawCode }}</p>
              </div>
              <p class="text-xs text-muted-foreground shrink-0">
                {{ sourceInstanceLabel(e.source, e.siteId) }} · {{ fmtTime(e.timestamp) }}
              </p>
            </div>
          </CardContent></Card
        >
      </TabsContent>

      <TabsContent value="history" class="tabs-content-spacing">
        <Card
          ><CardContent class="p-4 text-sm text-muted-foreground">
            История изменений реквизитов робота (объект, зона, статус) появится после первых
            пользовательских правок (пакет H — редактирование парка).
          </CardContent></Card
        >
      </TabsContent>
    </Tabs>
  </div>
  <div v-else class="text-center py-8 text-muted-foreground">Робот не найден</div>
</template>
