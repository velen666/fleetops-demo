<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import { useDemoData } from '@/composables/useDemoData'
import { computed } from 'vue'
import { Card, CardContent } from '@/components/ui/card'
import { ArrowLeft, Bot, MapPin, User, Clock } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { incidentTypeLabel, causeLabel, INCIDENT_TYPES } from '@/data/generator'
import { CAUSE_CATALOG } from '@/data/generator'
import {
  INCIDENT_STATUS_RU, INCIDENT_STATUS_CLASS, SEVERITY_RU,
  CAUSE_MATURITY_RU, DOWNTIME_STATUS_RU, INTERVAL_STATUS_RU,
  ACTION_STATUS_RU, ACTION_RESULT_RU, RESPONSIBILITY_ZONE_RU,
  sourceInstanceLabel,
} from '@/data/labels'

const route = useRoute()
const router = useRouter()
const { incidents, events, downtimes, serviceActions, recoveryConfirmations, timeline, causeClassifications, sites, robots } = useDemoData()

const incidentId = computed(() => String(route.params.incidentId ?? ''))
const incident = computed(() => incidents.value.find((i) => i.id === incidentId.value))
const incidentEvents = computed(() => events.value.filter((e) => e.incidentId === incidentId.value))
const incidentDowntime = computed(() => downtimes.value.find((d) => d.incidentId === incidentId.value))
const incidentActions = computed(() => serviceActions.value.filter((a) => a.incidentId === incidentId.value))
const incidentRecovery = computed(() => recoveryConfirmations.value.find((r) => r.incidentId === incidentId.value))
const incidentTimeline = computed(() => timeline.value.filter((t) => t.incidentId === incidentId.value).sort((a, b) => a.timestamp.localeCompare(b.timestamp)))
const incidentCause = computed(() => causeClassifications.value.find((c) => c.incidentId === incidentId.value))

function siteName(id: string): string { return sites.value.find((s) => s.id === id)?.name ?? id }
function robotName(id: string | null): string { return id ? robots.value.find((r) => r.id === id)?.name ?? id : '—' }
function fmtTime(iso: string): string { return iso.slice(0, 19).replace('T', ' ') }
function fmtDur(sec: number): string {
  const h = Math.floor(sec / 3600); const m = Math.floor((sec % 3600) / 60)
  return h > 0 ? `${h} ч ${m} мин` : `${m} мин`
}

function goBack(): void { router.push({ name: 'incidents' }) }
</script>

