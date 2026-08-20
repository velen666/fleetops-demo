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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { MapPin, Bot, Clock, TrendingDown } from 'lucide-vue-next'
import type { Site } from '@/types/domain'
import { causeLabel } from '@/data/generator'
import { sourceInstanceLabel } from '@/data/labels'

const { sites, robots, incidents, downtimes, costRates } = useDemoData()

const selectedSite = ref<Site | null>(null)
const searchText = ref('')

const SITE_FUND_H = 30 * 24 // hours per robot per 30 days

const siteMetrics = computed(() => {
  const map = new Map<
    string,
    {
      robotCount: number
      activeCount: number
      maintCount: number
      incCount: number
      dtSeconds: number
      loss: number
      rate: number
    }
  >()
  for (const s of sites.value) {
    const siteRobots = robots.value.filter((r) => r.siteId === s.id)
    map.set(s.id, {
      robotCount: siteRobots.length,
      activeCount: siteRobots.filter((r) => r.status === 'ACTIVE').length,
      maintCount: siteRobots.filter((r) => r.status === 'MAINTENANCE').length,
      incCount: 0,
      dtSeconds: 0,
      loss: 0,
      rate: costRates.value.find((cr) => cr.siteId === s.id)?.ratePerHour ?? 0,
    })
  }
  for (const inc of incidents.value) {
    const e = map.get(inc.siteId)
    if (e) {
      e.incCount++
      e.dtSeconds += inc.downtimeSeconds
      e.loss += inc.lossRubles
    }
  }
  return map
})

function availability(siteId: string): number {
  const m = siteMetrics.value.get(siteId)
  if (!m || m.robotCount === 0) return 100
  const fundH = m.robotCount * SITE_FUND_H
  return Math.max(0, 100 - (m.dtSeconds / 3600 / fundH) * 100)
}

const filteredSites = computed(() => {
  if (!searchText.value.trim()) return sites.value
  const s = searchText.value.trim().toLowerCase()
  return sites.value.filter(
    (site) => site.name.toLowerCase().includes(s) || site.address.toLowerCase().includes(s),
  )
})

const selRobots = computed(() =>
  selectedSite.value ? robots.value.filter((r) => r.siteId === selectedSite.value!.id) : [],
)
const selIncidents = computed(() =>
  selectedSite.value
    ? incidents.value
        .filter((i) => i.siteId === selectedSite.value!.id)
        .sort((a, b) => b.detectedAt.localeCompare(a.detectedAt))
    : [],
)
const selDowntime = computed(() => {
  if (!selectedSite.value) return { seconds: 0, loss: 0 }
  const dts = downtimes.value.filter(
    (d) => d.siteId === selectedSite.value!.id && d.confirmationStatus === 'CONFIRMED',
  )
  return {
    seconds: dts.reduce((s, d) => s + d.accountableDurationSeconds, 0),
    loss: dts.reduce((s, d) => s + d.lossRubles, 0),
  }
})
const selTopCauses = computed(() => {
  const map = new Map<string, { code: string; count: number; loss: number }>()
  for (const inc of selIncidents.value) {
    if (inc.causeCode && inc.lossRubles > 0) {
      const e = map.get(inc.causeCode) ?? { code: inc.causeCode, count: 0, loss: 0 }
      e.count++
      e.loss += inc.lossRubles
      map.set(inc.causeCode, e)
    }
  }
  return [...map.values()].sort((a, b) => b.loss - a.loss).slice(0, 5)
})

const selProblemZones = computed(() => {
  const map = new Map<string, number>()
  for (const inc of selIncidents.value) {
    if (inc.zoneName) map.set(inc.zoneName, (map.get(inc.zoneName) ?? 0) + 1)
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4)
})

function availClass(v: number): string {
  return v >= 99 ? 'text-success' : v >= 95 ? 'text-warning' : 'text-destructive'
}
function fmtDate(iso: string): string {
  return iso.slice(0, 19).replace('T', ' ')
}
</script>

