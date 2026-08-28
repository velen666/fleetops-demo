<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Bar, Line } from 'vue-chartjs'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
)

const props = defineProps<{
  type: 'bar' | 'bar-stacked' | 'line'
  labels: string[]
  datasets: Array<{
    label: string
    data: number[]
    color?: string
  }>
  horizontal?: boolean
  suffix?: string
  size?: 'compact' | 'default' | 'hero'
}>()

interface ChartTheme {
  revision: number
  palette: string[]
  foreground: string
  mutedForeground: string
  border: string
  popover: string
}

function cssToken(name: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  const referencedToken = value.match(/^var\((--[^,\s)]+)/)?.[1]
  return referencedToken ? cssToken(referencedToken) : value
}

function resolveColor(value: string): string {
  return value.startsWith('--') ? cssToken(value) : value
}

const themeRevision = ref(0)
let themeObserver: MutationObserver | undefined

onMounted(() => {
  themeObserver = new MutationObserver(() => {
    themeRevision.value++
  })
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'data-theme'],
  })
})

onBeforeUnmount(() => themeObserver?.disconnect())

const chartTheme = computed<ChartTheme>(() => {
  return {
    revision: themeRevision.value,
    palette: ['--chart-1', '--chart-2', '--chart-3', '--chart-4', '--chart-5'].map(cssToken),
    foreground: cssToken('--foreground'),
    mutedForeground: cssToken('--muted-foreground'),
    border: cssToken('--border'),
    popover: cssToken('--popover'),
  }
})

const chartData = computed(() => ({
  labels: props.labels,
  datasets: props.datasets.map((ds, i) => ({
    label: ds.label,
    data: ds.data,
    backgroundColor: resolveColor(
      ds.color ?? chartTheme.value.palette[i % chartTheme.value.palette.length],
    ),
    borderColor: resolveColor(
      ds.color ?? chartTheme.value.palette[i % chartTheme.value.palette.length],
    ),
    borderRadius: props.type === 'line' ? undefined : 8,
    borderSkipped: false,
    borderWidth: props.type === 'line' ? 2 : 0,
    fill: props.type === 'line',
    tension: 0.35,
    pointRadius: 2,
    pointHoverRadius: 4,
  })),
}))

const options = computed(() => {
  const suffix = props.suffix ?? ''
  // Shared tooltip label: works for bar (parsed number/object) and line charts.
  const tooltipLabel = (raw: unknown): string => {
    const ctx = raw as {
      dataset?: { label?: string }
      parsed?: number | { x?: number; y?: number }
    }
    const parsed = ctx.parsed
    const val = typeof parsed === 'number' ? parsed : (parsed?.y ?? parsed?.x ?? 0)
    return `${ctx.dataset?.label ?? ''}: ${val.toLocaleString('ru-RU')}${suffix}`
  }
  const base = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
    plugins: {
      legend: {
        display: props.datasets.length > 1,
        position: 'bottom' as const,
        labels: {
          color: chartTheme.value.mutedForeground,
          font: { size: 11, weight: 600 },
          usePointStyle: true,
          pointStyle: 'circle' as const,
        },
      },
      tooltip: {
        backgroundColor: chartTheme.value.popover,
        titleColor: chartTheme.value.foreground,
        bodyColor: chartTheme.value.mutedForeground,
        padding: 12,
        cornerRadius: 8,
        callbacks: {
          label: tooltipLabel as never,
        },
      },
    },
  }
  const scales = {
    scales: {
      x: {
        stacked: props.type === 'bar-stacked',
        ticks: {
          color: chartTheme.value.mutedForeground,
          font: { size: 12, weight: 500 },
          callback: (val: unknown) => (typeof val === 'number' ? val.toLocaleString('ru-RU') : val),
        },
        grid: { color: chartTheme.value.border },
      },
      y: {
        stacked: props.type === 'bar-stacked',
        ticks: { color: chartTheme.value.mutedForeground, font: { size: 12, weight: 500 } },
        grid: { color: chartTheme.value.border },
      },
    },
  }
  if (props.type === 'line') return { ...base, ...scales }
  return {
    ...base,
    ...scales,
    indexAxis: props.horizontal ? ('y' as const) : ('x' as const),
  }
})
</script>

<template>
  <div
    class="relative"
    :class="{
      'h-56': size === 'compact',
      'h-72 lg:h-80': !size || size === 'default',
      'h-80 lg:h-96': size === 'hero',
    }"
  >
    <Bar v-if="type !== 'line'" :data="chartData" :options="options as never" />
    <Line v-else :data="chartData" :options="options as never" />
  </div>
</template>
