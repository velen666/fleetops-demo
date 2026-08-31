import { computed, ref } from 'vue'

export type ThemeMode = 'light' | 'dark'

function readMode(): ThemeMode {
  const stored = localStorage.getItem('theme')
  if (stored === 'light' || stored === 'dark') return stored
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

const mode = ref<ThemeMode>(readMode())

function apply(): void {
  document.documentElement.classList.toggle('dark', mode.value === 'dark')
  localStorage.setItem('theme', mode.value)
}

apply()

export function useTheme() {
  return {
    mode: computed(() => mode.value),
    setMode(value: ThemeMode): void {
      mode.value = value
      apply()
    },
    toggleMode(): void {
      mode.value = mode.value === 'dark' ? 'light' : 'dark'
      apply()
    },
  }
}
