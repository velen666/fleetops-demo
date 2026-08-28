<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { useDemoData } from '@/composables/useDemoData'
import { useAuthStore } from '@/stores/auth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { FLEET_STATE_RU, FLEET_STATE_CLASS, MAINTENANCE_STATUS_RU } from '@/data/labels'
import { CAUSE_CATALOG, MISSION_STATS } from '@/data/generator'
import {
  ArrowRight,
  Bot,
  MapPin,
  ShieldAlert,
  TrendingDown,
  Wrench,
  Activity,
} from 'lucide-vue-next'

const router = useRouter()
const auth = useAuthStore()
const { incidents, downtimes, robots, sites, zones, maintenance } = useDemoData()

// Объектовая модель доступа (ТЗ v2.0 §3): начальник склада — свой объект.
const siteId = computed(() => auth.user?.siteIds[0] ?? 'site-pod')
const site = computed(() => sites.value.find((s) => s.id === siteId.value))
const siteZones = computed(() => zones.value.filter((z) => z.siteId === siteId.value))
const siteRobots = computed(() => robots.value.filter((r) => r.siteId === siteId.value))
const siteIncidents = computed(() => incidents.value.filter((i) => i.siteId === siteId.value))

/** Миссии робота (RMS/FMS) — Отчёт §10.3: при отсутствии WMS-единицы работы. */
const missions = computed(() => MISSION_STATS[siteId.value] ?? MISSION_STATS['site-pod'])

// ─── Ключевые показатели (§8.1) ────────────────────────────────────────────

function workingInZone(zoneId: string): number {
  return robots.value.filter((r) => r.fleetState === 'WORKING' && r.zoneId === zoneId).length
}

const zoneRows = computed(() =>
  siteZones.value.map((z) => {
    const actual = workingInZone(z.id)
    const zoneIncidents = siteIncidents.value.filter((i) => i.zoneName?.startsWith(z.code))
    return {
      ...z,
      actual,
      deficit: Math.max(0, z.requiredCapacity - actual),
      activeIncidents: zoneIncidents.filter((i) => i.status !== 'CLOSED').length,
      loss: zoneIncidents.reduce((s, i) => s + i.lossRubles, 0),
    }
  }),
)

function zoneRoute(zoneCode: string) {
  return { name: 'zone-details', params: { siteId: siteId.value, zoneCode } }
}

const deficitRoute = computed(() => {
  const deficit = zoneRows.value.find((zone) => zone.deficit > 0)
  return deficit
    ? zoneRoute(deficit.code)
    : { name: 'site-details', params: { siteId: siteId.value } }
})

const parkStates = computed(() => {
  const order = [
    'WORKING',
    'RESERVE',
    'ASSIGNED_REPLACE',
    'CHARGING',
    'EMERGENCY_STOP',
    'DIAGNOSTICS',
    'AWAITING_REPAIR',
    'IN_REPAIR',
    'TEST_RUN',
    'RETURNED_TO_PARK',
  ]
  return order
    .map((s) => ({
      state: s,
      label: FLEET_STATE_RU[s],
      cls: FLEET_STATE_CLASS[s],
      count: siteRobots.value.filter((r) => r.fleetState === s).length,
      robots: siteRobots.value.filter((r) => r.fleetState === s),
    }))
    .filter((g) => g.count > 0)
})

const kpi = computed(() => ({
  deficitZones: zoneRows.value.filter((z) => z.deficit > 0).length,
  working: siteRobots.value.filter((r) => r.fleetState === 'WORKING').length,
  reserve: siteRobots.value.filter((r) => r.fleetState === 'RESERVE').length,
  charging: siteRobots.value.filter((r) => r.fleetState === 'CHARGING').length,
  service: siteRobots.value.filter(
    (r) =>
      r.fleetState === 'IN_REPAIR' ||
      r.fleetState === 'AWAITING_REPAIR' ||
      r.fleetState === 'DIAGNOSTICS' ||
      r.fleetState === 'EMERGENCY_STOP',
  ).length,
  activeIncidents: siteIncidents.value.filter((i) => i.status !== 'CLOSED').length,
}))

