<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDemoData } from '@/composables/useDemoData'
import {
  confirmedLossRubles,
  impactSeconds,
  techAvailabilityPct,
  techUnavailableSeconds,
} from '@/data/metrics'
import { causeLabel } from '@/data/generator'
import { SOURCE_INSTANCES } from '@/data/generator'
import {
  INCIDENT_STATUS_RU,
  INCIDENT_STATUS_CLASS,
  MAINTENANCE_STATUS_RU,
  MAINTENANCE_TYPE_RU,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ArrowLeft, MapPin } from 'lucide-vue-next'

const route = useRoute()
const router = useRouter()
const {
  sites,
  robots,
  incidents,
  downtimes,
  maintenance,
  costRates,
  zones: zoneCatalog,
} = useDemoData()

const siteId = computed(() => String(route.params.siteId ?? ''))
const site = computed(() => sites.value.find((s) => s.id === siteId.value))

function fmtTime(iso: string | null): string {
  return iso ? iso.slice(0, 16).replace('T', ' ') : '—'
}
function fmtDur(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  return h > 0 ? `${h} ч ${m} мин` : `${m} мин`
}

const siteRobots = computed(() => robots.value.filter((r) => r.siteId === siteId.value))
const siteIncidents = computed(() =>
  incidents.value
    .filter((i) => i.siteId === siteId.value)
    .sort((a, b) => b.detectedAt.localeCompare(a.detectedAt)),
)
const siteDowntimes = computed(() => downtimes.value.filter((d) => d.siteId === siteId.value))
const siteMaintenance = computed(() => maintenance.value.filter((m) => m.siteId === siteId.value))
const siteSources = computed(() => SOURCE_INSTANCES.filter((s) => s.siteId === siteId.value))
const siteRate = computed(
  () => costRates.value.find((r) => r.siteId === siteId.value)?.ratePerHour ?? 0,
)

const siteZones = computed(() => zoneCatalog.value.filter((z) => z.siteId === siteId.value))

const zoneRows = computed(() => {
  // Справочник зон объекта (мощность §8.2) + статистика инцидентов
  const byZone = new Map<
    string,
    {
      name: string
      code: string
      required: number
      working: number
      robots: number
      incidents: number
      hours: number
      loss: number
      causes: Map<string, number>
    }
  >()
  for (const z of siteZones.value) {
    byZone.set(z.code, {
      name: z.name,
      code: z.code,
      required: z.requiredCapacity,
      working: robots.value.filter((r) => r.zoneId === z.id && r.fleetState === 'WORKING').length,
      robots: 0,
      incidents: 0,
      hours: 0,
      loss: 0,
      causes: new Map<string, number>(),
    })
  }
  for (const inc of siteIncidents.value) {
    const code = inc.zoneName?.split(' ')[0] ?? '—'
    const row = byZone.get(code) ?? {
      name: inc.zoneName ?? code,
      code,
      required: 0,
      working: 0,
      robots: 0,
      incidents: 0,
      hours: 0,
      loss: 0,
      causes: new Map<string, number>(),
    }
    row.incidents++
    row.hours += inc.downtimeSeconds / 3600
    row.loss += inc.lossRubles
    if (inc.causeCode) row.causes.set(inc.causeCode, (row.causes.get(inc.causeCode) ?? 0) + 1)
    byZone.set(code, row)
  }
  for (const row of byZone.values()) {
    row.robots = new Set(
      siteIncidents.value
        .filter((i) => (i.zoneName ?? '').startsWith(row.code) && i.robotId)
        .map((i) => i.robotId),
    ).size
  }
  return [...byZone.values()].sort((a, b) => b.loss - a.loss)
})

function goZone(code: string): void {
  router.push({ name: 'zone-details', params: { siteId: siteId.value, zoneCode: code } })
}

