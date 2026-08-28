<script setup lang="ts">
import { ref, computed } from 'vue'
import { useDemoData } from '@/composables/useDemoData'
import { useTenantScope } from '@/composables/useTenantScope'
import { useAuthStore } from '@/stores/auth'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Plus,
  Radio,
  Cpu,
  ArrowRight,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Info,
  ArrowDown,
} from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { incidentTypeLabel } from '@/data/generator'
import { EVENT_STATUS_RU, EVENT_STATUS_CLASS, sourceInstanceLabel } from '@/data/labels'
import type { OperationalEvent } from '@/types/domain'

const { events, sites, robots, incidents } = useDemoData()

/** Канонический номер инцидента (ACC-008): внутренний ключ не показывается. */
function incidentNumberOf(incidentId: string): string {
  return incidents.value.find((i) => i.id === incidentId)?.incidentNumber ?? incidentId
}
const auth = useAuthStore()

const filterStatus = ref<string>('all')
const filterSource = ref<string>('all')
const filterNeedsReview = ref(false)
const selectedEvent = ref<OperationalEvent | null>(null)
const showRegister = ref(false)

const regSiteId = ref('')
const regZone = ref('')
const regRobotId = ref('__none__')
const regType = ref('')
const regDescription = ref('')

// Tenant-модель (§3): события только разрешённых объектов.
const scope = useTenantScope()
const scopedEvents = scope.events(events.value)
const scopedSites = scope.sites(sites.value)

const filteredEvents = computed(() =>
  scopedEvents.value.filter((e) => {
    if (filterStatus.value !== 'all' && e.processingStatus !== filterStatus.value) return false
    if (filterSource.value !== 'all' && e.source !== filterSource.value) return false
    if (filterNeedsReview.value && e.processingStatus !== 'NEEDS_CLASSIFICATION') return false
    return true
  }),
)

function statusIcon(status: string) {
  if (['INCIDENT_CREATED', 'LINKED_TO_INCIDENT'].includes(status)) return CheckCircle2
  if (['DUPLICATE_REJECTED', 'ERROR'].includes(status)) return XCircle
  if (status === 'NEEDS_CLASSIFICATION') return AlertCircle
  return Info
}

function statusColor(status: string): string {
  if (['INCIDENT_CREATED', 'LINKED_TO_INCIDENT'].includes(status)) return 'text-success'
  if (['DUPLICATE_REJECTED', 'ERROR'].includes(status)) return 'text-destructive'
  if (status === 'NEEDS_CLASSIFICATION') return 'text-warning'
  return 'text-muted-foreground'
}

function robotLabel(id: string | null): string {
  return id ? (robots.value.find((r) => r.id === id)?.name ?? id) : '—'
}

function payloadSeverity(e: OperationalEvent): string {
  return String((e.rawPayload as Record<string, unknown>).severity ?? 'INFO')
}

function submitRegister(): void {
  toast.success('Событие зарегистрировано', {
    description: `${regType.value}: ${regDescription.value.slice(0, 60)}`,
  })
  showRegister.value = false
  regSiteId.value = ''
  regZone.value = ''
  regRobotId.value = '__none__'
  regType.value = ''
  regDescription.value = ''
}
</script>

