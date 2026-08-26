<script setup lang="ts">
import { computed } from 'vue'
import { useDemoData } from '@/composables/useDemoData'
import { useTenantScope } from '@/composables/useTenantScope'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { TrendingDown, ArrowRight, ShieldCheck, Hourglass } from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import { confirmedLossRubles } from '@/data/metrics'

/**
 * Главная страница финансово-операционного директора (Отчёт приёмки §10.5,
 * ACC-022/027): только подтверждённые потери с расшифровкой, объекты-лидеры,
 * предварительные потери по открытым простоям — отдельно. Роль только
 * читающая (permission-гарды стора, ACC-006). TCO/окупаемость/эффект план-факт
 * не показываются: подтверждённой расчётной базы нет (ACC-027).
 */

const { incidents, downtimes, sites } = useDemoData()
const router = useRouter()
const scope = useTenantScope()

const scopedSites = scope.sites(sites.value)
const scopedDowntimes = scope.downtimes(downtimes.value)
const scopedIncidents = scope.incidents(incidents.value)

/** Подтверждённые потери (CONFIRMED/ADJUSTED, только операционное влияние). */
const confirmedImpact = computed(() =>
  scopedDowntimes.value.filter(
    (d) =>
      d.intervalType === 'OPERATIONAL_IMPACT' &&
      (d.confirmationStatus === 'CONFIRMED' || d.confirmationStatus === 'ADJUSTED'),
  ),
)

const confirmedLoss = computed(() => confirmedLossRubles(scopedDowntimes.value))

/** Предварительные потери: открытые неподтверждённые простои (§10.5). */
const preliminary = computed(() => {
  const open = scopedDowntimes.value.filter(
    (d) => d.intervalType === 'OPERATIONAL_IMPACT' && d.confirmationStatus === 'PROPOSED',
  )
  return {
    count: open.length,
    loss: open.reduce((s, d) => s + d.lossRubles, 0),
  }
})

/** Доля подтверждённых расчётов в денежном контуре. */
const confirmedShare = computed(() => {
  const total = confirmedLoss.value + preliminary.value.loss
  return total > 0 ? (confirmedLoss.value / total) * 100 : 100
})

interface SiteLoss {
  id: string
  name: string
  loss: number
  hours: number
  rate: number
  count: number
}

const siteLosses = computed<SiteLoss[]>(() =>
  scopedSites.value
    .map((s) => {
      const dts = confirmedImpact.value.filter((d) => d.siteId === s.id)
      return {
        id: s.id,
        name: s.name,
        loss: dts.reduce((sum, d) => sum + d.lossRubles, 0),
        hours: dts.reduce((sum, d) => sum + d.accountableDurationSeconds, 0) / 3600,
        rate: s.ratePerHour,
        count: dts.length,
      }
    })
    .sort((a, b) => b.loss - a.loss),
)

/** Очередь финансово-операционных решений: потери без подтверждения. */
const decisionQueue = computed(() =>
  scopedIncidents.value
    .filter((i) => i.hasDowntime && !i.downtimeConfirmed && i.status !== 'CLOSED')
    .slice(0, 6),
)

function fmtMoney(n: number): string {
  return n.toLocaleString('ru-RU')
}
function goDowntimes(siteId?: string): void {
  router.push({ name: 'downtimes', query: siteId ? { site: siteId } : {} })
}
function goIncident(id: string): void {
  router.push({ name: 'incident-details', params: { incidentId: id } })
}
</script>

