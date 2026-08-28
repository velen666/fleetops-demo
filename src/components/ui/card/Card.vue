<script setup lang="ts">
import type { VariantProps } from 'class-variance-authority'
import type { HTMLAttributes } from "vue"
import { cva } from 'class-variance-authority'
import { cn } from "@/lib/utils"

const cardVariants = cva('text-card-foreground flex flex-col rounded-2xl border', {
  variants: {
    tone: {
      plain: 'bg-card shadow-sm',
      glass: 'card-glass',
      data: 'card-data',
      decision: 'card-decision',
    },
    density: {
      compact: 'gap-3 py-4',
      default: 'gap-6 py-6',
      spacious: 'gap-8 py-8',
    },
  },
  defaultVariants: {
    tone: 'plain',
    density: 'default',
  },
})

type CardVariants = VariantProps<typeof cardVariants>

const props = defineProps<{
  class?: HTMLAttributes["class"]
  tone?: CardVariants['tone']
  density?: CardVariants['density']
}>()
</script>

<template>
  <div
    data-slot="card"
    :class="
      cn(
        cardVariants({ tone: props.tone, density: props.density }),
        props.class,
      )
    "
  >
    <slot />
  </div>
</template>