// Резервная устойчивость (§5.1): норматив против доступного резерва.
const reserveState = computed(() => {
  const norm = site.value?.reserveNorm ?? 1
  const free = siteRobots.value.filter((r) => r.fleetState === 'RESERVE').length
  return { norm, free, below: free < norm }
})

// ─── Общий статус процесса (обязательные состояния §8.1) ──────────────────

const processStatus = computed(() => {
  const accident = siteIncidents.value.find(
    (i) => i.status === 'OPEN' || i.status === 'IN_PROGRESS',
  )
  const deficit = zoneRows.value.find((z) => z.deficit > 0)
  const overdue = backlog.value.find((m) => m.overdue)
  if (deficit && accident)
    return {
      level: 'critical',
      label: `Авария: дефицит мощности в зоне ${deficit.code}`,
      hint: 'Назначьте резерв или восстановите мощность зоны',
    }
  if (reserveState.value.below)
    return { level: 'warning', label: 'Резерв ниже норматива', hint: 'Риск устойчивости процесса' }
  if (overdue)
    return { level: 'warning', label: 'Просроченный ремонт', hint: 'Контроль сроков сервиса' }
  if (accident)
    return {
      level: 'warning',
      label: 'Авария, процесс восстановлен',
      hint: 'Сервис повреждённой единицы продолжается',
    }
  return { level: 'ok', label: 'Штатно', hint: 'Процесс идёт по плану' }
})

// ─── Требует внимания ──────────────────────────────────────────────────────

const attention = computed(() => {
  const items: Array<{ text: string; sub: string; to: string }> = []
  for (const i of siteIncidents.value.filter((x) => x.status !== 'CLOSED')) {
    if (!i.coordinatorName)
      items.push({
        text: `${i.incidentNumber}: нет координатора`,
        sub: i.title,
        to: `/incidents/${i.id}`,
      })
    if (i.causeMaturity === 'NONE')
      items.push({
        text: `${i.incidentNumber}: причина не определена`,
        sub: i.title,
        to: `/incidents/${i.id}`,
      })
    if (i.status === 'OPEN')
      items.push({
        text: `${i.incidentNumber}: новый инцидент — требуется разбор`,
        sub: i.title,
        to: `/incidents/${i.id}`,
      })
  }
  for (const z of zoneRows.value.filter((z) => z.deficit > 0))
    items.push({
      text: `Зона ${z.code}: дефицит мощности ${z.deficit} ед.`,
      sub: `Требуется ${z.requiredCapacity}, работает ${z.actual}`,
      to: `/sites/${siteId.value}/zones/${z.code}`,
    })
  if (reserveState.value.below)
    items.push({
      text: `Резерв ниже норматива: ${reserveState.value.free} из ${reserveState.value.norm}`,
      sub: 'Снижение резервной устойчивости объекта',
      to: `/robots`,
    })
  return items.slice(0, 6)
})

const operationsPulse = computed(() => {
  const deficit = zoneRows.value.find((z) => z.deficit > 0)
  return {
    attention: attention.value[0] ?? null,
    deficit,
    reserve: reserveState.value,
  }
})

// ─── Сервисный бэклог объекта (§8.6) ──────────────────────────────────────

const backlog = computed(() =>
  maintenance.value
    .filter(
      (m) =>
        m.siteId === siteId.value && !['RESULT_CONFIRMED', 'DONE', 'CANCELLED'].includes(m.status),
    )
    .map((m) => ({
      ...m,
      robotName: robots.value.find((r) => r.id === m.robotId)?.name ?? m.robotId,
      overdue: m.dueAt < new Date().toISOString(),
    }))
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt)),
)

// ─── Проблемы объекта (топ причин по потерям и повторяемости) ─────────────