<template>
  <div class="space-y-4">
    <!-- Первый экран: потери за период -->
    <Card class="border-primary/30">
      <CardContent class="p-5 space-y-2">
        <div class="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p class="text-xs text-muted-foreground">
              Подтверждённые потери процесса · 30 дней · только операционное влияние
            </p>
            <p class="text-3xl font-bold tabular-nums text-destructive">
              {{ fmtMoney(confirmedLoss) }} ₽
            </p>
            <p class="text-xs text-muted-foreground mt-1">
              Формула: подтверждённые часы влияния × ставка объекта, округление до рубля.
              Техническая недоступность после ввода резерва не тарифицируется как потеря процесса.
            </p>
            <!-- Отчёт §10.5: Δ к предыдущему сопоставимому периоду. Данных за
                 предыдущие 30 дней в демо-наборе нет — по ACC-032 показатель
                 явно отмечен недоступным, нули не подставляются. -->
            <p class="text-xs text-muted-foreground">
              к предыдущему периоду: нет данных — контрольный набор покрывает один 30-дневный
              период.
            </p>
          </div>
          <div class="flex gap-6 text-sm">
            <div>
              <p class="text-xs text-muted-foreground">Подтверждено расчётов</p>
              <p class="font-bold tabular-nums flex items-center gap-1">
                <ShieldCheck class="size-3.5 text-success" />
                {{ confirmedShare.toFixed(0) }}%
              </p>
            </div>
            <div>
              <p class="text-xs text-muted-foreground flex items-center gap-1">
                <Hourglass class="size-3.5" /> Предварительно (открытые)
              </p>
              <p class="font-bold tabular-nums text-warning">
                {{ fmtMoney(preliminary.loss) }} ₽ · {{ preliminary.count }} простоев
              </p>
            </div>
          </div>
        </div>
        <div class="flex gap-2 pt-1">
          <Button size="sm" variant="outline" @click="goDowntimes()"
            >Расшифровать до простоев <ArrowRight class="size-3.5 ml-1"
          /></Button>
          <Button size="sm" variant="ghost" @click="router.push({ name: 'analytics' })"
            >Аналитика и экономика</Button
          >
        </div>
      </CardContent>
    </Card>

    <!-- Объекты с максимальными потерями -->
    <Card>
      <CardHeader class="pb-2">
        <CardTitle class="text-base">Объекты с максимальными потерями</CardTitle>
        <CardDescription
          >Каждая сумма раскрывается до простоя, длительности, ставки и правила
          расчёта</CardDescription
        >
      </CardHeader>
      <CardContent>
        <div class="space-y-1">
          <div
            v-for="s in siteLosses"
            :key="s.id"
            class="flex flex-wrap items-center justify-between gap-2 text-sm border-b border-border/50 pb-1 cursor-pointer hover:text-primary"
            @click="goDowntimes(s.id)"
          >
            <span class="font-medium">{{ s.name }}</span>
            <span class="tabular-nums text-xs text-muted-foreground">
              {{ s.count }} подтверждённых простоев · {{ s.hours.toFixed(1) }} ч ×
              {{ fmtMoney(s.rate) }} ₽/ч =
              <span class="text-destructive font-medium">{{ fmtMoney(s.loss) }} ₽</span>
            </span>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- Очередь финансово-операционных решений -->
    <Card>
      <CardHeader class="pb-2">
        <CardTitle class="text-base">Требует финансового внимания</CardTitle>
        <CardDescription
          >Инциденты с незакрытым решением по простою — риск недоказанных потерь</CardDescription
        >
      </CardHeader>
      <CardContent>
        <div class="space-y-1">
          <div
            v-for="i in decisionQueue"
            :key="i.id"
            class="flex flex-wrap items-center justify-between gap-2 text-sm border-b border-border/50 pb-1 cursor-pointer hover:text-primary"
            @click="goIncident(i.id)"
          >
            <span class="font-mono text-xs">{{ i.incidentNumber }}</span>
            <span class="flex-1 truncate ml-2">{{ i.description.slice(0, 80) }}</span>
            <span class="text-xs text-warning">решение по простою не принято</span>
          </div>
          <p v-if="decisionQueue.length === 0" class="text-sm text-muted-foreground">
            Все потери подтверждены — очередь пуста.
          </p>
        </div>
      </CardContent>
    </Card>

    <!-- Границы модели (ACC-027): без ТЭО полный эффект не показывается -->
    <Card>
      <CardContent class="p-4 text-xs text-muted-foreground">
        <p class="flex items-center gap-1">
          <TrendingDown class="size-3.5" />
          Полный эффект план/факт, TCO и окупаемость не рассчитываются: нет подтверждённого ТЭО,
          фактического объёма процесса и правил исключения двойного счёта. Показатели появятся
          только после активации соответствующей модели.
        </p>
      </CardContent>
    </Card>
  </div>
</template>
