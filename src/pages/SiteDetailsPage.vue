<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDemoData } from '@/composables/useDemoData'
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
  const confirmed = siteDowntimes.value.filter(
    (d) => d.confirmationStatus === 'CONFIRMED' || d.confirmationStatus === 'ADJUSTED',
  )
  const dtSec = confirmed.reduce((s, d) => s + d.accountableDurationSeconds, 0)
  const fund = siteRobots.value.length * 30 * 24
  const byCause = new Map<string, number>()
  for (const i of siteIncidents.value) {
    if (i.causeCode) byCause.set(i.causeCode, (byCause.get(i.causeCode) ?? 0) + 1)
  }
  return {
    fleet: siteRobots.value.length,
    active: siteRobots.value.filter((r) => r.status === 'ACTIVE').length,
    onService: siteRobots.value.filter((r) => r.status === 'MAINTENANCE').length,
    incidents: siteIncidents.value.length,
    activeIncidents: siteIncidents.value.filter((i) => i.status !== 'CLOSED').length,
    hours: dtSec / 3600,
    loss: confirmed.reduce((s, d) => s + d.lossRubles, 0),
    availability: fund > 0 ? 100 - (dtSec / 3600 / fund) * 100 : 100,
    topCauses: [...byCause.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3),
  }
})

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
            <p class="text-xs text-muted-foreground">Доступность</p>
            <p class="text-lg font-bold tabular-nums text-success">
              {{ metrics.availability.toFixed(1) }}%
            </p>
          </div>
          <div>
            <p class="text-xs text-muted-foreground">Простой / потери</p>
            <p class="text-lg font-bold tabular-nums">
              {{ metrics.hours.toFixed(1) }} ч · {{ metrics.loss.toLocaleString('ru-RU') }} ₽
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
        <TabsTrigger value="maintenance">Сервисные работы</TabsTrigger>
        <TabsTrigger value="settings">Настройки</TabsTrigger>
      </TabsList>

      <TabsContent value="zones" class="tabs-content-spacing">
        <Card>
          <CardHeader
            ><CardTitle>Зоны объекта</CardTitle>
            <p class="text-xs text-muted-foreground">
              Клик по зоне — страница зоны (мощность, роботы, инциденты, интервалы)
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