const topProblems = computed(() => {
  const by = new Map<string, { code: string; loss: number; count: number; zones: Set<string> }>()
  for (const i of siteIncidents.value) {
    if (!i.causeCode || i.lossRubles <= 0) continue
    const e = by.get(i.causeCode) ?? {
      code: i.causeCode,
      loss: 0,
      count: 0,
      zones: new Set<string>(),
    }
    e.loss += i.lossRubles
    e.count++
    if (i.zoneName) e.zones.add(i.zoneName.split(' ')[0])
    by.set(i.causeCode, e)
  }
  const total = [...by.values()].reduce((s, p) => s + p.loss, 0)
  return [...by.values()]
    .sort((a, b) => b.loss - a.loss)
    .slice(0, 4)
    .map((p) => ({
      ...p,
      name: CAUSE_CATALOG[p.code]?.name ?? p.code,
      percent: total > 0 ? (p.loss / total) * 100 : 0,
    }))
})

const impactHours = computed(() => {
  const seconds = downtimes.value
    .filter(
      (d) =>
        d.siteId === siteId.value &&
        d.intervalType === 'OPERATIONAL_IMPACT' &&
        d.confirmationStatus === 'CONFIRMED',
    )
    .reduce((s, d) => s + d.accountableDurationSeconds, 0)
  return seconds / 3600
})

const impactLoss = computed(() =>
  downtimes.value
    .filter(
      (d) =>
        d.siteId === siteId.value &&
        d.intervalType === 'OPERATIONAL_IMPACT' &&
        d.confirmationStatus === 'CONFIRMED',
    )
    .reduce((s, d) => s + d.lossRubles, 0),
)

function fmtMoney(n: number): string {
  return n.toLocaleString('ru-RU')
}
</script>