<template>
  <div class="space-y-4">
    <!-- Filters -->
    <div class="flex flex-wrap items-end gap-3">
      <div class="space-y-1">
        <span class="text-xs text-muted-foreground block">Источник</span>
        <Select v-model="filterSource" aria-label="Фильтр источника">
          <SelectTrigger class="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все</SelectItem>
            <SelectItem value="RMS">Система управления роботами</SelectItem>
            <SelectItem value="WMS">WMS</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div class="space-y-1">
        <span class="text-xs text-muted-foreground block">Статус обработки</span>
        <Select v-model="filterStatus" aria-label="Фильтр статуса">
          <SelectTrigger class="w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все</SelectItem>
            <SelectItem v-for="(ru, code) in EVENT_STATUS_RU" :key="code" :value="code">{{
              ru
            }}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <label class="flex items-center gap-2 text-sm text-muted-foreground mb-2 cursor-pointer">
        <input
          v-model="filterNeedsReview"
          type="checkbox"
          aria-label="Только требующие разбора"
          class="accent-primary"
        />
        Только требующие разбора
      </label>
      <Button v-if="auth.can('events.create')" class="ml-auto" @click="showRegister = true">
        <Plus class="size-4 mr-1" /> Зарегистрировать событие
      </Button>
    </div>

    <!-- Events table -->
    <Card>
      <CardContent class="p-0">
        <Table class="lg:max-2xl:table-fixed lg:max-2xl:[&_td]:px-2 lg:max-2xl:[&_th]:px-2">
          <TableHeader>
            <TableRow>
              <TableHead class="py-3 px-4 lg:max-2xl:w-20">Время</TableHead>
              <TableHead class="py-3 px-4 lg:max-2xl:hidden">Источник</TableHead>
              <TableHead class="py-3 px-4 lg:max-2xl:w-20">Робот</TableHead>
              <TableHead class="py-3 px-4 lg:max-2xl:w-[34%] lg:max-2xl:whitespace-normal"
                >Сигнал</TableHead
              >
              <TableHead class="py-3 px-4 lg:max-2xl:hidden">Что наблюдалось</TableHead>
              <TableHead class="py-3 px-4 lg:max-2xl:w-28 lg:max-2xl:whitespace-normal"
                >Статус</TableHead
              >
              <TableHead class="py-3 px-4 lg:max-2xl:w-28">Инцидент</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow
              v-for="event in filteredEvents.slice(0, 80)"
              :key="event.id"
              class="row-interactive cursor-pointer"
              @click="selectedEvent = event"
            >
              <TableCell class="text-xs font-mono tabular-nums py-3 px-4"
                >{{ event.timestamp.slice(11, 19)
                }}<span class="text-muted-foreground block">{{
                  event.timestamp.slice(0, 10)
                }}</span></TableCell
              >
              <TableCell class="text-xs py-3 px-4 lg:max-2xl:hidden">{{
                sourceInstanceLabel(event.source, event.siteId)
              }}</TableCell>
              <TableCell class="text-xs py-3 px-4">{{ robotLabel(event.robotId) }}</TableCell>
              <TableCell
                class="py-3 px-4 lg:max-2xl:max-w-none"
                :title="`${event.humanInterpretation} · ${event.rawCode}`"
              >
                <p class="text-xs truncate">{{ event.humanInterpretation }}</p>
                <p class="mt-0.5 text-[11px] font-mono text-muted-foreground truncate">
                  {{ event.rawCode }}
                </p>
              </TableCell>
              <TableCell
                class="text-xs max-w-xs truncate py-3 px-4 lg:max-2xl:hidden"
                :title="event.normalizedType"
                >{{ event.normalizedType }}</TableCell
              >
              <TableCell class="py-3 px-4">
                <span
                  class="text-xs rounded px-2 py-1 inline-flex items-center gap-1"
                  :class="EVENT_STATUS_CLASS[event.processingStatus]"
                >
                  {{ EVENT_STATUS_RU[event.processingStatus] }}
                </span>
              </TableCell>
              <TableCell class="text-xs py-3 px-4">
                <RouterLink
                  v-if="event.incidentId"
                  :to="{ name: 'incident-details', params: { incidentId: event.incidentId } }"
                  class="text-primary hover:underline font-mono"
                  @click.stop
                  >{{ incidentNumberOf(event.incidentId) }}</RouterLink
                >
                <span v-else class="text-muted-foreground">—</span>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>

    <!-- Event detail: вертикальная цепочка обработки -->
    <Dialog :open="!!selectedEvent" @update:open="(v) => !v && (selectedEvent = null)">
      <DialogContent class="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader class="pb-4 border-b border-border">
          <DialogTitle class="flex items-center gap-2 text-lg">
            <component
              :is="statusIcon(selectedEvent?.processingStatus ?? 'INFO')"
              class="size-5"
              :class="statusColor(selectedEvent?.processingStatus ?? '')"
            />
            {{ selectedEvent?.humanInterpretation }}
          </DialogTitle>
          <DialogDescription>
            Технический код: {{ selectedEvent?.rawCode }} ·
            {{ EVENT_STATUS_RU[selectedEvent?.processingStatus ?? ''] }}
          </DialogDescription>
        </DialogHeader>

        <div v-if="selectedEvent" class="space-y-5">
          <!-- Метаданные -->
          <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <p class="text-xs text-muted-foreground mb-0.5">Время</p>
              <p class="font-mono text-xs tabular-nums">
                {{ selectedEvent.timestamp.slice(0, 19).replace('T', ' ') }}
              </p>
            </div>
            <div>
              <p class="text-xs text-muted-foreground mb-0.5">Источник</p>
              <p class="text-xs flex items-center gap-1">
                <Radio class="size-3" />
                {{ sourceInstanceLabel(selectedEvent.source, selectedEvent.siteId) }}
              </p>
            </div>
            <div>
              <p class="text-xs text-muted-foreground mb-0.5">Робот</p>
              <p class="text-xs flex items-center gap-1">
                <Cpu class="size-3" /> {{ robotLabel(selectedEvent.robotId) }}
              </p>
            </div>
            <div>
              <p class="text-xs text-muted-foreground mb-0.5">Правило</p>
              <p class="text-xs font-mono">{{ selectedEvent.ruleApplied ?? '—' }}</p>
            </div>
          </div>

          <!-- Цепочка обработки: исходный сигнал → нормализация → решение -->
          <div class="space-y-3">
            <!-- Шаг 1: исходный сигнал -->
            <div class="rounded-xl border border-border overflow-hidden">
              <div class="bg-muted/40 px-4 py-2.5 border-b border-border flex items-center gap-2">
                <span
                  class="flex size-5 items-center justify-center rounded-full bg-muted text-xs font-bold"
                  >1</span
                >
                <p class="text-xs font-semibold">Исходный сигнал от источника</p>
              </div>
              <div class="p-4 space-y-3">
                <div class="flex gap-2 text-xs">
                  <span
                    class="rounded bg-destructive/10 text-destructive px-1.5 py-0.5 font-medium uppercase"
                    >{{ payloadSeverity(selectedEvent) }}</span
                  >
                  <span class="font-mono font-semibold">{{ selectedEvent.rawCode }}</span>
                </div>
                <p
                  class="text-xs bg-background rounded p-2.5 leading-relaxed border border-border/50"
                >
                  {{ selectedEvent.rawMessage }}
                </p>
                <details class="text-xs">
                  <summary class="text-muted-foreground cursor-pointer hover:text-foreground">
                    Полезная нагрузка (payload)
                  </summary>
                  <pre
                    class="text-xs bg-muted/30 rounded p-2.5 mt-1.5 overflow-auto max-h-32 font-mono leading-relaxed"
                    >{{ JSON.stringify(selectedEvent.rawPayload, null, 2) }}</pre>
                </details>
              </div>
            </div>

            <div class="flex justify-center">
              <ArrowDown class="size-4 text-muted-foreground" />
            </div>

            <!-- Шаг 2: нормализация -->
            <div class="rounded-xl border border-border overflow-hidden">
              <div class="bg-muted/40 px-4 py-2.5 border-b border-border flex items-center gap-2">
                <span
                  class="flex size-5 items-center justify-center rounded-full bg-muted text-xs font-bold"
                  >2</span
                >
                <p class="text-xs font-semibold">Нормализация FleetOps</p>
              </div>
              <div class="p-4 space-y-3">
                <div>
                  <p class="text-xs text-muted-foreground mb-1">Тип наблюдения</p>
                  <p class="text-sm font-medium">{{ selectedEvent.normalizedType }}</p>
                </div>
                <div v-if="selectedEvent.incidentTypeCode">
                  <p class="text-xs text-muted-foreground mb-1">Тип инцидента</p>
                  <p class="text-sm">{{ incidentTypeLabel(selectedEvent.incidentTypeCode) }}</p>
                </div>
                <div>
                  <p class="text-xs text-muted-foreground mb-1">Достоверность классификации</p>
                  <div class="flex items-center gap-2">
                    <div class="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        class="h-full"
                        :class="
                          selectedEvent.confidence > 0.8
                            ? 'bg-success'
                            : selectedEvent.confidence > 0.5
                              ? 'bg-warning'
                              : 'bg-destructive'
                        "
                        :style="{ width: selectedEvent.confidence * 100 + '%' }"
                      />
                    </div>
                    <span class="text-xs tabular-nums"
                      >{{ (selectedEvent.confidence * 100).toFixed(0) }}%</span
                    >
                  </div>
                </div>
              </div>
            </div>

            <div class="flex justify-center">
              <ArrowDown class="size-4 text-muted-foreground" />
            </div>

            <!-- Шаг 3: решение -->
            <div
              class="rounded-xl border overflow-hidden"
              :class="selectedEvent.incidentId ? 'border-success/30' : 'border-border'"
            >
              <div
                class="px-4 py-2.5 border-b flex items-center gap-2"
                :class="
                  selectedEvent.incidentId
                    ? 'bg-success/10 border-success/20'
                    : 'bg-muted/40 border-border'
                "
              >
                <span
                  class="flex size-5 items-center justify-center rounded-full text-xs font-bold"
                  :class="selectedEvent.incidentId ? 'bg-success/20 text-success' : 'bg-muted'"
                  >3</span
                >
                <p class="text-xs font-semibold">Решение обработки</p>
              </div>
              <div class="p-4 space-y-2">
                <div class="flex items-center gap-2">
                  <component
                    :is="statusIcon(selectedEvent.processingStatus)"
                    class="size-4"
                    :class="statusColor(selectedEvent.processingStatus)"
                  />
                  <p class="text-sm font-medium">
                    {{ EVENT_STATUS_RU[selectedEvent.processingStatus] }}
                  </p>
                </div>
                <p v-if="selectedEvent.isDuplicate" class="text-xs text-muted-foreground">
                  Отмечен как дубликат другого события
                </p>
                <p v-if="selectedEvent.ruleApplied" class="text-xs text-muted-foreground font-mono">
                  Правило: {{ selectedEvent.ruleApplied }}
                </p>
              </div>
            </div>
          </div>

          <!-- CTA -->
          <div
            v-if="selectedEvent.incidentId"
            class="card-interactive flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 p-3"
          >
            <div>
              <p class="text-sm font-medium">Связанный инцидент</p>
              <p class="text-xs text-muted-foreground">
                {{ incidentTypeLabel(selectedEvent.incidentTypeCode ?? '') }}
              </p>
            </div>
            <RouterLink
              :to="{ name: 'incident-details', params: { incidentId: selectedEvent.incidentId } }"
              class="flex items-center gap-1 text-sm text-primary hover:underline"
            >
              Открыть карточку <ArrowRight class="size-4" />
            </RouterLink>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <!-- Manual registration -->
    <Dialog v-model:open="showRegister">
      <DialogContent class="max-w-lg">
        <DialogHeader class="pb-4 border-b border-border">
          <DialogTitle>Регистрация события</DialogTitle>
          <DialogDescription>Ручная регистрация эксплуатационного события</DialogDescription>
        </DialogHeader>
        <div class="space-y-4 pt-2">
          <div class="space-y-1.5">
            <Label>Объект эксплуатации</Label>
            <Select v-model="regSiteId" aria-label="Выбор объекта">
              <SelectTrigger class="w-full min-h-11"
                ><SelectValue placeholder="Выберите объект"
              /></SelectTrigger>
              <SelectContent>
                <SelectItem v-for="s in scopedSites" :key="s.id" :value="s.id">{{
                  s.name
                }}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div class="space-y-1.5">
              <Label for="reg-zone">Зона</Label>
              <Input id="reg-zone" v-model="regZone" placeholder="A-1" class="min-h-11" />
            </div>
            <div class="space-y-1.5">
              <Label>Робот</Label>
              <Select v-model="regRobotId" aria-label="Выбор робота">
                <SelectTrigger class="w-full min-h-11"
                  ><SelectValue placeholder="Неизвестен"
                /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Неизвестен</SelectItem>
                  <SelectItem
                    v-for="r in robots.filter((r) => !regSiteId || r.siteId === regSiteId)"
                    :key="r.id"
                    :value="r.id"
                    >{{ r.name }}</SelectItem
                  >
                </SelectContent>
              </Select>
            </div>
          </div>
          <div class="space-y-1.5">
            <Label for="reg-type">Тип события</Label>
            <Input
              id="reg-type"
              v-model="regType"
              placeholder="NAVIGATION_LOST, COMM_LOST..."
              class="min-h-11"
            />
          </div>
          <div class="space-y-1.5">
            <Label for="reg-desc">Описание</Label>
            <Textarea
              id="reg-desc"
              v-model="regDescription"
              rows="3"
              class="min-h-11"
              placeholder="Что произошло"
            />
          </div>
        </div>
        <DialogFooter class="pt-4 border-t border-border mt-4">
          <Button variant="outline" class="min-h-11" @click="showRegister = false">Отмена</Button>
          <Button class="min-h-11" @click="submitRegister">Зарегистрировать</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
