<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import { useDemoData } from '@/composables/useDemoData'
import { useAuthStore } from '@/stores/auth'
import { computed, ref } from 'vue'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, Bot, MapPin, User, Clock, ChevronRight } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import DateTimeField from '@/components/DateTimeField.vue'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { incidentTypeLabel, causeLabel, CAUSE_CATALOG } from '@/data/generator'
import {
  INCIDENT_STATUS_RU,
  INCIDENT_STATUS_CLASS,
  SEVERITY_RU,
  CAUSE_MATURITY_RU,
  DOWNTIME_STATUS_RU,
  DOWNTIME_STATUS_CLASS,
  DOWNTIME_KIND_RU,
  COMPENSATION_RU,
  TIMELINE_EVENT_RU,
  ACTION_STATUS_RU,
  ACTION_RESULT_RU,
  RESPONSIBILITY_ZONE_RU,
  sourceInstanceLabel,
} from '@/data/labels'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const {
  incidents,
  events,
  downtimes,
  serviceActions,
  recoveryConfirmations,
  timeline,
  causeClassifications,
  sites,
  robots,
  substitutions,
  assignCoordinator,
  assignSubstitution,
  engageBackup,
  returnRobotToPark,
  returnGate,
  incidentProcessState,
  availableBackups,
  addObservation,
  classifyCause,
  createServiceAction,
  completeAction,
  confirmRecovery,
  decideDowntime,
  closeIncident,
  reopenIncident,
  readyToClose,
  nextStep,
  incidentClock,
} = useDemoData()

const incidentId = computed(() => String(route.params.incidentId ?? ''))
const incident = computed(() => incidents.value.find((i) => i.id === incidentId.value))
const incidentEvents = computed(() => events.value.filter((e) => e.incidentId === incidentId.value))
const incidentDowntime = computed(() =>
  downtimes.value.find((d) => d.incidentId === incidentId.value),
)
const incidentActions = computed(() =>
  serviceActions.value.filter((a) => a.incidentId === incidentId.value),
)
const activeIncidentAction = computed(() =>
  incidentActions.value.find(
    (action) => action.status === 'CREATED' || action.status === 'IN_PROGRESS',
  ),
)
const incidentRecovery = computed(() =>
  recoveryConfirmations.value.find((r) => r.incidentId === incidentId.value),
)
const incidentTimeline = computed(() =>
  timeline.value
    .filter((t) => t.incidentId === incidentId.value)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
)
const incidentCause = computed(() =>
  causeClassifications.value.find((c) => c.incidentId === incidentId.value),
)

const step = computed(() => (incident.value ? nextStep(incident.value.id) : null))
const canClose = computed(() => (incident.value ? readyToClose(incident.value.id) : false))
const actorName = computed(() => auth.user?.name ?? 'Демо-пользователь')

// ─── Замещение и две контрольные точки (ТЗ v2.0 §5.3/§8.4) ────────────────

const substitution = computed(() =>
  substitutions.value.find((s) => s.incidentId === incidentId.value),
)
const impactInterval = computed(() =>
  downtimes.value.find(
    (d) => d.incidentId === incidentId.value && d.intervalType === 'OPERATIONAL_IMPACT',
  ),
)
const techInterval = computed(() =>
  downtimes.value.find(
    (d) => d.incidentId === incidentId.value && d.intervalType === 'TECHNICAL_UNAVAILABLE',
  ),
)
const processState = computed(() =>
  incident.value
    ? {
        ...incidentProcessState(incident.value.id),
        technicallyOpen: techInterval.value?.intervalState === 'OPEN',
      }
    : { processRestored: false, robotReturned: true, label: '—', technicallyOpen: false },
)
const canSubstitute = computed(
  () =>
    !!incident.value &&
    processState.value.technicallyOpen &&
    !substitution.value &&
    !!incident.value.robotId,
)
const availableBackupsList = computed(() =>
  incident.value ? availableBackups(incident.value.siteId) : [],
)

const showSubstitution = ref(false)
const subBackupId = ref('')
const subError = ref<string | null>(null)
/** Ошибка последнего действия (permission-гард/гейт стора — ACC-001/006). */
const actionError = ref<string | null>(null)

function submitSubstitution(): void {
  if (!incident.value || !subBackupId.value) return
  const res = assignSubstitution(incident.value.id, subBackupId.value, actorName.value)
  if (!res.ok) {
    subError.value = res.reason ?? 'Не удалось назначить резерв'
    return
  }
  subError.value = null
  subBackupId.value = ''
  showSubstitution.value = false
}

function submitEngage(): void {
  if (!incident.value) return
  const res = engageBackup(incident.value.id, actorName.value)
  actionError.value = res.ok ? null : (res.reason ?? null)
}

/** Гейт возврата (ACC-001): незавершённые шаги для подсказки в UI. */
const returnCheck = computed(() =>
  incident.value ? returnGate(incident.value.id) : { ok: false, unmet: [] as string[] },
)

type RecoveryRailStep = {
  label: string
  completed: boolean
  detail: string
}

const recoveryRail = computed<RecoveryRailStep[]>(() => [
  {
    label: 'Безопасность',
    completed: Boolean(incident.value?.safetyConfirmedAt),
    detail: incident.value?.safetyConfirmedAt ? 'Подтверждена' : 'Ожидает координатора',
  },
  {
    label: 'Резерв / план Б',
    completed: Boolean(substitution.value?.engagedAt) || processState.value.processRestored,
    detail: substitution.value?.engagedAt ? 'Резерв введён' : 'Проверка мощности',
  },
  {
    label: 'Процесс',
    completed: processState.value.processRestored,
    detail: processState.value.processRestored ? 'Восстановлен' : 'Потери продолжаются',
  },
  {
    label: 'Сервис',
    completed:
      incidentActions.value.some(
        (action) => action.status === 'COMPLETED' && action.result === 'SUCCESS',
      ) && incident.value?.recoveryConfirmed === true,
    detail: incident.value?.recoveryConfirmed ? 'Контрольный запуск подтверждён' : 'В работе',
  },
  {
    label: 'Робот в парке',
    completed: processState.value.robotReturned,
    detail: processState.value.robotReturned ? 'Технедоступность закрыта' : 'Сервис продолжается',
  },
])

function actionVariant(kind: string): 'default' | 'outline' {
  return step.value?.kind === kind ? 'default' : 'outline'
}

