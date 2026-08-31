<script setup lang="ts">
import { computed, ref } from 'vue'
import { useMutationObserver } from '@vueuse/core'
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

ChartJS.defaults.font.family =
  "Montserrat, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"

const props = defineProps<{
  type: 'bar' | 'bar-stacked' | 'line'
  labels: string[]
  datasets: Array<{
    label: string
    /** Значение или диапазон [start, end] для floating-bar (Гант) */
    data: Array<number | [number, number]>
    /** HEX-цвет или имя CSS-токена ('--chart-1', '--status-warning', ...) */
    color?: string
  }>
  horizontal?: boolean
  suffix?: string
}>()

const themeTick = ref(0)
useMutationObserver(
  document.documentElement,
  () => {
    themeTick.value++
  },
  { attributes: true, attributeFilter: ['class'] },
)

function cssColor(varName: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(varName).trim()
  return v || fallback
}

function withAlpha(color: string, alpha: number): string {
  if (color.startsWith('oklch(')) return color.replace(/\)$/, ` / ${alpha})`)
  if (color.startsWith('#')) {
    const hex = color.slice(1)
    const full = hex.length === 3 ? hex.replace(/(.)/g, '$1$1') : hex
    const r = parseInt(full.slice(0, 2), 16)
    const g = parseInt(full.slice(2, 4), 16)
    const b = parseInt(full.slice(4, 6), 16)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }
  return color
}

function seriesColor(color: string | undefined, index: number): string {
  void themeTick.value
  const fallback = cssColor(`--chart-${(index % 5) + 1}`, '#00a0e9')
  if (!color) return fallback
  if (color.startsWith('--')) return cssColor(color, fallback)
  return color
}

function verticalGradient(
  scriptableCtx: unknown,
  color: string,
  from: number,
  to: number,
): CanvasGradient | string {
  const chart = (
    scriptableCtx as {
      chart?: { ctx: CanvasRenderingContext2D; chartArea?: { top: number; bottom: number } }
    }
  ).chart
  if (!chart || !chart.chartArea) return withAlpha(color, from)
  const { top, bottom } = chart.chartArea
  const g = chart.ctx.createLinearGradient(0, top, 0, bottom)
  g.addColorStop(0, withAlpha(color, from))
  g.addColorStop(1, withAlpha(color, to))
  return g
}

const chartData = computed(() => ({
  labels: props.labels,
  datasets: props.datasets.map((ds, i) => {
    const color = seriesColor(ds.color, i)
    return {
      label: ds.label,
      data: ds.data as unknown as number[],
      backgroundColor:
        props.type === 'line'
          ? (ctx: unknown) => verticalGradient(ctx, color, 0.25, 0)
          : (ctx: unknown) => verticalGradient(ctx, color, 0.95, 0.6),
      borderColor: color,
      hoverBackgroundColor:
        props.type === 'line' ? undefined : (ctx: unknown) => verticalGradient(ctx, color, 1, 0.75),
      borderRadius: props.type === 'line' ? undefined : 6,
      borderSkipped: false,
      borderWidth: props.type === 'line' ? 2 : 0,
      fill: props.type === 'line',
      tension: 0.35,
      pointRadius: 3,
      pointHoverRadius: 5,
      pointBackgroundColor: color,
      pointBorderColor: cssColor('--background', '#0f172a'),
      pointHoverBorderWidth: 2,
      maxBarThickness: 44,
    }
  }),
}))

const options = computed(() => {
  void themeTick.value
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
  const legendColor = cssColor('--muted-foreground', '#94a3b8')
  const tickColor = cssColor('--muted-foreground', '#64748b')
  const gridColor = withAlpha(tickColor, 0.15)
  const tooltipBg = withAlpha(cssColor('--popover', '#0f172a'), 0.95)
  const tooltipFg = cssColor('--popover-foreground', '#e2e8f0')
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
          color: legendColor,
          font: { size: 11 },
          usePointStyle: true,
          pointStyle: 'circle' as const,
        },
      },
      tooltip: {
        backgroundColor: tooltipBg,
        titleColor: tooltipFg,
        bodyColor: tooltipFg,
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
          color: tickColor,
          font: { size: 10 },
          callback: (val: unknown) => (typeof val === 'number' ? val.toLocaleString('ru-RU') : val),
        },
        grid: { color: gridColor },
      },
      y: {
        stacked: props.type === 'bar-stacked',
        ticks: { color: tickColor, font: { size: 10 } },
        grid: { color: gridColor },
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
