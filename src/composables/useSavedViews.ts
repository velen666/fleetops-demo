import { ref, watch } from 'vue'
import { lsGet, lsSet } from '@/lib/persistence'

/**
 * Saved views (TZ v1.6 §20-H P2): named filter presets per registry, persisted
 * in localStorage. A view stores the raw filter refs serialized as plain JSON.
 */

export interface SavedView {
  readonly id: string
  readonly name: string
  readonly query: Record<string, string>
  readonly createdAt: string
}

export function useSavedViews(registryKey: string) {
  const storageKey = `views:${registryKey}`
  const views = ref<SavedView[]>(lsGet<SavedView[]>(storageKey, []))

  watch(views, (v) => lsSet(storageKey, v), { deep: true })

  function save(name: string, query: Record<string, string>): boolean {
    const clean = Object.fromEntries(
      Object.entries(query).filter(([, v]) => Boolean(v) && v !== 'all'),
    )
    if (Object.keys(clean).length === 0) return false
    views.value = [
      ...views.value,
      {
        id: `view-${Date.now().toString(36)}`,
        name: name.trim(),
        query: clean,
        createdAt: new Date().toISOString(),
      },
    ]
    return true
  }

  function remove(id: string): void {
    views.value = views.value.filter((v) => v.id !== id)
  }

  return { views, save, remove }
}
