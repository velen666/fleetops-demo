<script setup lang="ts">
import { computed } from 'vue'
import { useDemoData, type NextStep } from '@/composables/useDemoData'
import { useTenantScope } from '@/composables/useTenantScope'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowRight } from 'lucide-vue-next'
import { RouterLink, useRouter } from 'vue-router'
import { CAUSE_CATALOG } from '@/data/generator'
import { impactSeconds, techAvailabilityPct, powerAvailabilityPct } from '@/data/metrics'
import { ruCount } from '@/lib/utils'

/**
 * Главная страница руководителя эксплуатации/роботизации (Отчёт приёмки
 * §10.4, ACC-022): портфель объектов, системные отклонения, очередь решений.
 * Цепочка переходов: портфель → объект → зона → робот → инцидент.
 */

const { incidents, downtimes, sites, robots, maintenance, nextStep } = useDemoData()
const router = useRouter()
const scope = useTenantScope()

const scopedSites = scope.sites(sites.value)
const scopedRobots = scope.robots(robots.value)
const scopedMaintenance = scope.maintenance(maintenance.value)
const scopedIncidents = scope.incidents(incidents.value)
const scopedDowntimes = scope.downtimes(downtimes.value)

interface SiteCard {
  id: string
  name: string
  fleet: number
  working: number
  reserve: number
  reserveNorm: number
  service: number
  zonesDeficit: number
  techAvailability: number
  powerAvailability: number
  impactHours: number
  loss: number
  activeIncidents: number
  backlog: number
  repeatCauses: number
  /** Критичность: потери + активность + бэклог. */
  criticality: number
  verdict: 'normal' | 'risk' | 'critical'
}

const REPAIR_STATES = ['IN_REPAIR', 'AWAITING_REPAIR', 'DIAGNOSTICS', 'EMERGENCY_STOP', 'TEST_RUN']

const siteCards = computed<SiteCard[]>(() =>
  scopedSites.value
    .map((s) => {
      const fleet = scopedRobots.value.filter((r) => r.siteId === s.id)
      const siteDts = scopedDowntimes.value.filter((d) => d.siteId === s.id)
      const siteIncs = scopedIncidents.value.filter((i) => i.siteId === s.id)
      const works = scopedMaintenance.value.filter((m) => m.siteId === s.id)
      const loss = siteDts
        .filter(
          (d) =>
            d.intervalType === 'OPERATIONAL_IMPACT' &&
            (d.confirmationStatus === 'CONFIRMED' || d.confirmationStatus === 'ADJUSTED'),
        )
        .reduce((sum, d) => sum + d.lossRubles, 0)
      const activeIncidents = siteIncs.filter((i) => i.status !== 'CLOSED').length
      const backlog = works.filter(
        (m) => !['DONE', 'RESULT_CONFIRMED', 'CANCELLED'].includes(m.status),
      ).length
      const byCause = new Set(siteIncs.filter((i) => i.causeCode).map((i) => i.causeCode ?? ''))
      const criticality = loss / 10000 + activeIncidents * 3 + backlog * 2
      const tech = techAvailabilityPct(siteDts, fleet.length)
      const power = powerAvailabilityPct(siteDts, fleet.length)
      const verdict: SiteCard['verdict'] =
        loss > 300000 || activeIncidents >= 3
          ? 'critical'
          : loss > 100000 || backlog > 2
            ? 'risk'
            : 'normal'
      return {
        id: s.id,
        name: s.name,
        fleet: fleet.length,
        working: fleet.filter((r) => r.fleetState === 'WORKING').length,
        reserve: fleet.filter((r) => r.fleetState === 'RESERVE').length,
        reserveNorm: s.reserveNorm,
        service: fleet.filter((r) => REPAIR_STATES.includes(r.fleetState)).length,
        zonesDeficit: fleet.filter((r) => r.fleetState === 'WORKING').length < 1 ? 1 : 0,
        techAvailability: tech,
        powerAvailability: power,
        impactHours: impactSeconds(siteDts) / 3600,
        loss,
        activeIncidents,
        backlog,
        repeatCauses: byCause.size,
        criticality,
        verdict,
      }
    })
    .sort((a, b) => b.criticality - a.criticality),
)

const portfolioVerdict = computed(() => {
  const critical = siteCards.value.filter((c) => c.verdict === 'critical').length
  const risk = siteCards.value.filter((c) => c.verdict === 'risk').length
  const normal = siteCards.value.length - critical - risk
  const worst = siteCards.value[0]
  const decisions = scopedIncidents.value.filter((i) => i.status !== 'CLOSED').length
  const label =
    critical > 0 ? 'Критическое отклонение' : risk > 0 ? 'Зона риска' : 'Портфель в норме'
  return { critical, risk, normal, worst, decisions, label }
})

