<script setup lang="ts">
import { computed } from 'vue'
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
}>()

const DEFAULT_COLORS = [
  '#00a0e9',
  '#ff6b6b',
  '#fcd34d',
  '#10b981',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
  '#f97316',
]

const chartData = computed(() => ({
  labels: props.labels,
  datasets: props.datasets.map((ds, i) => ({
    label: ds.label,
    data: ds.data,
    backgroundColor: ds.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length],
    borderColor: ds.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length],
    borderRadius: props.type === 'line' ? undefined : 6,
    borderSkipped: false,
    borderWidth: props.type === 'line' ? 2 : 0,
    fill: props.type === 'line',
    tension: 0.3,
    pointRadius: 3,
    pointHoverRadius: 5,
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
          color: '#94a3b8',
          font: { size: 11 },
          usePointStyle: true,
          pointStyle: 'circle' as const,
        },
      },
      tooltip: {
        backgroundColor: 'rgba(15,23,42,0.95)',
        titleColor: '#e2e8f0',
        bodyColor: '#cbd5e1',
        padding: 10,
        callbacks: {
          label: tooltipLabel as never,
        },
      },
    },
  }
  if (props.type === 'line') return base
  return {
    ...base,
    indexAxis: props.horizontal ? ('y' as const) : ('x' as const),
    scales: {
      x: {
        stacked: props.type === 'bar-stacked',
        ticks: {
          color: '#64748b',
          font: { size: 10 },
          callback: (val: unknown) => (typeof val === 'number' ? val.toLocaleString('ru-RU') : val),
        },
        grid: { color: 'rgba(148,163,184,0.08)' },
      },
      y: {
        stacked: props.type === 'bar-stacked',
        ticks: { color: '#64748b', font: { size: 10 } },
        grid: { color: 'rgba(148,163,184,0.08)' },
      },
    },
  }
})
</script>

<template>
  <div class="relative h-64">
    <Bar v-if="type !== 'line'" :data="chartData" :options="options as never" />
    <Line v-else :data="chartData" :options="options as never" />
  </div>
</template>