<template>
  <div class="space-y-6">
    <!-- Состояние процесса и следующий drill-down в одном Operations Pulse. -->
    <section class="page-hero p-5 sm:p-6">
      <div class="flex flex-wrap items-start justify-between gap-5">
        <div class="max-w-2xl">
          <p class="eyebrow mb-2">Operations Pulse · 30 дней</p>
          <h1 class="text-balance text-3xl font-bold tracking-tight">
            {{ site?.name ?? 'Объект' }}
          </h1>
          <p class="mt-2 text-sm text-muted-foreground">
            Ставка подтверждённых потерь {{ fmtMoney(site?.ratePerHour ?? 0) }} ₽/ч ·
            {{ processStatus.hint }}
          </p>
        </div>
        <span
          class="status-pill"
          :class="
            processStatus.level === 'critical'
              ? 'bg-destructive/15 text-destructive'
              : processStatus.level === 'warning'
                ? 'bg-warning/15 text-warning'
                : 'bg-success/15 text-success'
          "
        >
          <ShieldAlert class="size-3.5" /> {{ processStatus.label }}
        </span>
      </div>
      <div class="mt-5 grid gap-3 border-t border-border/60 pt-4 md:grid-cols-[1fr_auto]">
        <div>
          <p class="text-sm font-semibold">
            {{ operationsPulse.attention?.text ?? 'Отклонений, требующих решения, нет' }}
          </p>
          <p class="mt-1 text-xs text-muted-foreground">
            {{ operationsPulse.attention?.sub ?? 'Процесс и резерв находятся в рабочем состоянии' }}
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-3">
          <p class="text-xs text-muted-foreground">
            Резерв {{ operationsPulse.reserve.free }} / {{ operationsPulse.reserve.norm }} · зарядка
            {{ kpi.charging }} · инцидентов {{ kpi.activeIncidents }}
          </p>
          <Button
            v-if="operationsPulse.attention"
            @click="router.push(operationsPulse.attention.to)"
          >
            Открыть приоритет <ArrowRight class="size-4" />
          </Button>
        </div>
      </div>
    </section>

    <!-- Ключевые показатели (§8.1; title = определение, период) -->
    <div class="grid grid-cols-2 gap-4 md:grid-cols-4">
      <Button
        as-child
        variant="outline"
        class="card-data kpi-clickable h-auto min-h-30 flex-col items-stretch justify-center p-0 text-left"
        :class="kpi.deficitZones > 0 ? 'border-destructive/40' : ''"
        title="Зоны, где работающих меньше требуемой мощности. Период: сейчас."
      >
        <RouterLink :to="deficitRoute">
          <CardContent class="p-4">
            <p class="text-sm text-muted-foreground">Зоны с дефицитом</p>
            <p
              class="text-2xl font-bold tabular-nums"
              :class="kpi.deficitZones > 0 ? 'text-destructive' : ''"
            >
              {{ kpi.deficitZones }}
            </p>
          </CardContent>
        </RouterLink>
      </Button>
      <Button
        as-child
        variant="outline"
        class="card-data kpi-clickable h-auto min-h-30 flex-col items-stretch justify-center p-0 text-left"
        title="Роботы в состоянии «Работает в зоне». Период: сейчас."
      >
        <RouterLink :to="{ name: 'site-details', params: { siteId } }">
          <CardContent class="p-4">
            <p class="text-sm text-muted-foreground">Работают</p>
            <p class="text-2xl font-bold tabular-nums text-success">{{ kpi.working }}</p>
          </CardContent>
        </RouterLink>
      </Button>
      <Button
        as-child
        variant="outline"
        class="card-data kpi-clickable h-auto min-h-30 flex-col items-stretch justify-center p-0 text-left"
        :title="`Свободный резерв против норматива (${reserveState.norm}). Ниже норматива — риск устойчивости, не потеря.`"
      >
        <RouterLink :to="{ name: 'site-details', params: { siteId } }">
          <CardContent class="p-4">
            <p class="text-sm text-muted-foreground">Резерв</p>
            <p
              class="text-2xl font-bold tabular-nums"
              :class="reserveState.below ? 'text-warning' : 'text-primary'"
            >
              {{ kpi.reserve }} / {{ reserveState.norm }}
            </p>
          </CardContent>
        </RouterLink>
      </Button>
      <Button
        as-child
        variant="outline"
        class="card-data kpi-clickable h-auto min-h-30 flex-col items-stretch justify-center p-0 text-left"
        title="Диагностика, ожидание ремонта/запчастей, ремонт, аварийная остановка. Период: сейчас."
      >
        <RouterLink :to="{ name: 'maintenance' }">
          <CardContent class="p-4">
            <p class="text-sm text-muted-foreground">Сервис / авария</p>
            <p class="text-2xl font-bold tabular-nums text-warning">{{ kpi.service }}</p>
          </CardContent>
        </RouterLink>
      </Button>
    </div>

    <!-- Зоны объекта -->
    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2"
          ><MapPin class="size-4" /> Зоны объекта</CardTitle
        >
      </CardHeader>
      <CardContent>
        <div class="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow class="text-left text-muted-foreground">
                <TableHead>Зона</TableHead>
                <TableHead>Процесс</TableHead>
                <TableHead>Мощность</TableHead>
                <TableHead>Дефицит</TableHead>
                <TableHead>Инциденты</TableHead>
                <TableHead>Потери за период</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="z in zoneRows" :key="z.id">
                <TableCell class="p-0 font-medium">
                  <Button
                    as-child
                    variant="ghost"
                    class="h-auto min-h-11 w-full justify-start rounded-none px-3 py-2.5 text-left hover:bg-transparent hover:text-primary"
                  >
                    <RouterLink :to="zoneRoute(z.code)">
                      {{ z.name }} <ArrowRight class="size-3.5" />
                    </RouterLink>
                  </Button>
                </TableCell>
                <TableCell class="text-muted-foreground">{{ z.process }}</TableCell>
                <TableCell class="tabular-nums">
                  <span :class="z.deficit > 0 ? 'text-destructive font-semibold' : 'text-success'">
                    {{ z.actual }} / {{ z.requiredCapacity }}
                  </span>
                </TableCell>
                <TableCell class="tabular-nums" :class="z.deficit > 0 ? 'text-destructive' : ''">
                  {{ z.deficit > 0 ? `−${z.deficit} ед.` : '—' }}
                </TableCell>
                <TableCell class="tabular-nums">
                  <span v-if="z.activeIncidents > 0" class="text-destructive"
                    >{{ z.activeIncidents }} активных</span
                  >
                  <span v-else class="text-muted-foreground">нет</span>
                </TableCell>
                <TableCell class="tabular-nums text-destructive"
                  >{{ fmtMoney(z.loss) }} ₽</TableCell
                >
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>

    <div class="grid gap-4 lg:grid-cols-2">
      <!-- Распределение парка -->
      <Card>
        <CardHeader>
          <CardTitle class="flex items-center gap-2"
            ><Bot class="size-4" /> Распределение парка ({{ siteRobots.length }})</CardTitle
          >
        </CardHeader>
        <CardContent class="space-y-2">
          <Button
            v-for="g in parkStates"
            :key="g.state"
            as-child
            variant="ghost"
            class="card-interactive h-auto min-h-11 w-full justify-between rounded-lg border border-border p-3 text-left"
          >
            <RouterLink :to="{ name: 'robots' }" class="flex items-center justify-between gap-3">
              <span class="rounded px-2 py-0.5 text-xs font-medium" :class="g.cls">{{
                g.label
              }}</span>
              <span class="text-right">
                <span class="font-bold tabular-nums">{{ g.count }}</span>
                <span class="text-xs text-muted-foreground ml-2">
                  {{ g.robots.map((r) => r.name).join(', ') }}
                </span>
              </span>
            </RouterLink>
          </Button>
        </CardContent>
      </Card>

      <!-- Миссии роботов (RMS/FMS; Отчёт §10.3: при отсутствии WMS) -->
      <Card>
        <CardHeader>
          <CardTitle class="flex items-center gap-2"
            ><Activity class="size-4" /> Миссии роботов (RMS/FMS)</CardTitle
          >
          <p class="text-xs text-muted-foreground -mt-1">
            WMS не подключена — единица работы: миссия робота, источник RMS/FMS. Не является
            производственным планом склада.
          </p>
        </CardHeader>
        <CardContent class="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <p class="text-xs text-muted-foreground">Создано · 30 дней</p>
            <p class="text-xl font-bold tabular-nums">{{ missions.created }}</p>
          </div>
          <div>
            <p class="text-xs text-muted-foreground">Завершено без ошибки</p>
            <p class="text-xl font-bold tabular-nums">{{ missions.completed }}</p>
          </div>
          <div>
            <p class="text-xs text-muted-foreground">Прервано</p>
            <p class="text-xl font-bold tabular-nums">{{ missions.interrupted }}</p>
          </div>
          <div>
            <p class="text-xs text-muted-foreground">В очереди сейчас</p>
            <p class="text-xl font-bold tabular-nums">{{ missions.queued }}</p>
          </div>
          <div>
            <p class="text-xs text-muted-foreground">Средняя миссия</p>
            <p class="text-xl font-bold tabular-nums">
              {{ missions.avgMissionMin.toLocaleString('ru-RU') }} мин
            </p>
          </div>
          <div>
            <p class="text-xs text-muted-foreground">Без миссий сейчас</p>
            <p class="text-xl font-bold tabular-nums">{{ missions.robotsWithoutMissions }}</p>
          </div>
        </CardContent>
      </Card>

      <!-- Требует внимания -->
      <Card>
        <CardHeader>
          <CardTitle class="flex items-center gap-2">
            <ShieldAlert class="size-4" /> Требует внимания
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div v-if="attention.length === 0" class="text-sm text-muted-foreground py-4">
            Всё под контролем: аварий нет, процесс идёт по плану.
          </div>
          <div v-else class="space-y-2">
            <Button
              v-for="(a, idx) in attention"
              :key="idx"
              as-child
              variant="ghost"
              class="card-interactive h-auto min-h-11 w-full justify-between rounded-lg border border-border p-3 text-left"
            >
              <RouterLink :to="a.to" class="flex items-center justify-between gap-3">
                <span>
                  <span class="block text-sm font-medium">{{ a.text }}</span>
                  <span class="block text-xs text-muted-foreground">{{ a.sub }}</span>
                </span>
                <ArrowRight class="size-4 text-muted-foreground" />
              </RouterLink>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- Сервисный бэклог -->
    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2"
          ><Wrench class="size-4" /> Сервисный бэклог объекта</CardTitle
        >
      </CardHeader>
      <CardContent>
        <div v-if="backlog.length === 0" class="text-sm text-muted-foreground py-4">
          Нет активных сервисных работ.
        </div>
        <div v-else class="space-y-2">
          <Button
            v-for="m in backlog"
            :key="m.id"
            as-child
            variant="ghost"
            class="card-interactive h-auto min-h-11 w-full justify-between rounded-lg border border-border p-3 text-left"
          >
            <RouterLink
              :to="{ name: 'maintenance' }"
              class="flex items-center justify-between gap-3"
            >
              <span>
                <span class="block text-sm font-medium">{{ m.robotName }} — {{ m.title }}</span>
                <span class="block text-xs text-muted-foreground">
                  {{ m.problem ?? 'Плановая работа' }} · Исполнитель: {{ m.executor }}
                </span>
              </span>
              <span class="flex items-center gap-2">
                <span
                  v-if="m.overdue"
                  class="rounded bg-destructive/15 text-destructive px-2 py-0.5 text-xs font-medium"
                  >Просрочено</span
                >
                <span
                  class="rounded bg-muted text-muted-foreground px-2 py-0.5 text-xs font-medium"
                  >{{ MAINTENANCE_STATUS_RU[m.status] }}</span
                >
                <span class="text-xs text-muted-foreground tabular-nums">
                  срок {{ new Date(m.dueAt).toLocaleDateString('ru-RU') }}
                </span>
              </span>
            </RouterLink>
          </Button>
        </div>
      </CardContent>
    </Card>

    <!-- Проблемы объекта + экономика -->
    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2"
          ><TrendingDown class="size-4" /> Проблемы объекта за период</CardTitle
        >
      </CardHeader>
      <CardContent>
        <div class="mb-4 grid grid-cols-2 gap-3">
          <div class="rounded-lg bg-muted/50 p-3">
            <p
              class="text-xs text-muted-foreground"
              title="Сумма подтверждённого операционного влияния на процесс объекта. Период: 30 дней."
            >
              Подтверждённое операционное влияние
            </p>
            <p class="text-xl font-bold tabular-nums">{{ impactHours.toFixed(2) }} ч</p>
          </div>
          <div class="rounded-lg bg-muted/50 p-3">
            <p
              class="text-xs text-muted-foreground"
              title="Потери процесса = подтверждённые часы влияния × ставка объекта. Период: 30 дней."
            >
              Потери процесса
            </p>
            <p class="text-xl font-bold tabular-nums text-destructive">
              {{ fmtMoney(impactLoss) }} ₽
            </p>
          </div>
        </div>
        <div class="space-y-2">
          <Button
            v-for="p in topProblems"
            :key="p.code"
            as-child
            variant="ghost"
            class="card-interactive h-auto min-h-11 w-full rounded-lg border border-border p-3 text-left"
          >
            <RouterLink
              :to="{ name: 'analytics', query: { cause: p.code, view: 'site' } }"
              class="block"
            >
              <span class="flex items-center justify-between gap-3">
                <span>
                  <span class="block text-sm font-medium">{{ p.name }}</span>
                  <span class="block text-xs text-muted-foreground">
                    {{ p.count }} инцидентов · зоны: {{ [...p.zones].join(', ') || '—' }}
                  </span>
                </span>
                <span class="text-sm font-bold tabular-nums text-destructive">
                  {{ fmtMoney(p.loss) }} ₽
                </span>
              </span>
              <span class="mt-2 block h-1.5 overflow-hidden rounded-full bg-muted">
                <span class="block h-full bg-destructive" :style="{ width: p.percent + '%' }" />
              </span>
            </RouterLink>
          </Button>
          <div v-if="topProblems.length === 0" class="text-sm text-muted-foreground">
            Потерь за период не зафиксировано.
          </div>
        </div>
      </CardContent>
    </Card>
  </div>
</template>