const fleetKpis = computed(() => {
  const closed = scopedIncidents.value.filter(
    (i) => i.status === 'CLOSED' && i.detectedAt && i.closedAt,
  )
  const mttrMin =
    closed.length > 0
      ? closed.reduce(
          (s, i) => s + (Date.parse(i.closedAt ?? '') - Date.parse(i.detectedAt)) / 60000,
          0,
        ) / closed.length
      : 0
  const works = scopedMaintenance.value
  const overdue = works.filter(
    (m) => !m.completedAt && new Date(m.dueAt) < new Date() && m.status !== 'CANCELLED',
  ).length
  const backlog = works.filter(
    (m) => !['DONE', 'RESULT_CONFIRMED', 'CANCELLED'].includes(m.status),
  ).length
  return {
    techAvailability: techAvailabilityPct(scopedDowntimes.value, scopedRobots.value.length),
    powerAvailability: powerAvailabilityPct(scopedDowntimes.value, scopedRobots.value.length),
    mttrHours: mttrMin / 60,
    mttrCount: closed.length,
    backlog,
    overdue,
    loss: scopedDowntimes.value
      .filter(
        (d) =>
          d.intervalType === 'OPERATIONAL_IMPACT' &&
          (d.confirmationStatus === 'CONFIRMED' || d.confirmationStatus === 'ADJUSTED'),
      )
      .reduce((s, d) => s + d.lossRubles, 0),
  }
})

const primaryKpis = computed<
  Array<{
    label: string
    value: string
    detail: string
    valueClass: string
    to: 'analytics' | 'maintenance'
  }>
>(() => [
  {
    label: 'Техническая доступность',
    value: `${fleetKpis.value.techAvailability.toFixed(2)}%`,
    detail: 'парк × 8 ч × 30 дней',
    valueClass: 'text-success',
    to: 'analytics',
  },
  {
    label: 'Операционная доступность',
    value: `${fleetKpis.value.powerAvailability.toFixed(2)}%`,
    detail: 'мощность зон',
    valueClass: 'text-success',
    to: 'analytics',
  },
  {
    label: 'Подтверждённые потери',
    value: `${fmtMoney(fleetKpis.value.loss)} ₽`,
    detail: 'только подтверждённое влияние',
    valueClass: 'text-destructive',
    to: 'analytics',
  },
  {
    label: 'Просрочено ТОиР',
    value: String(fleetKpis.value.overdue),
    detail: ruCount(fleetKpis.value.overdue, [
      'работа требует контроля',
      'работы требуют контроля',
      'работ требуют контроля',
    ]),
    valueClass: fleetKpis.value.overdue > 0 ? 'text-destructive' : 'text-success',
    to: 'maintenance',
  },
])

/** Системные причины: повторяются на ≥2 объектах (Отчёт §10.4 строка 5). */
const systemicCauses = computed(() => {
  const map = new Map<string, { code: string; count: number; loss: number; sites: Set<string> }>()
  for (const inc of scopedIncidents.value) {
    if (!inc.causeCode || inc.lossRubles <= 0) continue
    const e = map.get(inc.causeCode) ?? {
      code: inc.causeCode,
      count: 0,
      loss: 0,
      sites: new Set<string>(),
    }
    e.count++
    e.loss += inc.lossRubles
    e.sites.add(inc.siteId)
    map.set(inc.causeCode, e)
  }
  return [...map.values()].filter((e) => e.sites.size >= 2).sort((a, b) => b.loss - a.loss)
})

/** Очередь решений портфеля (Отчёт §10.4 строка 6). */
const decisionQueue = computed(() =>
  scopedIncidents.value
    .filter((i) => i.status !== 'CLOSED')
    .map((i) => ({ incident: i, step: nextStep(i.id) as NextStep | null }))
    .filter((r) => r.step)
    .sort((a, b) => {
      const severityWeight: Record<string, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 }
      const severityDelta =
        severityWeight[b.incident.severity] - severityWeight[a.incident.severity]
      if (severityDelta !== 0) return severityDelta
      const lossDelta = b.incident.lossRubles - a.incident.lossRubles
      return lossDelta !== 0
        ? lossDelta
        : a.incident.detectedAt.localeCompare(b.incident.detectedAt)
    })
    .slice(0, 8),
)

/** Ведущее решение остаётся в hero: маршрут портфель → конкретный инцидент. */
const priorityDecision = computed(() => decisionQueue.value[0] ?? null)

function goSite(id: string): void {
  router.push({ name: 'site-details', params: { siteId: id } })
}
function goKpi(routeName: 'analytics' | 'maintenance'): void {
  router.push({ name: routeName })
}

