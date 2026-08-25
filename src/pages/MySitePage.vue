<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useDemoData } from '@/composables/useDemoData'
import { useAuthStore } from '@/stores/auth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FLEET_STATE_RU, FLEET_STATE_CLASS, MAINTENANCE_STATUS_RU } from '@/data/labels'
import { CAUSE_CATALOG } from '@/data/generator'
import { ArrowRight, Bot, MapPin, ShieldAlert, TrendingDown, Wrench } from 'lucide-vue-next'

const router = useRouter()
const auth = useAuthStore()
const { incidents, downtimes, robots, sites, zones, maintenance } = useDemoData()

// Объектовая модель доступа (ТЗ v2.0 §3): начальник склада — свой объект.
const siteId = computed(() => auth.user?.siteIds[0] ?? 'site-pod')
const site = computed(() => sites.value.find((s) => s.id === siteId.value))
const siteZones = computed(() => zones.value.filter((z) => z.siteId === siteId.value))
const siteRobots = computed(() => robots.value.filter((r) => r.siteId === siteId.value))
const siteIncidents = computed(() => incidents.value.filter((i) => i.siteId === siteId.value))

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
      to: `/sites/${siteId.value}`,
    })
  if (reserveState.value.below)
    items.push({
      text: `Резерв ниже норматива: ${reserveState.value.free} из ${reserveState.value.norm}`,
      sub: 'Снижение резервной устойчивости объекта',
      to: `/robots`,
    })
  return items.slice(0, 6)
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

const updatedAgo = '09:15'

function fmtMoney(n: number): string {
  return n.toLocaleString('ru-RU')
}
</script>

