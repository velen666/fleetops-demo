<script setup lang="ts">
import { useTheme } from '@/composables/useTheme'
import { Button } from '@/components/ui/button'
import { Sun, Moon } from 'lucide-vue-next'

const { mode, toggleMode } = useTheme()
</script>

<template>
  <div class="flex items-center gap-2 px-2 py-1.5 mb-2">
    <Button
      variant="ghost"
      size="sm"
      class="flex-1 justify-start text-muted-foreground"
      :aria-label="mode === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему'"
      @click="toggleMode"
    >
      <Sun v-if="mode === 'dark'" class="size-4" />
      <Moon v-else class="size-4" />
      {{ mode === 'dark' ? 'Светлая тема' : 'Тёмная тема' }}
    </Button>
  </div>
</template>