function submitReturn(): void {
  if (!incident.value) return
  const res = returnRobotToPark(incident.value.id, actorName.value)
  actionError.value = res.ok ? null : (res.reason ?? null)
}

function siteName(id: string): string {
  return sites.value.find((s) => s.id === id)?.name ?? id
}
function robotName(id: string | null): string {
  return id ? (robots.value.find((r) => r.id === id)?.name ?? id) : '—'
}
function fmtTime(iso: string): string {
  return iso.slice(0, 19).replace('T', ' ')
}
function fmtDur(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  return h > 0 ? `${h} ч ${m} мин` : `${m} мин`
}

function goBack(): void {
  router.push({ name: 'incidents' })
}

// ─── Рабочий сценарий: диалоги действий (ТЗ §24) ─────────────────────────────

const showAssign = ref(false)
const showObservation = ref(false)
const showCause = ref(false)
const showAction = ref(false)
const showComplete = ref(false)
const showRecovery = ref(false)
const showDowntime = ref(false)
const showReopen = ref(false)

const obsText = ref('')
const causeCode = ref('')
const causeComment = ref('')
const causeEvidence = ref('')
const actName = ref('')
const actDesc = ref('')
const actExecutor = ref('')
const actDue = ref<string | null>(null)
const completeResult = ref<'SUCCESS' | 'PARTIAL_SUCCESS' | 'FAILURE' | 'POSTPONED'>('SUCCESS')
const completeComment = ref('')
const completeActionId = ref('')
const recoveryBasis = ref<'SUCCESSFUL_ACTION' | 'NO_ACTION_EXCEPTION'>('SUCCESSFUL_ACTION')
const recoveryComment = ref('')
const dtDecision = ref<'CONFIRM' | 'REJECT' | 'ADJUST'>('CONFIRM')
const dtAdjustMinutes = ref<number | null>(null)
const dtComment = ref('')
const reopenReason = ref('')

const closeError = ref<string | null>(null)

function openCause(maturity: 'PRIMARY' | 'REFINED' | 'FINAL'): void {
  causeMaturityTarget.value = maturity
  causeCode.value = incident.value?.causeCode ?? ''
  causeComment.value = ''
  causeEvidence.value = ''
  showCause.value = true
}
const causeMaturityTarget = ref<'PRIMARY' | 'REFINED' | 'FINAL'>('PRIMARY')

function submitCause(): void {
  if (!incident.value || !causeCode.value || !causeComment.value.trim()) return
  const res = classifyCause(
    incident.value.id,
    causeCode.value,
    causeComment.value.trim(),
    actorName.value,
    causeMaturityTarget.value,
    causeEvidence.value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  )
  if (res.ok) showCause.value = false
  else actionError.value = res.reason ?? null
}

function submitAssign(): void {
  if (!incident.value) return
  const res = assignCoordinator(incident.value.id, actorName.value)
  if (res.ok) showAssign.value = false
  else actionError.value = res.reason ?? null
}

function submitObservation(): void {
  if (!incident.value || !obsText.value.trim()) return
  const res = addObservation(incident.value.id, obsText.value.trim(), actorName.value)
  if (res.ok) {
    obsText.value = ''
    showObservation.value = false
  } else actionError.value = res.reason ?? null
}

function submitAction(): void {
  if (!incident.value || !actName.value.trim() || !actExecutor.value.trim()) return
  const res = createServiceAction({
    incidentId: incident.value.id,
    actionTypeName: actName.value.trim(),
    description: actDesc.value.trim() || actName.value.trim(),
    executor: actExecutor.value.trim(),
    dueAt: actDue.value
      ? new Date(actDue.value).toISOString()
      : new Date(Date.now() + 86400000).toISOString(),
    actorName: actorName.value,
  })
  if (res.ok) {
    actName.value = ''
    actDesc.value = ''
    actExecutor.value = ''
    actDue.value = ''
    showAction.value = false
  } else actionError.value = res.reason ?? null
}

function openComplete(actionId: string): void {
  completeActionId.value = actionId
  completeResult.value = 'SUCCESS'
  completeComment.value = 'Контрольный запуск выполнен без ошибок'
  showComplete.value = true
}

function submitComplete(): void {
  if (!completeComment.value.trim()) return
  const res = completeAction(
    completeActionId.value,
    completeResult.value,
    completeComment.value.trim(),
    actorName.value,
  )
  if (res.ok) showComplete.value = false
  else actionError.value = res.reason ?? null
}

function submitRecovery(): void {
  if (!incident.value) return
  const res = confirmRecovery(
    incident.value.id,
    recoveryBasis.value,
    recoveryComment.value.trim() || '—',
    actorName.value,
  )
  if (res.ok) {
    recoveryComment.value = ''
    showRecovery.value = false
  } else actionError.value = res.reason ?? null
}

function submitDowntime(): void {
  if (!incident.value) return
  const res = decideDowntime(incident.value.id, dtDecision.value, actorName.value, {
    adjustedSeconds:
      dtDecision.value === 'ADJUST' && dtAdjustMinutes.value
        ? dtAdjustMinutes.value * 60
        : undefined,
    comment: dtComment.value.trim() || undefined,
  })
  if (res.ok) {
    dtComment.value = ''
    dtAdjustMinutes.value = null
    showDowntime.value = false
  } else actionError.value = res.reason ?? null
}

function submitClose(): void {
  if (!incident.value) return
  const result = closeIncident(incident.value.id, actorName.value)
  if (!result.ok) {
    closeError.value = result.reason ?? 'Условия закрытия не выполнены'
    return
  }
  closeError.value = null
}

function submitReopen(): void {
  if (!incident.value || !reopenReason.value.trim()) return
  const res = reopenIncident(incident.value.id, reopenReason.value.trim(), actorName.value)
  if (res.ok) {
    reopenReason.value = ''
    showReopen.value = false
  } else actionError.value = res.reason ?? null
}

const CAUSE_OPTIONS = Object.entries(CAUSE_CATALOG)
  .filter(([code]) => code !== 'CA-014' || incident.value?.causeCode === 'CA-014')
  .map(([code, v]) => ({ code, name: `${code} · ${v.name}` }))
</script>