function fmtMoney(n: number): string {
  return n.toLocaleString('ru-RU')
}

const VERDICT_CLASS: Record<SiteCard['verdict'], string> = {
  normal: 'text-success',
  risk: 'text-warning',
  critical: 'text-destructive',
}
const VERDICT_RU: Record<SiteCard['verdict'], string> = {
  normal: 'Норма',
  risk: 'Риск',
  critical: 'Критично',
}
</script>

<template>
  <div class="space-y-6">
    <!-- Строка 1: портфельный вердикт -->
    <Card tone="glass" density="spacious" class="page-hero">
      <CardContent class="space-y-5">
        <div class="flex flex-wrap items-start justify-between gap-5">
          <div class="max-w-2xl">
            <p class="eyebrow mb-2">Управленческий вердикт · 30 дней</p>
            <h2 class="text-balance text-3xl font-bold tracking-tight">
              {{ portfolioVerdict.label }}
            </h2>
            <p v-if="portfolioVerdict.worst" class="mt-3 text-sm leading-6 text-muted-foreground">
              Главное отклонение: {{ portfolioVerdict.worst.name }} —
              {{ fmtMoney(portfolioVerdict.worst.loss) }} ₽ подтверждённых потерь и
              {{
                ruCount(portfolioVerdict.worst.activeIncidents, [
                  'активный инцидент',
                  'активных инцидента',
                  'активных инцидентов',
                ])
              }}.
            </p>
          </div>
          <div class="grid min-w-[17rem] grid-cols-2 gap-x-7 gap-y-4 text-sm sm:grid-cols-4">
            <div>
              <p class="text-xs text-muted-foreground">В норме</p>
              <p class="font-bold tabular-nums text-success">{{ portfolioVerdict.normal }}</p>
            </div>
            <div>
              <p class="text-xs text-muted-foreground">В зоне риска</p>
              <p class="font-bold tabular-nums text-warning">{{ portfolioVerdict.risk }}</p>
            </div>
            <div>
              <p class="text-xs text-muted-foreground">Критические</p>
              <p class="font-bold tabular-nums text-destructive">
                {{ portfolioVerdict.critical }}
              </p>
            </div>
            <div>
              <p class="text-xs text-muted-foreground">Решений в очереди</p>
              <p class="font-bold tabular-nums">{{ portfolioVerdict.decisions }}</p>
            </div>
          </div>
        </div>
        <div class="grid gap-3 border-t border-border/60 pt-4 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div v-if="priorityDecision" class="min-w-0">
            <p class="eyebrow">Приоритет в очереди</p>
            <p class="mt-1 text-sm font-semibold">
              {{ priorityDecision.incident.incidentNumber }} · {{ priorityDecision.step?.label }}
            </p>
            <p
              class="mt-1 text-xs leading-5 text-muted-foreground sm:truncate lg:overflow-visible lg:text-clip lg:whitespace-normal lg:text-pretty"
            >
              {{ priorityDecision.incident.description }}
            </p>
            <p class="mt-1 text-xs text-muted-foreground">
              Ответственный: {{ priorityDecision.step?.owner ?? 'не назначен' }}
            </p>
          </div>
          <p v-else class="self-center text-xs text-muted-foreground">
            Контур: MTTR {{ fleetKpis.mttrHours.toFixed(1) }} ч · сервисный бэклог
            {{ fleetKpis.backlog }} ·
            {{
              ruCount(portfolioVerdict.decisions, [
                'активный инцидент',
                'активных инцидента',
                'активных инцидентов',
              ])
            }}
          </p>
          <div class="flex flex-wrap items-center gap-2">
            <Button v-if="priorityDecision" as-child>
              <RouterLink
                :to="{
                  name: 'incident-details',
                  params: { incidentId: priorityDecision.incident.id },
                }"
              >
                Открыть инцидент <ArrowRight class="size-4" />
              </RouterLink>
            </Button>
            <Button
              v-if="portfolioVerdict.worst"
              variant="outline"
              @click="goSite(portfolioVerdict.worst.id)"
            >
              Открыть объект
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- Строка 2: ключевые показатели портфеля -->
    <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Button
        v-for="kpi in primaryKpis"
        :key="kpi.label"
        variant="outline"
        class="card-data kpi-clickable h-auto min-h-30 flex-col items-start justify-center gap-1 p-4 text-left"
        @click="goKpi(kpi.to)"
      >
        <span class="text-xs font-medium text-muted-foreground">{{ kpi.label }}</span>
        <span class="text-2xl font-bold tabular-nums" :class="kpi.valueClass">{{ kpi.value }}</span>
        <span class="text-xs font-normal text-muted-foreground">{{ kpi.detail }}</span>
      </Button>
    </div>

    <!-- Строка 3: карточки объектов -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
      <Button
        v-for="c in siteCards"
        :key="c.id"
        as-child
        variant="outline"
        class="card-data kpi-clickable h-auto flex-col items-stretch gap-0 overflow-hidden p-0 text-left hover:border-primary/40"
      >
        <RouterLink :to="{ name: 'site-details', params: { siteId: c.id } }">
          <CardHeader class="pb-3">
            <CardTitle class="text-base flex items-center justify-between gap-2">
              {{ c.name }}
              <span class="status-pill" :class="VERDICT_CLASS[c.verdict]">
                {{ VERDICT_RU[c.verdict] }}
              </span>
            </CardTitle>
            <CardDescription>
              Парк {{ c.fleet }} роботов · {{ c.working }} работают
            </CardDescription>
          </CardHeader>
          <CardContent
            class="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border/60 pt-4 text-xs"
          >
            <div>
              <p class="text-muted-foreground">Потери</p>
              <p class="mt-1 font-semibold tabular-nums text-destructive">
                {{ fmtMoney(c.loss) }} ₽
              </p>
            </div>
            <div>
              <p class="text-muted-foreground">Активные инциденты</p>
              <p class="mt-1 font-semibold tabular-nums">{{ c.activeIncidents }}</p>
            </div>
            <div>
              <p class="text-muted-foreground">Резерв</p>
              <p
                class="mt-1 font-semibold tabular-nums"
                :class="c.reserve < c.reserveNorm ? 'text-warning' : 'text-success'"
              >
                {{ c.reserve }} / {{ c.reserveNorm }}
              </p>
            </div>
            <div>
              <p class="text-muted-foreground">Сервис / бэклог</p>
              <p class="mt-1 font-semibold tabular-nums">{{ c.service }} / {{ c.backlog }}</p>
            </div>
            <p class="col-span-2 border-t border-border/50 pt-2 text-muted-foreground tabular-nums">
              Тех. доступность {{ c.techAvailability.toFixed(1) }}% · мощность
              {{ c.powerAvailability.toFixed(1) }}% · влияние {{ c.impactHours.toFixed(1) }} ч
            </p>
          </CardContent>
        </RouterLink>
      </Button>
    </div>

    <!-- Строка 5: системные причины -->
    <Card v-if="systemicCauses.length">
      <CardHeader class="pb-2">
        <CardTitle class="text-base"
          >Системные причины (повторяются на нескольких объектах)</CardTitle
        >
      </CardHeader>
      <CardContent>
        <div class="space-y-1">
          <Button
            v-for="sc in systemicCauses"
            :key="sc.code"
            as-child
            variant="ghost"
            class="h-auto min-h-11 w-full justify-between rounded-none border-b border-border/50 px-0 py-2 text-left text-sm hover:text-primary"
          >
            <RouterLink :to="{ name: 'analytics', query: { cause: sc.code, view: 'site' } }">
              <span>{{ CAUSE_CATALOG[sc.code]?.name ?? sc.code }}</span>
              <span class="tabular-nums text-xs text-muted-foreground">
                {{ ruCount(sc.count, ['случай', 'случая', 'случаев']) }} ·
                {{ ruCount(sc.sites.size, ['объект', 'объекта', 'объектов']) }} ·
                <span class="text-destructive">{{ fmtMoney(sc.loss) }} ₽</span>
              </span>
            </RouterLink>
          </Button>
        </div>
      </CardContent>
    </Card>

    <!-- Строка 6: очередь решений -->
    <Card>
      <CardHeader class="pb-2">
        <CardTitle class="text-base">Очередь решений</CardTitle>
        <CardDescription
          >Изменить процесс, эскалировать сервису, пересмотреть резерв или регламент
          ТО</CardDescription
        >
      </CardHeader>
      <CardContent>
        <div class="space-y-1">
          <Button
            v-for="row in decisionQueue"
            :key="row.incident.id"
            as-child
            variant="ghost"
            class="h-auto min-h-11 w-full justify-between rounded-none border-b border-border/50 px-0 py-2 text-left text-sm hover:text-primary"
          >
            <RouterLink :to="{ name: 'incident-details', params: { incidentId: row.incident.id } }">
              <span class="font-mono text-xs">{{ row.incident.incidentNumber }}</span>
              <span class="ml-2 flex-1 truncate" :title="row.incident.description">{{
                row.incident.description
              }}</span>
              <span class="text-xs text-muted-foreground"
                >{{ row.step?.label }} · {{ row.step?.owner }}</span
              >
            </RouterLink>
          </Button>
          <p v-if="decisionQueue.length === 0" class="text-sm text-muted-foreground">
            Активных решений нет — портфель стабилен.
          </p>
        </div>
      </CardContent>
    </Card>
  </div>
</template>
