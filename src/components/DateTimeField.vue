<script setup lang="ts">
import { CalendarDate } from '@internationalized/date'
import { CalendarIcon } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

/**
 * Поле «дата + время» с календарём: дата выбирается в календаре shadcn-vue
 * (ручной ввод даты запрещён), время — инпут с маской HH:MM (clamping
 * 00:00–23:59). Модель — ISO-строка или null.
 */
const props = defineProps<{
  id: string
  modelValue: string | null
  placeholder?: string
  ariaLabel?: string
  /** Разрешить очистку значения. */
  clearable?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string | null]
}>()

const popoverOpen = ref(false)

const parsed = computed<Date | null>(() => {
  if (!props.modelValue) return null
  const d = new Date(props.modelValue)
  return Number.isNaN(d.getTime()) ? null : d
})

const formatted = computed<string | null>(() => {
  const d = parsed.value
  if (!d) return null
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
})

const calendarValue = computed(() => {
  const d = parsed.value
  if (!d) return undefined
  return new CalendarDate(d.getFullYear(), d.getMonth() + 1, d.getDate())
})

const timeValue = computed<string>(() => {
  const d = parsed.value
  if (!d) return '00:00'
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
})

function emitLocal(year: number, month: number, day: number, hh: number, mm: number): void {
  const d = new Date(year, month - 1, day, hh, mm, 0, 0)
  emit('update:modelValue', d.toISOString())
}

function onDateSelect(value: unknown): void {
  if (value instanceof CalendarDate) {
    const current = parsed.value
    const hh = current ? current.getHours() : 0
    const mm = current ? current.getMinutes() : 0
    emitLocal(value.year, value.month, value.day, hh, mm)
  }
  popoverOpen.value = false
}

function onTimeChange(event: Event): void {
  const raw = (event.target as HTMLInputElement).value
  const match = /^(\d{1,2}):(\d{1,2})$/.exec(raw)
  if (!match) return
  const hh = Math.min(23, Number(match[1]))
  const mm = Math.min(59, Number(match[2]))
  const d = parsed.value ?? new Date()
  emitLocal(d.getFullYear(), d.getMonth() + 1, d.getDate(), hh, mm)
}

function clearValue(): void {
  emit('update:modelValue', null)
}
</script>

<template>
  <div class="flex gap-2">
    <Popover v-model:open="popoverOpen">
      <PopoverTrigger as-child>
        <Button
          :id="id"
          variant="outline"
          class="min-h-11 flex-1 justify-start font-normal"
          :aria-label="ariaLabel"
        >
          <CalendarIcon class="size-4 shrink-0 opacity-70" />
          <span v-if="formatted" class="tabular-nums">{{ formatted }}</span>
          <span v-else class="text-muted-foreground">{{ placeholder ?? 'Выберите дату' }}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent class="w-auto p-0" align="start">
        <Calendar :model-value="calendarValue" locale="ru" @update:model-value="onDateSelect" />
      </PopoverContent>
    </Popover>
    <Input
      :id="`${id}-time`"
      type="time"
      class="min-h-11 w-[7.5rem] tabular-nums"
      :value="timeValue"
      :disabled="parsed === null"
      :aria-label="`${ariaLabel ?? 'Время'} (время)`"
      @change="onTimeChange"
    />
    <Button
      v-if="clearable !== false && formatted !== null"
      variant="ghost"
      class="min-h-11 px-2"
      aria-label="Очистить"
      @click="clearValue"
    >
      <span class="text-xs text-muted-foreground">Очистить</span>
    </Button>
  </div>
</template>