const metrics = computed(() => {
  // Единые метрики (ACC-023/016): раздельно влияние/недоступность/деньги.
  const fleet = siteRobots.value.length
  const byCause = new Map<string, number>()
  for (const i of siteIncidents.value) {
    if (i.causeCode) byCause.set(i.causeCode, (byCause.get(i.causeCode) ?? 0) + 1)
  }
  return {
    fleet,
    active: siteRobots.value.filter((r) => r.status === 'ACTIVE').length,
    onService: siteRobots.value.filter((r) => r.status === 'MAINTENANCE').length,
    incidents: siteIncidents.value.length,
    activeIncidents: siteIncidents.value.filter((i) => i.status !== 'CLOSED').length,
    impactHours: impactSeconds(siteDowntimes.value) / 3600,
    techHours: techUnavailableSeconds(siteDowntimes.value) / 3600,
    loss: confirmedLossRubles(siteDowntimes.value),
    techAvailability: techAvailabilityPct(siteDowntimes.value, fleet),
    topCauses: [...byCause.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3),
  }
})

// ─── Объектовая аналитика (ACC-018, ТЗ §8.2): причины / роботы / повторяемость
// из того же набора интервалов, что и сводка (единые селекторы metrics.ts).

const causeAnalytics = computed(() => {
  const rows = new Map<
    string,
    { code: string; count: number; impactHours: number; techHours: number; loss: number }
  >()
  for (const d of siteDowntimes.value) {
    const inc = siteIncidents.value.find((i) => i.id === d.incidentId)
    const code = inc?.causeCode ?? 'CA-060'
    const row = rows.get(code) ?? { code, count: 0, impactHours: 0, techHours: 0, loss: 0 }
    const confirmed = d.confirmationStatus === 'CONFIRMED' || d.confirmationStatus === 'ADJUSTED'
    if (confirmed && d.intervalType === 'OPERATIONAL_IMPACT') {
      row.impactHours += d.accountableDurationSeconds / 3600
      row.loss += d.lossRubles
    }
    if (d.intervalType === 'TECHNICAL_UNAVAILABLE' && d.intervalState === 'CLOSED')
      row.techHours += d.accountableDurationSeconds / 3600
    rows.set(code, row)
  }
  for (const [code, row] of rows) {
    row.count = siteIncidents.value.filter((i) => (i.causeCode ?? 'CA-060') === code).length
    rows.set(code, row)
  }
  return [...rows.values()].sort((a, b) => b.loss - a.loss || b.count - a.count)
})

const robotAnalytics = computed(() => {
  const rows = new Map<
    string,
    { robotId: string; incidents: number; impactHours: number; techHours: number; loss: number }
  >()
  for (const r of siteRobots.value) {
    rows.set(r.id, { robotId: r.id, incidents: 0, impactHours: 0, techHours: 0, loss: 0 })
  }
  for (const i of siteIncidents.value) {
    if (!i.robotId) continue
    const row = rows.get(i.robotId)
    if (row) row.incidents++
  }
  for (const d of siteDowntimes.value) {
    if (!d.robotId) continue
    const row = rows.get(d.robotId)
    if (!row) continue
    const confirmed = d.confirmationStatus === 'CONFIRMED' || d.confirmationStatus === 'ADJUSTED'
    if (confirmed && d.intervalType === 'OPERATIONAL_IMPACT') {
      row.impactHours += d.accountableDurationSeconds / 3600
      row.loss += d.lossRubles
    }
    if (d.intervalType === 'TECHNICAL_UNAVAILABLE' && d.intervalState === 'CLOSED')
      row.techHours += d.accountableDurationSeconds / 3600
  }
  return [...rows.values()]
    .filter((r) => r.incidents > 0 || r.loss > 0 || r.techHours > 0)
    .sort((a, b) => b.loss - a.loss || b.techHours - a.techHours)
    .slice(0, 10)
})

const repeatCauses = computed(() => causeAnalytics.value.filter((c) => c.count >= 2))

function goAnalyticsCause(code: string): void {
  router.push({ name: 'analytics', query: { site: siteId.value, cause: code, view: 'site' } })
}

function goBack(): void {
  router.push({ name: 'sites' })
}
function goIncident(id: string): void {
  router.push({ name: 'incident-details', params: { incidentId: id } })
}
function goRobot(id: string): void {
  router.push({ name: 'robot-details', params: { robotId: id } })
}
function goIncidentsFiltered(): void {
  router.push({ name: 'incidents', query: { site: siteId.value } })
}
function goDowntimesFiltered(): void {
  router.push({ name: 'downtimes', query: { site: siteId.value } })
}
function goRobotsFiltered(): void {
  router.push({ name: 'robots', query: { site: siteId.value } })
}
</script>