<template>
  <div v-if="incident" class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <!-- Хлебные крошки (ТЗ v2.0 §4): Объекты → РЦ → зона → инцидент -->
      <nav
        class="flex items-center gap-1 text-sm text-muted-foreground"
        aria-label="Хлебные крошки"
      >
        <button
          type="button"
          class="hover:text-foreground underline-offset-2"
          @click="router.push({ name: 'sites' })"
        >
          Объекты
        </button>
        <ChevronRight class="size-3.5" />
        <button
          type="button"
          class="hover:text-foreground underline-offset-2"
          @click="router.push({ name: 'site-details', params: { siteId: incident.siteId } })"
        >
          {{ siteName(incident.siteId) }}
        </button>
        <template v-if="incident.zoneName">
          <ChevronRight class="size-3.5" />
          <button
            type="button"
            class="hover:text-foreground underline-offset-2"
            @click="
              router.push({
                name: 'zone-details',
                params: { siteId: incident.siteId, zoneCode: incident.zoneName.split(' ')[0] },
              })
            "
          >
            зона {{ incident.zoneName.split(' ')[0] }}
          </button>
        </template>
        <ChevronRight class="size-3.5" />
        <span class="text-foreground font-medium font-mono">{{ incident.incidentNumber }}</span>
      </nav>
      <Button variant="ghost" size="sm" @click="goBack"
        ><ArrowLeft class="size-4 mr-1" /> К реестру</Button
      >
    </div>

    <!-- Header card -->
    <Card>
      <CardContent class="p-5 space-y-3">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="space-y-2">
            <div class="flex items-center gap-2 flex-wrap">
              <h1 class="text-xl font-bold font-mono">{{ incident.incidentNumber }}</h1>
              <span
                class="text-xs rounded px-2 py-0.5"
                :class="INCIDENT_STATUS_CLASS[incident.status]"
                >{{ INCIDENT_STATUS_RU[incident.status] }}</span
              >
              <span class="text-xs rounded px-2 py-0.5 bg-muted text-muted-foreground">{{
                SEVERITY_RU[incident.severity]
              }}</span>
            </div>
            <p class="text-sm">{{ incident.description }}</p>
          </div>
          <div class="text-right text-xs text-muted-foreground space-y-0.5">
            <p class="flex items-center justify-end gap-1">
              <MapPin class="size-3" /> {{ siteName(incident.siteId) }} · {{ incident.zoneName }}
            </p>
            <p class="flex items-center justify-end gap-1">
              <Bot class="size-3" /> {{ robotName(incident.robotId) }}
            </p>
            <p v-if="incident.coordinatorName" class="flex items-center justify-end gap-1">
              <User class="size-3" /> {{ incident.coordinatorName }}
            </p>
            <p class="flex items-center justify-end gap-1">
              <Clock class="size-3" /> {{ fmtTime(incident.detectedAt) }}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>

    <Card tone="data" density="compact" class="overflow-hidden">
      <CardContent class="p-4">
        <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p class="eyebrow">Маршрут восстановления</p>
            <p class="mt-1 text-sm text-muted-foreground">
              Потери прекращаются после восстановления процесса; техническая недоступность — только
              после возврата робота.
            </p>
          </div>
          <span class="status-pill bg-muted text-muted-foreground">
            {{ processState.label }}
          </span>
        </div>
        <ol
          class="grid gap-2 sm:grid-cols-2 xl:grid-cols-5"
          aria-label="Контрольные шаги инцидента"
        >
          <li
            v-for="(railStep, index) in recoveryRail"
            :key="railStep.label"
            class="rounded-xl border p-3"
            :class="
              railStep.completed ? 'border-success/35 bg-success/10' : 'border-border bg-muted/40'
            "
          >
            <div class="flex items-center justify-between gap-2">
              <span class="text-xs font-semibold">{{ index + 1 }} · {{ railStep.label }}</span>
              <span
                class="text-[10px] font-semibold"
                :class="railStep.completed ? 'text-success' : 'text-muted-foreground'"
              >
                {{ railStep.completed ? 'Готово' : 'Ожидает' }}
              </span>
            </div>
            <p class="mt-1 text-xs text-muted-foreground">{{ railStep.detail }}</p>
          </li>
        </ol>
      </CardContent>
    </Card>

    <!-- Панель разбора: следующее обязательное действие + доступные действия (ТЗ §24) -->
    <Card v-if="incident.status !== 'CLOSED'" tone="decision" density="compact">
      <CardContent class="p-4 space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div v-if="step" class="flex items-center gap-2 text-sm">
            <ChevronRight class="size-4 text-primary" />
            <span class="text-muted-foreground">Следующее действие:</span>
            <span class="font-medium">{{ step.label }}</span>
            <span class="text-xs text-muted-foreground">· Ответственный: {{ step.owner }}</span>
          </div>
          <div class="flex flex-wrap gap-2">
            <Button
              v-if="auth.can('incidents.assign')"
              size="sm"
              :variant="actionVariant('ASSIGN')"
              class="min-h-9"
              @click="showAssign = true"
            >
              Назначить координатора
            </Button>
            <Button
              v-if="auth.can('events.create')"
              size="sm"
              variant="outline"
              class="min-h-9"
              @click="showObservation = true"
            >
              Добавить наблюдение
            </Button>
            <Button
              v-if="
                canSubstitute && auth.can('substitutions.create') && availableBackupsList.length > 0
              "
              size="sm"
              :variant="actionVariant('SUBSTITUTE')"
              class="min-h-9"
              @click="showSubstitution = true"
            >
              Назначить резерв
            </Button>
            <Button
              v-if="substitution && !substitution.engagedAt && auth.can('substitutions.confirm')"
              size="sm"
              :variant="actionVariant('ENGAGE')"
              class="min-h-9"
              @click="submitEngage"
            >
              Подтвердить ввод резерва
            </Button>
            <Button
              v-if="processState.technicallyOpen && processState.processRestored"
              size="sm"
              :variant="actionVariant('RETURN_ROBOT')"
              class="min-h-9"
              :disabled="!returnCheck.ok"
              :title="returnCheck.ok ? '' : returnCheck.unmet.join('; ')"
              @click="submitReturn"
            >
              Вернуть робота в парк
            </Button>
            <Button
              v-if="auth.can('causes.classify')"
              size="sm"
              :variant="actionVariant('CLASSIFY')"
              class="min-h-9"
              @click="openCause('PRIMARY')"
            >
              Предварительная причина
            </Button>
            <Button
              v-if="auth.can('causes.refine') && incident.causeMaturity === 'PRIMARY'"
              size="sm"
              :variant="actionVariant('REFINE_CAUSE')"
              class="min-h-9"
              @click="openCause('REFINED')"
            >
              Уточнить причину
            </Button>
            <Button
              v-if="auth.can('causes.confirm') && incident.causeMaturity === 'REFINED'"
              size="sm"
              :variant="actionVariant('CONFIRM_CAUSE')"
              class="min-h-9"
              @click="openCause('FINAL')"
            >
              Подтвердить причину
            </Button>
            <Button
              v-if="auth.can('actions.create')"
              size="sm"
              :variant="actionVariant('CREATE_ACTION')"
              class="min-h-9"
              @click="showAction = true"
            >
              Создать действие / ТОиР
            </Button>
            <Button
              v-if="activeIncidentAction && auth.can('actions.complete')"
              size="sm"
              :variant="actionVariant('COMPLETE_ACTION')"
              class="min-h-9"
              @click="openComplete(activeIncidentAction.id)"
            >
              Зафиксировать результат
            </Button>
            <Button
              v-if="auth.can('actions.recovery.confirm') && !incident.recoveryConfirmed"
              size="sm"
              :variant="actionVariant('CONFIRM_RECOVERY')"
              class="min-h-9"
              @click="showRecovery = true"
            >
              Подтвердить восстановление
            </Button>
            <Button
              v-if="
                auth.can('downtime.confirm') &&
                incidentDowntime &&
                !['CONFIRMED', 'ADJUSTED', 'REJECTED'].includes(incidentDowntime.confirmationStatus)
              "
              size="sm"
              :variant="actionVariant('DECIDE_DOWNTIME')"
              class="min-h-9"
              @click="
                () => {
                  dtDecision = 'CONFIRM'
                  showDowntime = true
                }
              "
            >
              Решение по простою
            </Button>
            <Button
              v-if="auth.can('incidents.close')"
              size="sm"
              class="min-h-9"
              :variant="step?.kind === 'CLOSE' ? 'default' : 'outline'"
              :disabled="!canClose"
              @click="submitClose"
            >
              Закрыть инцидент
            </Button>
          </div>
        </div>
        <p v-if="actionError" class="text-xs text-destructive">
          Действие недоступно: {{ actionError }}
        </p>
        <p
          v-else-if="
            processState.technicallyOpen && processState.processRestored && !returnCheck.ok
          "
          class="text-xs text-muted-foreground"
        >
          Возврат робота в парк недоступен, пока не завершены: {{ returnCheck.unmet.join('; ') }}.
        </p>
        <p v-if="closeError" class="text-xs text-destructive">
          Закрытие невозможно: {{ closeError }}
        </p>
        <p v-else-if="!canClose && step" class="text-xs text-muted-foreground">
          Для закрытия нужны: финальная причина, подтверждённое восстановление, решение по простою и
          завершённое действие.
        </p>
      </CardContent>
    </Card>
    <Card v-else class="border-success/40">
      <CardContent class="p-4 flex flex-wrap items-center justify-between gap-3">
        <p class="text-sm">
          Инцидент закрыт {{ incident.closedAt ? fmtTime(incident.closedAt) : '' }}. Повтор
          проблемы?
        </p>
        <Button
          v-if="auth.can('incidents.update')"
          size="sm"
          variant="outline"
          class="min-h-9"
          @click="showReopen = true"
        >
          Переоткрыть
        </Button>
      </CardContent>
    </Card>

    <!-- Замещение и восстановление процесса (ТЗ v2.0 §8.4) -->
    <Card
      v-if="substitution || techInterval || impactInterval"
      :class="
        processState.processRestored && !processState.robotReturned ? 'border-warning/40' : ''
      "
    >
      <CardHeader class="pb-2"
        ><CardTitle class="text-base flex flex-wrap items-center gap-2">
          Замещение и восстановление процесса
          <span
            class="rounded px-2 py-0.5 text-xs font-medium"
            :class="
              processState.processRestored && !processState.robotReturned
                ? 'bg-warning/15 text-warning'
                : processState.robotReturned
                  ? 'bg-success/15 text-success'
                  : 'bg-destructive/15 text-destructive'
            "
          >
            {{ processState.label }}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent class="space-y-4">
        <!-- Контрольные точки -->
        <div class="grid gap-3 md:grid-cols-2">
          <div
            class="rounded-lg border p-3"
            :class="processState.processRestored ? 'border-success/40' : 'border-destructive/40'"
          >
            <p class="text-xs text-muted-foreground">Контрольная точка 1</p>
            <p class="text-sm font-medium">«Процесс восстановлен»</p>
            <p v-if="processState.processRestored" class="text-xs text-success mt-1">
              {{
                substitution?.processRestoredAt
                  ? fmtTime(substitution.processRestoredAt)
                  : 'подтверждено'
              }}
              — начисление потерь процесса прекращено
            </p>
            <p v-else class="text-xs text-destructive mt-1">
              Мощность зоны не восстановлена — потери продолжают начисляться
            </p>
          </div>
          <div
            class="rounded-lg border p-3"
            :class="processState.robotReturned ? 'border-success/40' : 'border-warning/40'"
          >
            <p class="text-xs text-muted-foreground">Контрольная точка 2</p>
            <p class="text-sm font-medium">«Робот возвращён в парк»</p>
            <p v-if="processState.robotReturned" class="text-xs text-success mt-1">
              Техническая недоступность закрыта
            </p>
            <p v-else class="text-xs text-warning mt-1">
              {{ robotName(incident.robotId) }} в сервисном контуре — техническая недоступность
              продолжается
            </p>
          </div>
        </div>

        <!-- Замещение -->
        <div v-if="substitution" class="rounded-lg border border-border p-3 text-sm space-y-1">
          <p>
            <span class="text-muted-foreground">Повреждённый:</span>
            {{ robotName(substitution.damagedRobotId) }} ·
            <span class="text-muted-foreground">Резерв:</span>
            <span class="font-medium"> {{ robotName(substitution.backupRobotId) }}</span>
          </p>
          <p class="text-xs text-muted-foreground">
            Задание: {{ substitution.originalTask }} → {{ substitution.newTask }} · Автор:
            {{ substitution.authorName }}
          </p>
          <p class="text-xs text-muted-foreground tab--nums">
            Запрос: {{ fmtTime(substitution.requestedAt) }} · Назначение:
            {{ substitution.assignedAt ? fmtTime(substitution.assignedAt) : '—' }} · Ввод:
            {{ substitution.engagedAt ? fmtTime(substitution.engagedAt) : 'ожидание' }}
          </p>
        </div>
        <p
          v-else-if="canSubstitute"
          class="text-xs text-muted-foreground rounded-lg border border-dashed border-border p-3"
        >
          Резерв не назначен. Доступно резервных на объекте:
          {{ availableBackupsList.length }} ({{
            availableBackupsList.map((r) => r.name).join(', ') || 'нет'
          }}).
        </p>

        <!-- Два интервала раздельно -->
        <div class="grid gap-3 md:grid-cols-2">
          <div v-if="impactInterval" class="rounded-lg bg-muted/50 p-3">
            <p class="text-xs text-muted-foreground">Операционное влияние</p>
            <p class="text-sm font-medium tabular-nums">
              {{
                impactInterval.accountableDurationSeconds > 0
                  ? fmtDur(impactInterval.accountableDurationSeconds)
                  : 'открыто'
              }}
              <span v-if="impactInterval.lossRubles > 0" class="text-destructive">
                · {{ impactInterval.lossRubles.toLocaleString('ru-RU') }} ₽</span
              >
            </p>
            <p class="text-xs text-muted-foreground">
              {{ fmtTime(impactInterval.startedAt) }} —
              {{ impactInterval.endedAt ? fmtTime(impactInterval.endedAt) : 'продолжается' }} ·
              {{ impactInterval.ratePerHour.toLocaleString('ru-RU') }} ₽/ч
            </p>
          </div>
          <div v-if="techInterval" class="rounded-lg bg-muted/50 p-3">
            <p class="text-xs text-muted-foreground">Техническая недоступность</p>
            <p class="text-sm font-medium tabular-nums">
              {{
                techInterval.accountableDurationSeconds > 0
                  ? fmtDur(techInterval.accountableDurationSeconds)
                  : 'продолжается'
              }}
              · без начисления потерь
            </p>
            <p class="text-xs text-muted-foreground">
              {{ fmtTime(techInterval.startedAt) }} —
              {{ techInterval.endedAt ? fmtTime(techInterval.endedAt) : 'продолжается' }}
            </p>
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
        <Card
          ><CardContent class="p-4 space-y-3 text-sm">
            <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <span class="text-muted-foreground">Тип:</span>
                {{ incidentTypeLabel(incident.incidentTypeCode) }}
              </div>
              <div>
                <span class="text-muted-foreground">Источник:</span>
                {{
                  incident.sourceKind === 'AUTOMATIC' ? 'автоматически из событий' : 'ручной ввод'
                }}
              </div>
              <div>
                <span class="text-muted-foreground">Причина:</span>
                {{ causeLabel(incident.causeCode) }}
              </div>
              <div>
                <span class="text-muted-foreground">Статус причины:</span>
                {{ CAUSE_MATURITY_RU[incident.causeMaturity] ?? '—' }}
              </div>
              <div>
                <span class="text-muted-foreground">Координатор:</span>
                {{ incident.coordinatorName ?? 'не назначен' }}
              </div>
              <div>
                <span class="text-muted-foreground">Восстановление:</span>
                {{ incident.recoveryConfirmed ? 'подтверждено' : 'не подтверждено' }}
              </div>
              <div v-if="incident.downtimeSeconds > 0">
                <span class="text-muted-foreground">Простой:</span>
                {{ fmtDur(incident.downtimeSeconds) }}
              </div>
              <div v-if="incident.lossRubles > 0">
                <span class="text-muted-foreground">Потери:</span>
                {{ incident.lossRubles.toLocaleString('ru-RU') }} ₽
              </div>
              <div v-if="incident.closedAt">
                <span class="text-muted-foreground">Закрыт:</span> {{ fmtTime(incident.closedAt) }}
              </div>
            </div>
            <div
              v-if="incident.causeCode && CAUSE_CATALOG[incident.causeCode]"
              class="border-t pt-3"
            >
              <p class="text-muted-foreground text-xs mb-1">Что произошло:</p>
              <p class="text-sm">{{ CAUSE_CATALOG[incident.causeCode].detail }}</p>
            </div>
          </CardContent></Card
        >
      </TabsContent>

      <!-- События -->
      <TabsContent value="events" class="tabs-content-spacing">
        <Card
          ><CardContent class="p-4">
            <div v-if="incidentEvents.length === 0" class="text-sm text-muted-foreground">
              Нет связанных событий
            </div>
            <div v-else class="space-y-3">
              <div
                v-for="evt in incidentEvents"
                :key="evt.id"
                class="border border-border rounded-lg overflow-hidden"
              >
                <div
                  class="bg-muted/40 px-4 py-2 border-b border-border flex justify-between items-center"
                >
                  <span class="font-mono text-xs font-semibold">{{ evt.rawCode }}</span>
                  <span class="text-xs text-muted-foreground"
                    >{{ sourceInstanceLabel(evt.source, evt.siteId) }} ·
                    {{ fmtTime(evt.timestamp) }}</span
                  >
                </div>
                <div class="p-3 space-y-1">
                  <p class="text-sm">{{ evt.humanInterpretation }}</p>
                  <p class="text-xs text-muted-foreground leading-relaxed font-mono">
                    {{ evt.rawMessage }}
                  </p>
                </div>
              </div>
            </div>
          </CardContent></Card
        >
      </TabsContent>

      <!-- Простой -->
      <TabsContent value="downtime" class="tabs-content-spacing">
        <Card
          ><CardContent class="p-4 space-y-3 text-sm">
            <div v-if="!incidentDowntime">Простой не зафиксирован.</div>
            <div v-else class="space-y-4">
              <div class="flex items-center gap-2 flex-wrap">
                <span
                  class="text-xs rounded px-2 py-1"
                  :class="DOWNTIME_STATUS_CLASS[incidentDowntime.confirmationStatus]"
                >
                  {{ DOWNTIME_STATUS_RU[incidentDowntime.confirmationStatus] }}
                </span>
                <span
                  v-if="incidentDowntime.intervalState === 'OPEN'"
                  class="text-xs rounded px-2 py-1 bg-muted text-muted-foreground"
                  >Начало подтверждено, окончание не подтверждено</span
                >
                <span class="text-xs text-muted-foreground">{{
                  DOWNTIME_KIND_RU[incidentDowntime.kind]
                }}</span>
                <span class="text-xs text-muted-foreground"
                  >· модель влияния:
                  {{ COMPENSATION_RU[incidentDowntime.impact.compensation] }}</span
                >
              </div>
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <span class="text-muted-foreground">Начало:</span>
                  {{ fmtTime(incidentDowntime.startedAt) }}
                </div>
                <div>
                  <span class="text-muted-foreground">Окончание:</span>
                  {{
                    incidentDowntime.endedAt ? fmtTime(incidentDowntime.endedAt) : 'не подтверждено'
                  }}
                </div>
                <div>
                  <span class="text-muted-foreground">Длительность:</span>
                  <template v-if="incidentDowntime.endedAt">{{
                    fmtDur(incidentDowntime.accountableDurationSeconds)
                  }}</template>
                  <template v-else
                    >идёт
                    {{
                      fmtDur(
                        Math.max(
                          0,
                          Math.round(
                            (Date.parse(incidentClock(incident.id)) -
                              Date.parse(incidentDowntime.startedAt)) /
                              1000,
                          ),
                        ),
                      )
                    }}</template
                  >
                </div>
                <div>
                  <span class="text-muted-foreground">Правило:</span>
                  {{ incidentDowntime.ruleName }}
                </div>
                <div>
                  <span class="text-muted-foreground">Ставка:</span>
                  {{ incidentDowntime.ratePerHour.toLocaleString('ru-RU') }} ₽/ч
                </div>
                <div v-if="incidentDowntime.confirmedBy">
                  <span class="text-muted-foreground">Подтвердил:</span>
                  {{ incidentDowntime.confirmedBy }}
                </div>
              </div>
              <div v-if="incidentDowntime.lossRubles > 0" class="border-t pt-3">
                <p class="text-lg font-bold tabular-nums">
                  {{ incidentDowntime.lossRubles.toLocaleString('ru-RU') }} ₽
                </p>
                <p class="text-xs text-muted-foreground">
                  = {{ (incidentDowntime.accountableDurationSeconds / 3600).toFixed(2) }} ч ×
                  {{ incidentDowntime.ratePerHour.toLocaleString('ru-RU') }} ₽/ч
                </p>
              </div>
              <div
                v-else-if="incidentDowntime.confirmationStatus === 'REJECTED'"
                class="text-muted-foreground"
              >
                0 ч, простой отклонён: процесс компенсирован
              </div>
              <div
                v-else-if="incidentDowntime.intervalState === 'OPEN'"
                class="text-xs text-muted-foreground"
              >
                Потери рассчитываются после подтверждения простоя.
              </div>
            </div>
          </CardContent></Card
        >
      </TabsContent>

      <!-- Причины -->
      <TabsContent value="cause" class="tabs-content-spacing">
        <Card
          ><CardContent class="p-4 space-y-4 text-sm">
            <div
              v-if="!incidentCause || incidentCause.currentMaturity === 'NONE'"
              class="text-muted-foreground"
            >
              Причина не определена. Диагностика не завершена.
            </div>
            <div v-else class="space-y-4">
              <div
                v-for="v in incidentCause.versions"
                :key="v.sequence"
                class="border-l-2 pl-4 py-1"
                :class="
                  v.maturity === 'FINAL'
                    ? 'border-success'
                    : v.maturity === 'REFINED'
                      ? 'border-primary'
                      : 'border-warning'
                "
              >
                <div class="flex justify-between items-start">
                  <div>
                    <p class="font-medium">{{ v.causeName }}</p>
                    <p class="text-xs text-muted-foreground mt-0.5">
                      {{ CAUSE_MATURITY_RU[v.maturity] }} ·
                      {{ RESPONSIBILITY_ZONE_RU[v.responsibilityZone] ?? v.responsibilityZone }}
                    </p>
                  </div>
                  <span class="text-xs text-muted-foreground"
                    >{{ v.classifiedBy }} · {{ fmtTime(v.classifiedAt) }}</span
                  >
                </div>
                <p
                  v-if="v.comment"
                  class="text-xs mt-2 text-muted-foreground bg-muted/30 rounded p-2"
                >
                  {{ v.comment }}
                </p>
                <div v-if="v.evidence.length > 0" class="flex flex-wrap gap-1 mt-2">
                  <span
                    v-for="e in v.evidence"
                    :key="e"
                    class="text-xs rounded bg-muted px-1.5 py-0.5 text-muted-foreground"
                    >{{ e }}</span
                  >
                </div>
              </div>
            </div>
          </CardContent></Card
        >
      </TabsContent>

      <!-- Действия -->
      <TabsContent value="actions" class="tabs-content-spacing">
        <Card
          ><CardContent class="p-4 space-y-3 text-sm">
            <div v-if="incidentActions.length === 0">Действий нет.</div>
            <div v-else class="space-y-3">
              <div
                v-for="action in incidentActions"
                :key="action.id"
                class="border border-border rounded-lg p-3"
              >
                <div class="flex justify-between mb-1 items-start">
                  <span class="font-medium">{{ action.actionTypeName }}</span>
                  <div class="flex gap-1.5 items-center">
                    <span
                      v-if="action.result"
                      class="text-xs rounded px-1.5 py-0.5 bg-success/15 text-success"
                      >{{ ACTION_RESULT_RU[action.result] ?? action.result }}</span
                    >
                    <span v-else class="text-xs rounded px-1.5 py-0.5 bg-primary/15 text-primary">{{
                      ACTION_STATUS_RU[action.status] ?? action.status
                    }}</span>
                    <Button
                      v-if="action.status === 'CREATED' || action.status === 'IN_PROGRESS'"
                      size="sm"
                      variant="ghost"
                      class="min-h-7 h-7 px-2"
                      :disabled="!auth.can('actions.complete')"
                      @click="openComplete(action.id)"
                      >Зафиксировать результат</Button
                    >
                  </div>
                </div>
                <p class="text-xs text-muted-foreground">
                  {{ action.comment ?? action.description }}
                </p>
                <p class="text-xs text-muted-foreground mt-1">
                  Исполнитель: {{ action.executorName ?? 'не назначен' }}
                </p>
              </div>
              <div v-if="incidentRecovery" class="border-t pt-3">
                <p class="text-sm font-medium text-success">Восстановление подтверждено</p>
                <p class="text-xs text-muted-foreground">
                  {{ fmtTime(incidentRecovery.recoveredAt) }} · {{ incidentRecovery.confirmedBy }}
                </p>
              </div>
            </div>
          </CardContent></Card
        >
      </TabsContent>

      <!-- История (единая) -->
      <TabsContent value="history" class="tabs-content-spacing">
        <Card
          ><CardContent class="p-4">
            <div class="space-y-3">
              <div v-for="entry in incidentTimeline" :key="entry.id" class="flex gap-3">
                <div
                  class="w-2 h-2 rounded-full mt-1.5 shrink-0"
                  :class="entry.isAutomatic ? 'bg-primary' : 'bg-success'"
                />
                <div class="flex-1 min-w-0">
                  <p class="text-sm">
                    <span class="text-xs text-muted-foreground mr-2">{{
                      TIMELINE_EVENT_RU[entry.eventType] ?? entry.eventType
                    }}</span
                    >{{ entry.summary }}
                  </p>
                  <p class="text-xs text-muted-foreground">
                    {{ fmtTime(entry.timestamp) }} · {{ entry.actorName
                    }}<span v-if="entry.isAutomatic"> (авто)</span>
                  </p>
                </div>
              </div>
            </div>
          </CardContent></Card
        >
      </TabsContent>
    </Tabs>

    <!-- Диалог: назначить резерв (ТЗ v2.0 §6 шаг 5) -->
    <Dialog :open="showSubstitution" @update:open="(v) => (showSubstitution = v)">
      <DialogContent class="max-w-md">
        <DialogHeader>
          <DialogTitle>Назначить резервного робота</DialogTitle>
          <DialogDescription>
            FleetOps фиксирует решение и состояния: повреждённый робот переходит в диагностику,
            резерв следует в зону. Управление движением остаётся за RMS/FMS.
          </DialogDescription>
        </DialogHeader>
        <div class="space-y-2">
          <Label for="sub-backup"
            >Резервный робот ({{ availableBackupsList.length }} доступно)</Label
          >
          <Select v-model="subBackupId" aria-label="Резервный робот">
            <SelectTrigger id="sub-backup"
              ><SelectValue placeholder="Выберите резерв"
            /></SelectTrigger>
            <SelectContent>
              <SelectItem v-for="r in availableBackupsList" :key="r.id" :value="r.id">
                {{ r.name }} · {{ r.model }}
              </SelectItem>
            </SelectContent>
          </Select>
          <p v-if="subError" class="text-xs text-destructive">{{ subError }}</p>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="showSubstitution = false">Отмена</Button>
          <Button :disabled="!subBackupId" @click="submitSubstitution">Назначить</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Диалог: назначить координатора -->
    <Dialog :open="showAssign" @update:open="(v) => (showAssign = v)">
      <DialogContent class="max-w-md">
        <DialogHeader>
          <DialogTitle>Назначить координатора</DialogTitle>
          <DialogDescription>
            Вы принимаете инцидент в работу от имени «{{ actorName }}» (роль:
            {{ auth.activeRoleCode ?? '—' }}).
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" class="min-h-10" @click="showAssign = false">Отмена</Button>
          <Button class="min-h-10" @click="submitAssign">Принять в работу</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Диалог: наблюдение -->
    <Dialog :open="showObservation" @update:open="(v) => (showObservation = v)">
      <DialogContent class="max-w-md">
        <DialogHeader>
          <DialogTitle>Добавить наблюдение</DialogTitle>
          <DialogDescription>
            Человеческое наблюдение или доказательство по факту — попадёт в единую историю.
          </DialogDescription>
        </DialogHeader>
        <div class="space-y-2">
          <Textarea
            v-model="obsText"
            rows="3"
            aria-label="Текст наблюдения"
            placeholder="Что установлено при осмотре / проверке"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" class="min-h-10" @click="showObservation = false"
            >Отмена</Button
          >
          <Button class="min-h-10" :disabled="!obsText.trim()" @click="submitObservation"
            >Записать</Button
          >
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Диалог: причина (primary/refined/final) -->
    <Dialog :open="showCause" @update:open="(v) => (showCause = v)">
      <DialogContent class="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {{
              causeMaturityTarget === 'PRIMARY'
                ? 'Предварительная причина'
                : causeMaturityTarget === 'REFINED'
                  ? 'Уточнить причину'
                  : 'Подтвердить финальную причину'
            }}
          </DialogTitle>
          <DialogDescription>
            Причина отвечает на вопрос «почему произошло». Комментарий — что конкретно установлено в
            этом случае (минимум 20 символов).
          </DialogDescription>
        </DialogHeader>
        <div class="space-y-3">
          <div class="space-y-1.5">
            <Label>Причина из классификатора *</Label>
            <Select v-model="causeCode" aria-label="Причина">
              <SelectTrigger class="min-h-10">
                <SelectValue placeholder="Выберите причину" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="c in CAUSE_OPTIONS" :key="c.code" :value="c.code">
                  {{ c.name }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div class="space-y-1.5">
            <Label for="cause-comment">
              Комментарий человека *
              <span class="text-xs font-normal text-muted-foreground">
                (минимум 20 символов — что конкретно установлено; осталось
                {{ Math.max(0, 20 - causeComment.trim().length) }})
              </span>
            </Label>
            <Textarea
              id="cause-comment"
              v-model="causeComment"
              rows="3"
              maxlength="500"
              aria-describedby="cause-comment-hint"
              placeholder="Например: на оптическом окне лидара обнаружен слой пыли; после очистки качество сканирования восстановилось"
            />
          </div>
          <div class="space-y-1.5">
            <Label for="cause-evidence">Доказательства (через запятую)</Label>
            <Input
              id="cause-evidence"
              v-model="causeEvidence"
              placeholder="Например: осмотр, журнал системы, фото"
            />
            <p class="text-xs text-muted-foreground">Необязательно: чем подтверждается вывод.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" class="min-h-10" @click="showCause = false">Отмена</Button>
          <Button
            class="min-h-10"
            :disabled="!causeCode || causeComment.trim().length < 20"
            :title="
              !causeCode
                ? 'Выберите причину из классификатора'
                : causeComment.trim().length < 20
                  ? 'Комментарий человека — минимум 20 символов'
                  : undefined
            "
            @click="submitCause"
            >Записать</Button
          >
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Диалог: создать действие / работу ТОиР -->
    <Dialog :open="showAction" @update:open="(v) => (showAction = v)">
      <DialogContent class="max-w-lg">
        <DialogHeader>
          <DialogTitle>Создать сервисное действие</DialogTitle>
          <DialogDescription>
            Действие появится в карточке и в реестре ТОиР как аварийная работа, связанная с
            инцидентом.
          </DialogDescription>
        </DialogHeader>
        <div class="space-y-3">
          <div class="space-y-1.5">
            <Label for="act-name">Вид работы *</Label>
            <Input
              id="act-name"
              v-model="actName"
              placeholder="Например: Диагностика правого привода"
            />
          </div>
          <div class="space-y-1.5">
            <Label for="act-desc">Описание</Label>
            <Textarea id="act-desc" v-model="actDesc" rows="2" />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div class="space-y-1.5">
              <Label for="act-exec">Исполнитель *</Label>
              <Input id="act-exec" v-model="actExecutor" placeholder="Иван Петров" />
            </div>
            <div class="space-y-1.5">
              <Label for="act-due">Срок</Label>
              <DateTimeField
                id="act-due"
                v-model="actDue"
                aria-label="Срок выполнения"
                placeholder="Не задан — по умолчанию сутки"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" class="min-h-10" @click="showAction = false">Отмена</Button>
          <Button
            class="min-h-10"
            :disabled="!actName.trim() || !actExecutor.trim()"
            @click="submitAction"
            >Создать</Button
          >
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Диалог: результат действия -->
    <Dialog :open="showComplete" @update:open="(v) => (showComplete = v)">
      <DialogContent class="max-w-md">
        <DialogHeader>
          <DialogTitle>Результат сервисного действия</DialogTitle>
          <DialogDescription>
            Контрольный запуск обязателен при успешном результате.
          </DialogDescription>
        </DialogHeader>
        <div class="space-y-3">
          <div class="space-y-1.5">
            <Label>Результат *</Label>
            <Select v-model="completeResult" aria-label="Результат">
              <SelectTrigger class="min-h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="SUCCESS">Выполнено — результат подтверждён</SelectItem>
                <SelectItem value="PARTIAL_SUCCESS">Выполнено частично</SelectItem>
                <SelectItem value="FAILURE">Без результата</SelectItem>
                <SelectItem value="POSTPONED">Отложено</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div class="space-y-1.5">
            <Label for="cmp-comment">Комментарий *</Label>
            <Textarea id="cmp-comment" v-model="completeComment" rows="2" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" class="min-h-10" @click="showComplete = false">Отмена</Button>
          <Button class="min-h-10" :disabled="!completeComment.trim()" @click="submitComplete"
            >Зафиксировать</Button
          >
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Диалог: восстановление -->
    <Dialog :open="showRecovery" @update:open="(v) => (showRecovery = v)">
      <DialogContent class="max-w-md">
        <DialogHeader>
          <DialogTitle>Подтверждение восстановления</DialogTitle>
          <DialogDescription>
            Открытый простой с влиянием на процесс закроется этим моментом (авто).
          </DialogDescription>
        </DialogHeader>
        <div class="space-y-3">
          <div class="space-y-1.5">
            <Label>Основание *</Label>
            <Select v-model="recoveryBasis" aria-label="Основание восстановления">
              <SelectTrigger class="min-h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="SUCCESSFUL_ACTION">Успешное сервисное действие</SelectItem>
                <SelectItem value="NO_ACTION_EXCEPTION">Без действия (исключение)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div class="space-y-1.5">
            <Label for="rec-comment">Комментарий</Label>
            <Textarea
              id="rec-comment"
              v-model="recoveryComment"
              rows="2"
              placeholder="Контрольный маршрут с грузом по зоне выполнен без ошибок"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" class="min-h-10" @click="showRecovery = false">Отмена</Button>
          <Button class="min-h-10" @click="submitRecovery">Подтвердить восстановление</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Диалог: решение по простою -->
    <Dialog :open="showDowntime" @update:open="(v) => (showDowntime = v)">
      <DialogContent class="max-w-md">
        <DialogHeader>
          <DialogTitle>Решение по простою с влиянием на процесс</DialogTitle>
          <DialogDescription>
            Подтверждение открытого простоя фиксирует окончание текущим моментом; корректировка
            меняет учётную длительность и пересчитывает потери.
          </DialogDescription>
        </DialogHeader>
        <div class="space-y-3">
          <div class="space-y-1.5">
            <Label>Решение *</Label>
            <Select v-model="dtDecision" aria-label="Решение по простою">
              <SelectTrigger class="min-h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="CONFIRM">Подтвердить</SelectItem>
                <SelectItem value="ADJUST">Скорректировать длительность</SelectItem>
                <SelectItem value="REJECT">Отклонить (процесс компенсирован)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div v-if="dtDecision === 'ADJUST'" class="space-y-1.5">
            <Label for="dt-min">Учётная длительность, минут *</Label>
            <Input
              id="dt-min"
              v-model.number="dtAdjustMinutes as never"
              type="number"
              min="1"
              step="1"
              inputmode="numeric"
              placeholder="например 90"
              aria-describedby="dt-min-hint"
            />
            <p id="dt-min-hint" class="text-xs text-muted-foreground">
              Целое число минут: скорректированная учётная длительность простоя.
            </p>
          </div>
          <div class="space-y-1.5">
            <Label for="dt-comment">Основание</Label>
            <Textarea
              id="dt-comment"
              v-model="dtComment"
              rows="2"
              placeholder="Например: резервный робот введён через 40 минут"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" class="min-h-10" @click="showDowntime = false">Отмена</Button>
          <Button
            class="min-h-10"
            :disabled="dtDecision === 'ADJUST' && !dtAdjustMinutes"
            @click="submitDowntime"
            >Принять решение</Button
          >
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Диалог: переоткрытие -->
    <Dialog :open="showReopen" @update:open="(v) => (showReopen = v)">
      <DialogContent class="max-w-md">
        <DialogHeader>
          <DialogTitle>Переоткрыть инцидент</DialogTitle>
          <DialogDescription>
            Повтор проблемы после закрытия — инцидент вернётся в работу, запись появится в истории.
          </DialogDescription>
        </DialogHeader>
        <div class="space-y-2">
          <Textarea
            v-model="reopenReason"
            rows="2"
            aria-label="Причина переоткрытия"
            placeholder="Причина переоткрытия"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" class="min-h-10" @click="showReopen = false">Отмена</Button>
          <Button class="min-h-10" :disabled="!reopenReason.trim()" @click="submitReopen"
            >Переоткрыть</Button
          >
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
  <div v-else class="text-center py-8 text-muted-foreground">Инцидент не найден</div>
</template>