<template>
  <div v-if="incident" class="space-y-4">
    <Button variant="ghost" size="sm" @click="goBack"><ArrowLeft class="size-4 mr-1" /> К реестру</Button>

    <!-- Header card -->
    <Card>
      <CardContent class="p-5 space-y-3">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="space-y-2">
            <div class="flex items-center gap-2 flex-wrap">
              <h1 class="text-xl font-bold font-mono">{{ incident.incidentNumber }}</h1>
              <span class="text-xs rounded px-2 py-0.5" :class="INCIDENT_STATUS_CLASS[incident.status]">{{ INCIDENT_STATUS_RU[incident.status] }}</span>
              <span class="text-xs rounded px-2 py-0.5 bg-muted text-muted-foreground">{{ SEVERITY_RU[incident.severity] }}</span>
            </div>
            <p class="text-sm">{{ incident.description }}</p>
          </div>
          <div class="text-right text-xs text-muted-foreground space-y-0.5">
            <p class="flex items-center justify-end gap-1"><MapPin class="size-3" /> {{ siteName(incident.siteId) }} · {{ incident.zoneName }}</p>
            <p class="flex items-center justify-end gap-1"><Bot class="size-3" /> {{ robotName(incident.robotId) }}</p>
            <p v-if="incident.coordinatorName" class="flex items-center justify-end gap-1"><User class="size-3" /> {{ incident.coordinatorName }}</p>
            <p class="flex items-center justify-end gap-1"><Clock class="size-3" /> {{ fmtTime(incident.detectedAt) }}</p>
          </div>
        </div>
      </CardContent>
    </Card>

    <Tabs default-value="summary">
      <TabsList>
        <TabsTrigger value="summary">Сводка</TabsTrigger>
        <TabsTrigger value="events">События ({{ incidentEvents.length }})</TabsTrigger>
        <TabsTrigger value="downtime">Простой и экономика</TabsTrigger>
        <TabsTrigger value="cause">Причины</TabsTrigger>
        <TabsTrigger value="actions">Действия ({{ incidentActions.length }})</TabsTrigger>
        <TabsTrigger value="history">История</TabsTrigger>
      </TabsList>

      <!-- Сводка -->
      <TabsContent value="summary" class="tabs-content-spacing">
        <Card><CardContent class="p-4 space-y-3 text-sm">
          <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div><span class="text-muted-foreground">Тип:</span> {{ incidentTypeLabel(incident.incidentTypeCode) }}</div>
            <div><span class="text-muted-foreground">Источник:</span> {{ incident.sourceKind === 'AUTOMATIC' ? 'автоматически из событий' : 'ручной ввод' }}</div>
            <div><span class="text-muted-foreground">Причина:</span> {{ causeLabel(incident.causeCode) }}</div>
            <div><span class="text-muted-foreground">Статус причины:</span> {{ CAUSE_MATURITY_RU[incident.causeMaturity] ?? '—' }}</div>
            <div><span class="text-muted-foreground">Координатор:</span> {{ incident.coordinatorName ?? 'не назначен' }}</div>
            <div><span class="text-muted-foreground">Восстановление:</span> {{ incident.recoveryConfirmed ? 'подтверждено' : 'не подтверждено' }}</div>
            <div v-if="incident.downtimeSeconds > 0"><span class="text-muted-foreground">Простой:</span> {{ fmtDur(incident.downtimeSeconds) }}</div>
            <div v-if="incident.lossRubles > 0"><span class="text-muted-foreground">Потери:</span> {{ incident.lossRubles.toLocaleString('ru-RU') }} ₽</div>
            <div v-if="incident.closedAt"><span class="text-muted-foreground">Закрыт:</span> {{ fmtTime(incident.closedAt) }}</div>
          </div>
          <div v-if="incident.causeCode && CAUSE_CATALOG[incident.causeCode]" class="border-t pt-3">
            <p class="text-muted-foreground text-xs mb-1">Что произошло:</p>
            <p class="text-sm">{{ CAUSE_CATALOG[incident.causeCode].detail }}</p>
          </div>
        </CardContent></Card>
      </TabsContent>

      <!-- События -->
      <TabsContent value="events" class="tabs-content-spacing">
        <Card><CardContent class="p-4">
          <div v-if="incidentEvents.length === 0" class="text-sm text-muted-foreground">Нет связанных событий</div>
          <div v-else class="space-y-3">
            <div v-for="evt in incidentEvents" :key="evt.id" class="border border-border rounded-lg overflow-hidden">
              <div class="bg-muted/40 px-4 py-2 border-b border-border flex justify-between items-center">
                <span class="font-mono text-xs font-semibold">{{ evt.rawCode }}</span>
                <span class="text-xs text-muted-foreground">{{ sourceInstanceLabel(evt.source, evt.siteId) }} · {{ fmtTime(evt.timestamp) }}</span>
              </div>
              <div class="p-3 text-xs text-muted-foreground leading-relaxed">{{ evt.rawMessage }}</div>
            </div>
          </div>
        </CardContent></Card>
      </TabsContent>

      <!-- Простой -->
      <TabsContent value="downtime" class="tabs-content-spacing">
        <Card><CardContent class="p-4 space-y-3 text-sm">
          <div v-if="!incidentDowntime">Простой не зафиксирован.</div>
          <div v-else class="space-y-4">
            <div class="flex items-center gap-2">
              <span class="text-xs rounded px-2 py-1" :class="incidentDowntime.confirmationStatus === 'CONFIRMED' ? 'bg-success/15 text-success' : incidentDowntime.confirmationStatus === 'PROPOSED' ? 'bg-warning/15 text-warning' : 'bg-destructive/15 text-destructive'">
                Период простоя: {{ DOWNTIME_STATUS_RU[incidentDowntime.confirmationStatus] }}
              </span>
              <span v-if="incidentDowntime.intervalState === 'OPEN'" class="text-xs rounded px-2 py-1 bg-muted text-muted-foreground">Начало подтверждено, окончание не подтверждено</span>
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div><span class="text-muted-foreground">Начало:</span> {{ fmtTime(incidentDowntime.startedAt) }}</div>
              <div><span class="text-muted-foreground">Окончание:</span> {{ incidentDowntime.endedAt ? fmtTime(incidentDowntime.endedAt) : 'не подтверждено' }}</div>
              <div><span class="text-muted-foreground">Длительность:</span> {{ fmtDur(incidentDowntime.accountableDurationSeconds) }}</div>
              <div><span class="text-muted-foreground">Правило:</span> {{ incidentDowntime.ruleName }}</div>
              <div><span class="text-muted-foreground">Ставка:</span> {{ incidentDowntime.ratePerHour.toLocaleString('ru-RU') }} ₽/ч</div>
              <div v-if="incidentDowntime.confirmationStatus === 'REJECTED'" class="text-muted-foreground">Простой отклонён: процесс компенсирован</div>
            </div>
            <div v-if="incidentDowntime.lossRubles > 0" class="border-t pt-3">
              <p class="text-lg font-bold tabular-nums">{{ incidentDowntime.lossRubles.toLocaleString('ru-RU') }} ₽</p>
              <p class="text-xs text-muted-foreground">= {{ (incidentDowntime.accountableDurationSeconds / 3600).toFixed(2) }} ч × {{ incidentDowntime.ratePerHour.toLocaleString('ru-RU') }} ₽/ч</p>
            </div>
          </div>
        </CardContent></Card>
      </TabsContent>

      <!-- Причины -->
      <TabsContent value="cause" class="tabs-content-spacing">
        <Card><CardContent class="p-4 space-y-4 text-sm">
          <div v-if="!incidentCause || incidentCause.currentMaturity === 'NONE'" class="text-muted-foreground">Причина не определена. Диагностика не завершена.</div>
          <div v-else class="space-y-4">
            <div v-for="v in incidentCause.versions" :key="v.sequence" class="border-l-2 pl-4 py-1" :class="v.maturity === 'FINAL' ? 'border-success' : v.maturity === 'REFINED' ? 'border-primary' : 'border-warning'">
              <div class="flex justify-between items-start">
                <div>
                  <p class="font-medium">{{ v.causeName }}</p>
                  <p class="text-xs text-muted-foreground mt-0.5">{{ v.sequence === 1 ? 'Предварительная' : v.sequence === 2 ? 'Уточнённая' : 'Подтверждённая' }} · {{ RESPONSIBILITY_ZONE_RU[v.responsibilityZone] ?? v.responsibilityZone }}</p>
                </div>
                <span class="text-xs text-muted-foreground">{{ v.classifiedBy }} · {{ fmtTime(v.classifiedAt) }}</span>
              </div>
              <p v-if="v.comment" class="text-xs mt-2 text-muted-foreground bg-muted/30 rounded p-2">{{ v.comment }}</p>
              <div v-if="v.evidence.length > 0" class="flex flex-wrap gap-1 mt-2">
                <span v-for="e in v.evidence" :key="e" class="text-xs rounded bg-muted px-1.5 py-0.5 text-muted-foreground">{{ e }}</span>
              </div>
            </div>
          </div>
        </CardContent></Card>
      </TabsContent>

      <!-- Действия -->
      <TabsContent value="actions" class="tabs-content-spacing">
        <Card><CardContent class="p-4 space-y-3 text-sm">
          <div v-if="incidentActions.length === 0">Действий нет.</div>
          <div v-else class="space-y-3">
            <div v-for="action in incidentActions" :key="action.id" class="border border-border rounded-lg p-3">
              <div class="flex justify-between mb-1 items-start">
                <span class="font-medium">{{ action.actionTypeName }}</span>
                <div class="flex gap-1.5">
                  <span v-if="action.result" class="text-xs rounded px-1.5 py-0.5 bg-success/15 text-success">{{ ACTION_RESULT_RU[action.result] ?? action.result }}</span>
                  <span v-else class="text-xs rounded px-1.5 py-0.5 bg-primary/15 text-primary">{{ ACTION_STATUS_RU[action.status] ?? action.status }}</span>
                </div>
              </div>
              <p class="text-xs text-muted-foreground">{{ action.comment ?? action.description }}</p>
              <p class="text-xs text-muted-foreground mt-1">Исполнитель: {{ action.executorName ?? 'не назначен' }}</p>
            </div>
            <div v-if="incidentRecovery" class="border-t pt-3">
              <p class="text-sm font-medium text-success">Восстановление подтверждено</p>
              <p class="text-xs text-muted-foreground">{{ fmtTime(incidentRecovery.recoveredAt) }} · {{ incidentRecovery.confirmedBy }}</p>
            </div>
          </div>
        </CardContent></Card>
      </TabsContent>

      <!-- История (единая) -->
      <TabsContent value="history" class="tabs-content-spacing">
        <Card><CardContent class="p-4">
          <div class="space-y-3">
            <div v-for="entry in incidentTimeline" :key="entry.id" class="flex gap-3">
              <div class="w-2 h-2 rounded-full mt-1.5 shrink-0" :class="entry.isAutomatic ? 'bg-primary' : 'bg-success'" />
              <div class="flex-1 min-w-0">
                <p class="text-sm">{{ entry.summary }}</p>
                <p class="text-xs text-muted-foreground">
                  {{ fmtTime(entry.timestamp) }} · {{ entry.actorName }}<span v-if="entry.isAutomatic"> (авто)</span>
                </p>
              </div>
            </div>
          </div>
        </CardContent></Card>
      </TabsContent>
    </Tabs>
  </div>
  <div v-else class="text-center py-8 text-muted-foreground">Инцидент не найден</div>
</template>