<template>
  <div v-if="site" class="space-y-4">
    <Button variant="ghost" size="sm" @click="goBack"
      ><ArrowLeft class="size-4 mr-1" /> К объектам</Button
    >

    <Card>
      <CardContent class="p-5 space-y-3">
        <div class="space-y-1">
          <div class="flex items-center gap-2">
            <MapPin class="size-5 text-primary" />
            <h1 class="text-xl font-bold">{{ site.name }}</h1>
          </div>
          <p class="text-sm text-muted-foreground">{{ site.address }} · {{ site.timezone }}</p>
        </div>
        <div class="grid grid-cols-2 md:grid-cols-5 gap-4 border-t pt-3">
          <div>
            <p class="text-xs text-muted-foreground">Парк</p>
            <p class="text-lg font-bold tabular-nums">
              {{ metrics.fleet }}
              <span class="text-xs font-normal text-muted-foreground"
                >(активных {{ metrics.active }}, на обслуживании {{ metrics.onService }})</span
              >
            </p>
          </div>
          <div>
            <p class="text-xs text-muted-foreground">Техническая доступность</p>
            <p class="text-lg font-bold tabular-nums text-success">
              {{ metrics.techAvailability.toFixed(1) }}%
            </p>
          </div>
          <div>
            <p class="text-xs text-muted-foreground">Влияние / недоступность / потери</p>
            <p class="text-lg font-bold tabular-nums">
              {{ metrics.impactHours.toFixed(1) }} ч · {{ metrics.techHours.toFixed(1) }} ч ·
              {{ metrics.loss.toLocaleString('ru-RU') }} ₽
            </p>
          </div>
          <div>
            <p class="text-xs text-muted-foreground">Инциденты</p>
            <p class="text-lg font-bold tabular-nums">
              {{ metrics.incidents }}
              <span class="text-xs font-normal text-muted-foreground"
                >(активных {{ metrics.activeIncidents }})</span
              >
            </p>
          </div>
          <div>
            <p class="text-xs text-muted-foreground">Ставка</p>
            <p class="text-lg font-bold tabular-nums">{{ siteRate.toLocaleString('ru-RU') }} ₽/ч</p>
          </div>
        </div>
        <div class="flex flex-wrap gap-2 border-t pt-3">
          <Button size="sm" variant="outline" class="min-h-9" @click="goIncidentsFiltered"
            >Показать инциденты</Button
          >
          <Button size="sm" variant="outline" class="min-h-9" @click="goDowntimesFiltered"
            >Показать простои</Button
          >
          <Button size="sm" variant="outline" class="min-h-9" @click="goRobotsFiltered"
            >Показать роботов</Button
          >
        </div>
      </CardContent>
    </Card>

    <Tabs default-value="zones">
      <TabsList>
        <TabsTrigger value="zones">Зоны</TabsTrigger>
        <TabsTrigger value="robots">Роботы ({{ siteRobots.length }})</TabsTrigger>
        <TabsTrigger value="incidents">Инциденты и простои</TabsTrigger>
        <TabsTrigger value="analytics">Аналитика</TabsTrigger>
        <TabsTrigger value="maintenance">Сервисные работы</TabsTrigger>
        <TabsTrigger value="settings">Настройки</TabsTrigger>
      </TabsList>

      <TabsContent value="zones" class="tabs-content-spacing">
        <Card>
          <CardHeader
            ><CardTitle>Зоны объекта</CardTitle>
            <p class="text-xs text-muted-foreground">
              Клик по зоне — страница зоны (мощность, роботы, инциденты, простои)
            </p></CardHeader
          >
          <CardContent class="p-0">
            <Table>
              <TableHeader
                ><TableRow>
                  <TableHead class="py-2 px-3">Зона</TableHead>
                  <TableHead class="py-2 px-3">Мощность</TableHead>
                  <TableHead class="py-2 px-3">Инцидентов</TableHead>
                  <TableHead class="py-2 px-3">Роботов затронуто</TableHead>
                  <TableHead class="py-2 px-3">Часы</TableHead>
                  <TableHead class="py-2 px-3">Потери</TableHead>
                  <TableHead class="py-2 px-3">Топ причин</TableHead>
                </TableRow></TableHeader
              >
              <TableBody>
                <TableEmpty v-if="zoneRows.length === 0" :colspan="7"
                  >Нет данных по зонам.</TableEmpty
                >
                <TableRow
                  v-for="z in zoneRows"
                  :key="z.code"
                  class="row-interactive cursor-pointer"
                  @click="goZone(z.code)"
                >
                  <TableCell class="text-sm py-2 px-3">{{ z.name }}</TableCell>
                  <TableCell class="text-sm tabular-nums py-2 px-3">
                    <span
                      :class="
                        z.required > 0 && z.working < z.required
                          ? 'text-destructive font-semibold'
                          : 'text-success'
                      "
                      >{{ z.working }} / {{ z.required || '—' }}</span
                    >
                  </TableCell>
                  <TableCell class="text-sm tabular-nums py-2 px-3">{{ z.incidents }}</TableCell>
                  <TableCell class="text-sm tabular-nums py-2 px-3">{{ z.robots }}</TableCell>
                  <TableCell class="text-sm tabular-nums py-2 px-3">{{
                    z.hours.toFixed(1)
                  }}</TableCell>
                  <TableCell class="text-sm tabular-nums py-2 px-3"
                    >{{ z.loss.toLocaleString('ru-RU') }} ₽</TableCell
                  >
                  <TableCell class="text-xs py-2 px-3 max-w-[240px]"
                    ><span class="truncate block">{{
                      [...z.causes.entries()]
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 2)
                        .map(([c, n]) => `${causeLabel(c)} ×${n}`)
                        .join(', ')
                    }}</span></TableCell
                  >
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="robots" class="tabs-content-spacing">
        <Card
          ><CardContent class="p-0">
            <Table>
              <TableHeader
                ><TableRow>
                  <TableHead class="py-2 px-3">Робот</TableHead>
                  <TableHead class="py-2 px-3">Зона</TableHead>
                  <TableHead class="py-2 px-3">Статус</TableHead>
                  <TableHead class="py-2 px-3">Инцидентов</TableHead>
                  <TableHead class="py-2 px-3">Простой</TableHead>
                </TableRow></TableHeader
              >
              <TableBody>
                <TableRow
                  v-for="r in siteRobots"
                  :key="r.id"
                  class="row-interactive cursor-pointer"
                  @click="goRobot(r.id)"
                >
                  <TableCell class="text-sm py-2 px-3">{{ r.name }}</TableCell>
                  <TableCell class="text-xs py-2 px-3">{{ r.zoneName ?? '—' }}</TableCell>
                  <TableCell class="text-xs py-2 px-3">{{
                    r.status === 'ACTIVE'
                      ? 'активен'
                      : r.status === 'MAINTENANCE'
                        ? 'обслуживание'
                        : 'отключён'
                  }}</TableCell>
                  <TableCell class="text-sm tabular-nums py-2 px-3">{{
                    siteIncidents.filter((i) => i.robotId === r.id).length
                  }}</TableCell>
                  <TableCell class="text-sm tabular-nums py-2 px-3"
                    >{{
                      (
                        siteDowntimes
                          .filter(
                            (d) =>
                              d.robotId === r.id &&
                              ['CONFIRMED', 'ADJUSTED'].includes(d.confirmationStatus),
                          )
                          .reduce((s, d) => s + d.accountableDurationSeconds, 0) / 3600
                      ).toFixed(1)
                    }}
                    ч</TableCell
                  >
                </TableRow>
              </TableBody>
            </Table>
          </CardContent></Card
        >
      </TabsContent>

      <TabsContent value="analytics" class="tabs-content-spacing">
        <!-- Объектовая аналитика (ACC-018, ТЗ §8.2): причины, роботы,
             повторяемость — из того же набора интервалов, что и сводка. -->
        <div class="space-y-4">
          <Card>
            <CardHeader
              ><CardTitle>Потери по причинам</CardTitle>
              <p class="text-xs text-muted-foreground">
                Подтверждённое операционное влияние × ставка; клик — детализация в аналитике.
              </p></CardHeader
            >
            <CardContent class="p-0">
              <Table>
                <TableHeader
                  ><TableRow>
                    <TableHead class="py-2 px-3">Причина</TableHead>
                    <TableHead class="py-2 px-3">Случаев</TableHead>
                    <TableHead class="py-2 px-3">Влияние, ч</TableHead>
                    <TableHead class="py-2 px-3">Недоступность, ч</TableHead>
                    <TableHead class="py-2 px-3">Потери</TableHead>
                  </TableRow></TableHeader
                >
                <TableBody>
                  <TableRow
                    v-for="c in causeAnalytics"
                    :key="c.code"
                    class="row-interactive cursor-pointer"
                    @click="goAnalyticsCause(c.code)"
                  >
                    <TableCell class="text-xs py-2 px-3">{{ causeLabel(c.code) }}</TableCell>
                    <TableCell class="text-xs tabular-nums py-2 px-3">{{ c.count }}</TableCell>
                    <TableCell class="text-xs tabular-nums py-2 px-3">{{
                      c.impactHours.toFixed(1)
                    }}</TableCell>
                    <TableCell class="text-xs tabular-nums py-2 px-3">{{
                      c.techHours.toFixed(1)
                    }}</TableCell>
                    <TableCell class="text-xs tabular-nums py-2 px-3"
                      >{{ c.loss.toLocaleString('ru-RU') }} ₽</TableCell
                    >
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader
              ><CardTitle>Роботы с наибольшим влиянием</CardTitle>
              <p class="text-xs text-muted-foreground">
                Топ-10 по потерям и технической недоступности за 30 дней.
              </p></CardHeader
            >
            <CardContent class="p-0">
              <Table>
                <TableHeader
                  ><TableRow>
                    <TableHead class="py-2 px-3">Робот</TableHead>
                    <TableHead class="py-2 px-3">Инцидентов</TableHead>
                    <TableHead class="py-2 px-3">Влияние, ч</TableHead>
                    <TableHead class="py-2 px-3">Недоступность, ч</TableHead>
                    <TableHead class="py-2 px-3">Потери</TableHead>
                  </TableRow></TableHeader
                >
                <TableBody>
                  <TableRow
                    v-for="r in robotAnalytics"
                    :key="r.robotId"
                    class="row-interactive cursor-pointer"
                    @click="goRobot(r.robotId)"
                  >
                    <TableCell class="text-xs py-2 px-3">{{
                      siteRobots.find((x) => x.id === r.robotId)?.name ?? r.robotId
                    }}</TableCell>
                    <TableCell class="text-xs tabular-nums py-2 px-3">{{ r.incidents }}</TableCell>
                    <TableCell class="text-xs tabular-nums py-2 px-3">{{
                      r.impactHours.toFixed(1)
                    }}</TableCell>
                    <TableCell class="text-xs tabular-nums py-2 px-3">{{
                      r.techHours.toFixed(1)
                    }}</TableCell>
                    <TableCell class="text-xs tabular-nums py-2 px-3"
                      >{{ r.loss.toLocaleString('ru-RU') }} ₽</TableCell
                    >
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader
              ><CardTitle>Повторяемые причины (≥2 случаев)</CardTitle>
              <p class="text-xs text-muted-foreground">
                Кандидаты в регламентные меры: плановое ТО или изменение процесса.
              </p></CardHeader
            >
            <CardContent class="space-y-2">
              <p v-if="repeatCauses.length === 0" class="text-sm text-muted-foreground">
                Повторяемых причин за период нет.
              </p>
              <div
                v-for="c in repeatCauses"
                :key="c.code"
                class="card-interactive flex items-center justify-between rounded-lg border border-border p-3 cursor-pointer"
                @click="goAnalyticsCause(c.code)"
              >
                <span class="text-sm">{{ causeLabel(c.code) }}</span>
                <span class="text-xs tabular-nums text-muted-foreground"
                  >{{ c.count }} сл. · {{ c.impactHours.toFixed(1) }} ч ·
                  {{ c.loss.toLocaleString('ru-RU') }} ₽</span
                >
              </div>
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      <TabsContent value="incidents" class="tabs-content-spacing">
        <Card
          ><CardContent class="p-0">
            <Table>
              <TableHeader
                ><TableRow>
                  <TableHead class="py-2 px-3">Инцидент</TableHead>
                  <TableHead class="py-2 px-3">Зона</TableHead>
                  <TableHead class="py-2 px-3">Робот</TableHead>
                  <TableHead class="py-2 px-3">Статус</TableHead>
                  <TableHead class="py-2 px-3">Простой</TableHead>
                  <TableHead class="py-2 px-3">Потери</TableHead>
                </TableRow></TableHeader
              >
              <TableBody>
                <TableRow
                  v-for="inc in siteIncidents"
                  :key="inc.id"
                  class="row-interactive cursor-pointer"
                  @click="goIncident(inc.id)"
                >
                  <TableCell class="text-xs text-primary py-2 px-3">{{
                    inc.incidentNumber
                  }}</TableCell>
                  <TableCell class="text-xs py-2 px-3">{{ inc.zoneName ?? '—' }}</TableCell>
                  <TableCell class="text-xs py-2 px-3">{{
                    siteRobots.find((r) => r.id === inc.robotId)?.name ?? '—'
                  }}</TableCell>
                  <TableCell class="py-2 px-3"
                    ><span
                      class="text-xs rounded px-1.5 py-0.5"
                      :class="INCIDENT_STATUS_CLASS[inc.status]"
                      >{{ INCIDENT_STATUS_RU[inc.status] }}</span
                    ></TableCell
                  >
                  <TableCell class="text-xs tabular-nums py-2 px-3">{{
                    fmtDur(inc.downtimeSeconds)
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

      <TabsContent value="maintenance" class="tabs-content-spacing">
        <Card
          ><CardContent class="p-0">
            <Table>
              <TableHeader
                ><TableRow>
                  <TableHead class="py-2 px-3">Работа</TableHead>
                  <TableHead class="py-2 px-3">Вид</TableHead>
                  <TableHead class="py-2 px-3">Робот</TableHead>
                  <TableHead class="py-2 px-3">Исполнитель</TableHead>
                  <TableHead class="py-2 px-3">Срок</TableHead>
                  <TableHead class="py-2 px-3">Статус</TableHead>
                </TableRow></TableHeader
              >
              <TableBody>
                <TableEmpty v-if="siteMaintenance.length === 0" :colspan="6"
                  >Работ по объекту нет.</TableEmpty
                >
                <TableRow v-for="m in siteMaintenance" :key="m.id">
                  <TableCell class="text-xs py-2 px-3">{{ m.title }}</TableCell>
                  <TableCell class="text-xs py-2 px-3">{{ MAINTENANCE_TYPE_RU[m.type] }}</TableCell>
                  <TableCell class="text-xs py-2 px-3">{{
                    siteRobots.find((r) => r.id === m.robotId)?.name ?? '—'
                  }}</TableCell>
                  <TableCell class="text-xs py-2 px-3">{{ m.executor }}</TableCell>
                  <TableCell class="text-xs font-mono py-2 px-3">{{ fmtTime(m.dueAt) }}</TableCell>
                  <TableCell class="py-2 px-3"
                    ><span class="text-xs rounded px-1.5 py-0.5 bg-muted">{{
                      MAINTENANCE_STATUS_RU[m.status]
                    }}</span></TableCell
                  >
                </TableRow>
              </TableBody>
            </Table>
          </CardContent></Card
        >
      </TabsContent>

      <TabsContent value="settings" class="tabs-content-spacing">
        <Card>
          <CardHeader><CardTitle>Источники данных и правила</CardTitle></CardHeader>
          <CardContent class="space-y-3 text-sm">
            <div class="space-y-1">
              <p
                v-for="src in siteSources"
                :key="src.id"
                class="flex justify-between border-b border-border/60 pb-1"
              >
                <span>{{ src.systemName }}</span>
                <span class="text-xs text-muted-foreground">{{
                  src.kind === 'FLEET_MANAGEMENT'
                    ? 'управление парком'
                    : src.kind === 'WAREHOUSE'
                      ? 'складской процесс'
                      : 'ручное подтверждение'
                }}</span>
              </p>
            </div>
            <div class="border-t pt-2">
              <p class="flex justify-between">
                <span>Ставка стоимости простоя</span>
                <span class="tabular-nums font-medium"
                  >{{ siteRate.toLocaleString('ru-RU') }} ₽/ч</span
                >
              </p>
              <p class="text-xs text-muted-foreground mt-1">
                Правило учёта: календарь 24×7; редактирование ставки — пакет H.
              </p>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  </div>
  <div v-else class="text-center py-8 text-muted-foreground">Объект не найден</div>
</template>
