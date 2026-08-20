<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useDemoData } from '@/composables/useDemoData'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertTriangle, Clock, TrendingDown, Activity, ArrowRight, MapPin } from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import { incidentTypeLabel, causeLabel, CAUSE_CATALOG } from '@/data/generator'

const { incidents, downtimes, stats, sites } = useDemoData()
const router = useRouter()

// Live dashboard
const liveOffset = ref({ downtimeSeconds: 0, lossRubles: 0 })
let liveTimer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  liveTimer = setInterval(() => {
    const extraSeconds = Math.floor(Math.random() * 120) + 30
    const extraLoss = Math.round((extraSeconds / 3600) * 55000)
    liveOffset.value.downtimeSeconds += extraSeconds
    liveOffset.value.lossRubles += extraLoss
  }, 12000)
})
onUnmounted(() => {
  if (liveTimer) clearInterval(liveTimer)
})

const liveAvailability = computed(() => {
  const base = stats.value.availability
  const extraImpact = (liveOffset.value.downtimeSeconds / (30 * 24 * 3600)) * 100
  return Math.max(0, base - extraImpact)
})
const liveDowntimeHours = computed(() =>
  ((stats.value.totalDowntimeSeconds + liveOffset.value.downtimeSeconds) / 3600).toFixed(1),
)
const liveLoss = computed(() => stats.value.totalLoss + liveOffset.value.lossRubles)

// Top problems with full context
const topProblemsDetailed = computed(() => {
  const lossByCause = new Map<
    string,
    { code: string; name: string; loss: number; count: number; hours: number; sites: Set<string> }
  >()
  for (const inc of incidents.value) {
    if (inc.lossRubles > 0 && inc.causeCode) {
      const existing = lossByCause.get(inc.causeCode) ?? {
        code: inc.causeCode,
        name: CAUSE_CATALOG[inc.causeCode]?.name ?? inc.causeCode,
        loss: 0,
        count: 0,
        hours: 0,
        sites: new Set<string>(),
      }
      existing.loss += inc.lossRubles
      existing.count++
      existing.hours += inc.downtimeSeconds / 3600
      existing.sites.add(inc.siteId)
      lossByCause.set(inc.causeCode, existing)
    }
  }
  return [...lossByCause.values()]
    .sort((a, b) => b.loss - a.loss)
    .slice(0, 3)
    .map((p) => ({
      ...p,
      percent: stats.value.totalLoss > 0 ? (p.loss / stats.value.totalLoss) * 100 : 0,
      siteNames: [...p.sites]
        .map((sid) => sites.value.find((s) => s.id === sid)?.name ?? sid)
        .join(', '),
      zone: CAUSE_CATALOG[p.code]?.zone ?? '—',
    }))
})

// Classification context
const classificationDetail = computed(() => ({
  total: stats.value.totalIncidents,
  classified: stats.value.classifiedCount,
  unclassified: stats.value.unclassifiedCount,
  percent: stats.value.unclassifiedPercent,
  unclassifiedIncidents: incidents.value.filter(
    (i) => i.causeMaturity === 'NONE' || i.causeCode === 'CA-060',
  ),
}))
</script>