<template>
  <div class="space-y-4">
    <!-- Search -->
    <div class="flex items-end gap-3">
      <div class="space-y-1 flex-1 max-w-sm">
        <span class="text-xs text-muted-foreground block">Поиск</span>
        <Input
          v-model="searchText"
          aria-label="Поиск по объектам"
          placeholder="Название, адрес..."
        />
      </div>
    </div>

    <!-- Table -->
    <Card>
      <CardContent class="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead class="py-3 px-4">Объект</TableHead>
              <TableHead class="py-3 px-4">Адрес</TableHead>
              <TableHead class="py-3 px-4">Парк</TableHead>
              <TableHead class="py-3 px-4">Готовность</TableHead>
              <TableHead class="py-3 px-4">Доступность</TableHead>
              <TableHead class="py-3 px-4">Инцидентов</TableHead>
              <TableHead class="py-3 px-4">Простой</TableHead>
              <TableHead class="py-3 px-4">Ставка</TableHead>
              <TableHead class="py-3 px-4">Потери</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow
              v-for="site in filteredSites"
              :key="site.id"
              class="row-interactive cursor-pointer"
              @click="selectedSite = site"
            >
              <TableCell class="font-medium text-sm py-3 px-4">{{ site.name }}</TableCell>
              <TableCell class="text-xs py-3 px-4">{{ site.address }}</TableCell>
              <TableCell class="text-xs py-3 px-4">
                {{ siteMetrics.get(site.id)?.robotCount ?? 0 }} роботов
                <span class="text-muted-foreground"
                  >({{ siteMetrics.get(site.id)?.activeCount ?? 0 }} акт.)</span
                >
              </TableCell>
              <TableCell class="text-sm tabular-nums py-3 px-4">
                {{ siteMetrics.get(site.id)?.activeCount ?? 0 }}/{{
                  siteMetrics.get(site.id)?.robotCount ?? 0
                }}
              </TableCell>
              <TableCell
                class="text-sm font-medium tabular-nums py-3 px-4"
                :class="availClass(availability(site.id))"
              >
                {{ availability(site.id).toFixed(1) }}%
              </TableCell>
              <TableCell class="text-sm tabular-nums py-3 px-4">{{
                siteMetrics.get(site.id)?.incCount ?? 0
              }}</TableCell>
              <TableCell class="text-sm tabular-nums py-3 px-4"
                >{{ ((siteMetrics.get(site.id)?.dtSeconds ?? 0) / 3600).toFixed(1) }} ч</TableCell
              >
              <TableCell class="text-sm tabular-nums py-3 px-4"
                >{{ (siteMetrics.get(site.id)?.rate ?? 0).toLocaleString('ru-RU') }} ₽/ч</TableCell
              >
              <TableCell class="text-sm font-medium tabular-nums py-3 px-4 text-destructive"
                >{{ (siteMetrics.get(site.id)?.loss ?? 0).toLocaleString('ru-RU') }} ₽</TableCell
              >
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>

    <!-- Site detail dialog -->
    <Dialog :open="!!selectedSite" @update:open="(v) => !v && (selectedSite = null)">
      <DialogContent class="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader class="pb-4 border-b border-border">
          <DialogTitle class="flex items-center gap-2"
            ><MapPin class="size-5 text-primary" /> {{ selectedSite?.name }}</DialogTitle
          >
          <DialogDescription
            >{{ selectedSite?.address }} ·
            {{ sourceInstanceLabel('RMS', selectedSite?.id ?? '') }}</DialogDescription
          >
        </DialogHeader>
        <div v-if="selectedSite" class="space-y-5">
          <!-- Stats -->
          <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div class="border border-border rounded-lg p-3 text-center">
              <div class="flex items-center justify-center gap-1 mb-0.5">
                <Bot class="size-3 text-muted-foreground" />
                <p class="text-xs text-muted-foreground">Парк</p>
              </div>
              <p class="text-lg font-bold tabular-nums">
                {{ siteMetrics.get(selectedSite.id)?.robotCount ?? 0 }}
              </p>
              <p class="text-xs text-muted-foreground">
                {{ siteMetrics.get(selectedSite.id)?.maintCount ?? 0 }} на обслуживании
              </p>
            </div>
            <div class="border border-border rounded-lg p-3 text-center">
              <div class="flex items-center justify-center gap-1 mb-0.5">
                <Clock class="size-3 text-muted-foreground" />
                <p class="text-xs text-muted-foreground">Доступность (30д)</p>
              </div>
              <p
                class="text-lg font-bold tabular-nums"
                :class="availClass(availability(selectedSite.id))"
              >
                {{ availability(selectedSite.id).toFixed(1) }}%
              </p>
            </div>
            <div class="border border-border rounded-lg p-3 text-center">
              <div class="flex items-center justify-center gap-1 mb-0.5">
                <Clock class="size-3 text-muted-foreground" />
                <p class="text-xs text-muted-foreground">Простой</p>
              </div>
              <p class="text-lg font-bold tabular-nums">
                {{ (selDowntime.seconds / 3600).toFixed(1) }} ч
              </p>
            </div>
            <div class="border border-border rounded-lg p-3 text-center">
              <div class="flex items-center justify-center gap-1 mb-0.5">
                <TrendingDown class="size-3 text-muted-foreground" />
                <p class="text-xs text-muted-foreground">Потери</p>
              </div>
              <p class="text-lg font-bold tabular-nums text-destructive">
                {{ selDowntime.loss.toLocaleString('ru-RU') }} ₽
              </p>
            </div>
          </div>

          <!-- Top causes -->
          <div v-if="selTopCauses.length > 0">
            <p class="text-sm font-medium mb-2">Топ причин по потерям</p>
            <div class="space-y-2">
              <div
                v-for="c in selTopCauses"
                :key="c.code"
                class="flex justify-between items-center text-sm"
              >
                <span
                  >{{ causeLabel(c.code) }}
                  <span class="text-xs text-muted-foreground">({{ c.count }} случ.)</span></span
                >
                <span class="font-medium tabular-nums">{{ c.loss.toLocaleString('ru-RU') }} ₽</span>
              </div>
            </div>
          </div>

          <!-- Problem zones -->
          <div v-if="selProblemZones.length > 0">
            <p class="text-sm font-medium mb-2">Проблемные зоны</p>
            <div class="flex flex-wrap gap-2">
              <span
                v-for="[zone, count] in selProblemZones"
                :key="zone"
                class="text-xs rounded-lg bg-warning/10 px-2.5 py-1.5 text-warning"
              >
                {{ zone }} — {{ count }} инц.
              </span>
            </div>
          </div>

          <!-- Robots -->
          <div>
            <p class="text-sm font-medium mb-2">Роботы объекта</p>
            <div class="flex flex-wrap gap-2">
              <span
                v-for="r in selRobots"
                :key="r.id"
                class="text-xs rounded-lg bg-muted/40 px-2.5 py-1.5"
                :class="{ 'text-warning': r.status === 'MAINTENANCE' }"
              >
                {{ r.name }}<span v-if="r.status === 'MAINTENANCE'"> (обслуж.)</span>
              </span>
            </div>
          </div>

          <!-- Incidents -->
          <div>
            <p class="text-sm font-medium mb-2">Инциденты объекта</p>
            <div class="space-y-1.5 max-h-60 overflow-y-auto">
              <RouterLink
                v-for="inc in selIncidents"
                :key="inc.id"
                :to="{ name: 'incident-details', params: { incidentId: inc.id } }"
                class="card-interactive flex items-center justify-between rounded-lg border border-border p-2.5"
                @click="selectedSite = null"
              >
                <div class="min-w-0">
                  <p class="text-sm font-mono">{{ inc.incidentNumber }}</p>
                  <p class="text-xs text-muted-foreground truncate">{{ inc.title }}</p>
                </div>
                <div class="text-right shrink-0 ml-2">
                  <p class="text-xs text-muted-foreground">{{ fmtDate(inc.detectedAt) }}</p>
                  <p
                    v-if="inc.lossRubles > 0"
                    class="text-xs font-medium tabular-nums text-destructive"
                  >
                    {{ inc.lossRubles.toLocaleString('ru-RU') }} ₽
                  </p>
                </div>
              </RouterLink>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  </div>
</template>