<template>
  <div class="space-y-6">
    <!-- Верхняя строка: объект, период, обновление, статус процесса -->
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex items-center gap-3">
        <MapPin class="size-5 text-primary" />
        <div>
          <h1 class="text-xl font-semibold">{{ site?.name ?? 'Объект' }}</h1>
          <p class="text-sm text-muted-foreground">
            Период: 30 дней · Обновлено {{ updatedAgo }} · Ставка потерь
            {{ fmtMoney(site?.ratePerHour ?? 0) }} ₽/ч
          </p>
        </div>
      </div>
      <span
        :class="
          processStatus.level === 'critical'
            ? 'bg-destructive/15 text-destructive'
            : processStatus.level === 'warning'
              ? 'bg-warning/15 text-warning'
              : 'bg-success/15 text-success'
        "
        class="rounded px-3 py-1.5 text-sm font-medium"
      >
        {{ processStatus.label }}
      </span>
    </div>

    <!-- Ключевые показатели -->
    <div class="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
      <Card
        class="kpi-clickable"
        :class="kpi.deficitZones > 0 ? 'border-destructive/40' : ''"
        @click="router.push(`/sites/${siteId}`)"
      >
        <CardContent class="p-4">
          <p class="text-sm text-muted-foreground">Зоны с дефицитом</p>
          <p
            class="text-2xl font-bold tabular-nums"
            :class="kpi.deficitZones > 0 ? 'text-destructive' : ''"
          >
            {{ kpi.deficitZones }}
          </p>
        </CardContent>
      </Card>
      <Card class="kpi-clickable" @click="router.push(`/sites/${siteId}`)">
        <CardContent class="p-4">
          <p class="text-sm text-muted-foreground">Работают</p>
          <p class="text-2xl font-bold tabular-nums text-success">{{ kpi.working }}</p>
        </CardContent>
      </Card>
      <Card class="kpi-clickable" @click="router.push(`/sites/${siteId}`)">
        <CardContent class="p-4">
          <p class="text-sm text-muted-foreground">Резерв</p>
          <p
            class="text-2xl font-bold tabular-nums"
            :class="reserveState.below ? 'text-warning' : 'text-cyan-500'"
          >
            {{ kpi.reserve }} / {{ reserveState.norm }}
          </p>
        </CardContent>
      </Card>
      <Card class="kpi-clickable" @click="router.push('/robots')">
        <CardContent class="p-4">
          <p class="text-sm text-muted-foreground">Зарядка</p>
          <p class="text-2xl font-bold tabular-nums">{{ kpi.charging }}</p>
        </CardContent>
      </Card>
      <Card class="kpi-clickable" @click="router.push('/maintenance')">
        <CardContent class="p-4">
          <p class="text-sm text-muted-foreground">Сервис / авария</p>
          <p class="text-2xl font-bold tabular-nums text-warning">{{ kpi.service }}</p>
        </CardContent>
      </Card>
      <Card class="kpi-clickable" @click="router.push('/incidents')">
        <CardContent class="p-4">
          <p class="text-sm text-muted-foreground">Активные инциденты</p>
          <p
            class="text-2xl font-bold tabular-nums"
            :class="kpi.activeIncidents > 0 ? 'text-orange-500' : ''"
          >
            {{ kpi.activeIncidents }}
          </p>
        </CardContent>
      </Card>
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
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b text-left text-muted-foreground">
                <th class="py-2 pr-4 font-medium">Зона</th>
                <th class="py-2 pr-4 font-medium">Процесс</th>
                <th class="py-2 pr-4 font-medium">Мощность</th>
                <th class="py-2 pr-4 font-medium">Дефицит</th>
                <th class="py-2 pr-4 font-medium">Инциденты</th>
                <th class="py-2 font-medium">Потери за период</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="z in zoneRows"
                :key="z.id"
                class="card-interactive cursor-pointer border-b last:border-0"
                @click="router.push(`/sites/${siteId}`)"
              >
                <td class="py-2.5 pr-4 font-medium">{{ z.name }}</td>
                <td class="py-2.5 pr-4 text-muted-foreground">{{ z.process }}</td>
                <td class="py-2.5 pr-4 tabular-nums">
                  <span :class="z.deficit > 0 ? 'text-destructive font-semibold' : 'text-success'">
                    {{ z.actual }} / {{ z.requiredCapacity }}
                  </span>
                </td>
                <td
                  class="py-2.5 pr-4 tabular-nums"
                  :class="z.deficit > 0 ? 'text-destructive' : ''"
                >
                  {{ z.deficit > 0 ? `−${z.deficit} ед.` : '—' }}
                </td>
                <td class="py-2.5 pr-4 tabular-nums">
                  <span v-if="z.activeIncidents > 0" class="text-orange-500"
                    >{{ z.activeIncidents }} активных</span
                  >
                  <span v-else class="text-muted-foreground">нет</span>
                </td>
                <td class="py-2.5 tabular-nums text-destructive">{{ fmtMoney(z.loss) }} ₽</td>
              </tr>
            </tbody>
          </table>
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
          <div
            v-for="g in parkStates"
            :key="g.state"
            class="card-interactive flex items-center justify-between rounded-lg border border-border p-3 cursor-pointer"
            @click="router.push('/robots')"
          >
            <div class="flex items-center gap-2">
              <span class="rounded px-2 py-0.5 text-xs font-medium" :class="g.cls">{{
                g.label
              }}</span>
            </div>
            <div class="text-right">
              <span class="font-bold tabular-nums">{{ g.count }}</span>
              <span class="text-xs text-muted-foreground ml-2">
                {{ g.robots.map((r) => r.name).join(', ') }}
              </span>
            </div>
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
            <div
              v-for="(a, idx) in attention"
              :key="idx"
              class="card-interactive flex items-center justify-between rounded-lg border border-border p-3 cursor-pointer"
              @click="router.push(a.to)"
            >
              <div>
                <p class="text-sm font-medium">{{ a.text }}</p>
                <p class="text-xs text-muted-foreground">{{ a.sub }}</p>
              </div>
              <ArrowRight class="size-4 text-muted-foreground" />
            </div>
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
          <div
            v-for="m in backlog"
            :key="m.id"
            class="card-interactive flex items-center justify-between rounded-lg border border-border p-3 cursor-pointer"
            @click="router.push('/maintenance')"
          >
            <div>
              <p class="text-sm font-medium">{{ m.robotName }} — {{ m.title }}</p>
              <p class="text-xs text-muted-foreground">
                {{ m.problem ?? 'Плановая работа' }} · Исполнитель: {{ m.executor }}
              </p>
            </div>
            <div class="flex items-center gap-2">
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
            </div>
          </div>
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
            <p class="text-xs text-muted-foreground">Подтверждённое операционное влияние</p>
            <p class="text-xl font-bold tabular-nums">{{ impactHours.toFixed(2) }} ч</p>
          </div>
          <div class="rounded-lg bg-muted/50 p-3">
            <p class="text-xs text-muted-foreground">Потери процесса</p>
            <p class="text-xl font-bold tabular-nums text-destructive">
              {{ fmtMoney(impactLoss) }} ₽
            </p>
          </div>
        </div>
        <div class="space-y-2">
          <div
            v-for="p in topProblems"
            :key="p.code"
            class="card-interactive rounded-lg border border-border p-3 cursor-pointer"
            @click="router.push('/analytics')"
          >
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm font-medium">{{ p.name }}</p>
                <p class="text-xs text-muted-foreground">
                  {{ p.count }} инцидентов · зоны: {{ [...p.zones].join(', ') || '—' }}
                </p>
              </div>
              <p class="text-sm font-bold tabular-nums text-destructive">
                {{ fmtMoney(p.loss) }} ₽
              </p>
            </div>
            <div class="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
              <div class="h-full bg-destructive" :style="{ width: p.percent + '%' }" />
            </div>
          </div>
          <div v-if="topProblems.length === 0" class="text-sm text-muted-foreground">
            Потерь за период не зафиксировано.
          </div>
        </div>
      </CardContent>
    </Card>
  </div>
</template>