<template>
  <div class="space-y-6">
    <!-- KPI cards -->
    <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card class="kpi-clickable" @click="router.push({ name: 'analytics' })">
        <CardContent class="p-4">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-muted-foreground">Доступность парка</p>
              <p class="text-2xl font-bold tabular-nums">{{ liveAvailability.toFixed(1) }}%</p>
              <p class="text-xs text-muted-foreground mt-0.5">за 30 дней</p>
            </div>
            <Activity class="size-8 text-success" />
          </div>
        </CardContent>
      </Card>
      <Card class="kpi-clickable" @click="router.push({ name: 'downtimes' })">
        <CardContent class="p-4">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-muted-foreground">Подтверждённый простой</p>
              <p class="text-2xl font-bold tabular-nums">{{ liveDowntimeHours }} ч</p>
              <p class="text-xs text-muted-foreground mt-0.5">
                {{ downtimes.filter((d) => d.confirmationStatus === 'CONFIRMED').length }} записей
              </p>
            </div>
            <Clock class="size-8 text-warning" />
          </div>
        </CardContent>
      </Card>
      <Card class="kpi-clickable" @click="router.push({ name: 'analytics' })">
        <CardContent class="p-4">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-muted-foreground">Подтверждённые потери</p>
              <p class="text-2xl font-bold tabular-nums">
                {{ liveLoss.toLocaleString('ru-RU') }} ₽
              </p>
              <p class="text-xs text-muted-foreground mt-0.5">из расчёта ставок</p>
            </div>
            <TrendingDown class="size-8 text-destructive" />
          </div>
        </CardContent>
      </Card>
      <Card class="kpi-clickable" @click="router.push({ name: 'incidents' })">
        <CardContent class="p-4">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-muted-foreground">Активные инциденты</p>
              <p class="text-2xl font-bold tabular-nums">{{ stats.activeIncidents }}</p>
              <p class="text-xs text-muted-foreground mt-0.5">требуют внимания</p>
            </div>
            <AlertTriangle class="size-8 text-orange-500" />
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- What needs attention -->
    <Card>
      <CardHeader><CardTitle>Что требует решения сегодня</CardTitle></CardHeader>
      <CardContent>
        <div v-if="stats.needsAttention.length === 0" class="text-sm text-muted-foreground py-4">
          Все инциденты классифицированы и назначены.
        </div>
        <div v-else class="space-y-2">
          <div
            v-for="item in stats.needsAttention"
            :key="item.incidentId"
            class="card-interactive flex items-center justify-between rounded-lg border border-border p-3 cursor-pointer"
            @click="
              router.push({ name: 'incident-details', params: { incidentId: item.incidentId } })
            "
          >
            <div>
              <p class="font-medium">{{ item.incidentNumber }} — {{ item.reason }}</p>
              <p class="text-xs text-muted-foreground">{{ item.detail }}</p>
            </div>
            <ArrowRight class="size-4 text-muted-foreground" />
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- Top problems with full context -->
    <Card>
      <CardHeader><CardTitle>Топ-3 системных проблемы по потерям</CardTitle></CardHeader>
      <CardContent>
        <div class="space-y-4">
          <div
            v-for="(item, idx) in topProblemsDetailed"
            :key="item.code"
            class="card-interactive rounded-lg border border-border p-4 cursor-pointer"
            @click="router.push({ name: 'analytics' })"
          >
            <div class="flex items-start justify-between mb-2">
              <div>
                <p class="font-medium">{{ idx + 1 }}. {{ causeLabel(item.code) }}</p>
                <div class="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
                  <span>{{ item.count }} инцидентов</span>
                  <span>{{ item.hours.toFixed(1) }} ч простоя</span>
                  <span class="flex items-center gap-0.5"
                    ><MapPin class="size-3" /> {{ item.siteNames }}</span
                  >
                  <span>Зона: {{ item.zone }}</span>
                </div>
              </div>
              <p class="text-lg font-bold tabular-nums text-destructive">
                {{ item.loss.toLocaleString('ru-RU') }} ₽
              </p>
            </div>
            <div class="h-2 rounded-full bg-muted overflow-hidden">
              <div
                class="h-full bg-destructive transition-all duration-1000"
                :style="{ width: item.percent + '%' }"
              />
            </div>
            <p class="text-xs text-muted-foreground mt-1">
              {{ item.percent.toFixed(0) }}% от общих потерь
            </p>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- Classification with context -->
    <Card>
      <CardHeader><CardTitle>Качество классификации инцидентов</CardTitle></CardHeader>
      <CardContent>
        <div class="space-y-3">
          <div class="grid grid-cols-3 gap-3">
            <div class="text-center p-3 bg-success/10 rounded-lg">
              <p class="text-2xl font-bold text-success tabular-nums">
                {{ classificationDetail.classified }}
              </p>
              <p class="text-xs text-muted-foreground">с причиной</p>
            </div>
            <div class="text-center p-3 bg-warning/10 rounded-lg">
              <p class="text-2xl font-bold text-warning tabular-nums">
                {{ classificationDetail.unclassified }}
              </p>
              <p class="text-xs text-muted-foreground">CA-060 / не определена</p>
            </div>
            <div class="text-center p-3 bg-muted rounded-lg">
              <p class="text-2xl font-bold tabular-nums">
                {{ classificationDetail.percent.toFixed(0) }}%
              </p>
              <p class="text-xs text-muted-foreground">доля неклассифицированных</p>
            </div>
          </div>
          <div v-if="classificationDetail.unclassifiedIncidents.length > 0" class="space-y-1">
            <p class="text-sm font-medium pt-2">Требуют классификации:</p>
            <div
              v-for="inc in classificationDetail.unclassifiedIncidents.slice(0, 5)"
              :key="inc.id"
              class="card-interactive flex items-center justify-between rounded-lg border border-border p-2 cursor-pointer"
              @click="router.push({ name: 'incident-details', params: { incidentId: inc.id } })"
            >
              <div>
                <p class="text-sm font-mono">{{ inc.incidentNumber }}</p>
                <p class="text-xs text-muted-foreground">
                  {{ incidentTypeLabel(inc.incidentTypeCode) }}
                </p>
              </div>
              <span class="text-xs text-warning">CA-060</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  </div>
</template>
