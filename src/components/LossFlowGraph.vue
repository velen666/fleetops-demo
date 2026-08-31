<script setup lang="ts">
/**
 * Sankey-lite граф потоков (Отчёты): связи «причина → объект».
 * Двухуровневый направленный граф: толщина ленты ∝ значению (потери).
 * Цвета только через дизайн-токены (--chart-N).
 */
import { computed } from 'vue'

interface FlowLink {
  from: string
  to: string
  value: number
  colorToken: string
}

const props = defineProps<{
  links: FlowLink[]
  unit?: string
}>()

interface FlowRibbon {
  key: string
  d: string
  colorToken: string
  title: string
}

const W = 560
const PAD = 16
const LABEL_W = 150
const NODE_W = 10

const fromNodes = computed(() => {
  const map = new Map<string, { name: string; value: number; colorToken: string }>()
  for (const l of props.links) {
    const n = map.get(l.from) ?? { name: l.from, value: 0, colorToken: l.colorToken }
    n.value += l.value
    map.set(l.from, n)
  }
  return [...map.values()]
})

const toNodes = computed(() => {
  const map = new Map<string, number>()
  for (const l of props.links) map.set(l.to, (map.get(l.to) ?? 0) + l.value)
  return [...map.entries()].map(([name, value]) => ({ name, value }))
})

const height = computed(() =>
  Math.max(180, Math.max(fromNodes.value.length, toNodes.value.length) * 48 + PAD * 2),
)

const innerH = computed(() => height.value - PAD * 2)

/** Позиции узлов источника: пропорционально суммарному значению. */
const fromSpans = computed(() => {
  const total = fromNodes.value.reduce((s, n) => s + n.value, 0) || 1
  let acc = PAD
  return fromNodes.value.map((n) => {
    const top = acc
    const bottom = acc + (n.value / total) * innerH.value
    acc = bottom
    return { top, bottom }
  })
})

/** Позиции узлов приёмника. */
const toSpans = computed(() => {
  const total = toNodes.value.reduce((s, n) => s + n.value, 0) || 1
  let acc = PAD
  return toNodes.value.map((n) => {
    const top = acc
    const bottom = acc + (n.value / total) * innerH.value
    acc = bottom
    return { top, bottom }
  })
})

const fromX = PAD + LABEL_W
const toX = W - PAD - LABEL_W - NODE_W

/** Ленты: последовательные offset внутри каждого узла с обеих сторон. */
const ribbons = computed(() => {
  const fromAcc = new Map<string, number>()
  const toAcc = new Map<string, number>()
  return props.links
    .map((l): FlowRibbon | null => {
      const fi = fromNodes.value.findIndex((n) => n.name === l.from)
      const ti = toNodes.value.findIndex((n) => n.name === l.to)
      if (fi < 0 || ti < 0) return null
      const fSpan = fromSpans.value[fi].bottom - fromSpans.value[fi].top
      const tSpanTotal = toSpans.value[ti].bottom - toSpans.value[ti].top
      const fromTotal = fromNodes.value[fi].value || 1
      const toTotal = toNodes.value[ti].value || 1
      const hF = (l.value / fromTotal) * fSpan
      const hT = (l.value / toTotal) * tSpanTotal
      const fOff = fromAcc.get(l.from) ?? 0
      fromAcc.set(l.from, fOff + hF)
      const tOff = toAcc.get(l.to) ?? 0
      toAcc.set(l.to, tOff + hT)
      const y1 = fromSpans.value[fi].top + fOff
      const y2 = toSpans.value[ti].top + tOff
      const cx = (fromX + toX) / 2
      const y1b = y1 + hF
      const y2b = y2 + hT
      const d = `M ${fromX} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${toX} ${y2} L ${toX} ${y2b} C ${cx} ${y2b}, ${cx} ${y1b}, ${fromX} ${y1b} Z`
      return {
        key: `${l.from}→${l.to}`,
        d,
        colorToken: l.colorToken,
        title: `${l.from} → ${l.to}: ${l.value.toLocaleString('ru-RU')}${props.unit ?? ''}`,
      }
    })
    .filter((r): r is FlowRibbon => r !== null)
})
</script>

<template>
  <div class="w-full overflow-x-auto">
    <svg
      :viewBox="`0 0 ${W} ${height}`"
      class="w-full min-w-[420px]"
      role="img"
      aria-label="Граф потоков: причина → объект"
    >
      <template v-for="r in ribbons" :key="r.key">
        <g v-if="r">
          <title>{{ r.title }}</title>
          <path :d="r.d" :style="{ fill: `var(${r.colorToken})`, fillOpacity: 0.22 }" />
          <path
            :d="r.d"
            fill="none"
            :style="{ stroke: `var(${r.colorToken})`, strokeOpacity: 0.5 }"
            stroke-width="1"
          />
        </g>
      </template>
      <g v-for="(n, i) in fromNodes" :key="'f' + i">
        <rect
          :x="fromX"
          :y="fromSpans[i].top"
          :width="NODE_W"
          :height="Math.max(4, fromSpans[i].bottom - fromSpans[i].top)"
          rx="2"
          :style="{ fill: `var(${n.colorToken})` }"
        />
        <text
          :x="fromX - 6"
          :y="(fromSpans[i].top + fromSpans[i].bottom) / 2 + 4"
          text-anchor="end"
          class="fill-muted-foreground"
          font-size="10"
        >
          {{ n.name.length > 24 ? n.name.slice(0, 23) + '…' : n.name }}
        </text>
      </g>
      <g v-for="(n, i) in toNodes" :key="'t' + i">
        <rect
          :x="toX"
          :y="toSpans[i].top"
          :width="NODE_W"
          :height="Math.max(4, toSpans[i].bottom - toSpans[i].top)"
          rx="2"
          style="fill: var(--muted-foreground)"
        />
        <text
          :x="toX + NODE_W + 6"
          :y="(toSpans[i].top + toSpans[i].bottom) / 2 + 4"
          class="fill-foreground"
          font-size="11"
          font-weight="500"
        >
          {{ n.name }}
        </text>
      </g>
    </svg>
  </div>
</template>
