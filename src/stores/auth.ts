import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Site, User } from '@/types/domain'
import { ROLE_DEFINITIONS, ROLE_USERS, type RoleCode } from '@/data/roles'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const activeRoleCode = ref<RoleCode | null>(null)
  const isAuthenticated = computed(() => user.value !== null)

  const permissions = computed<string[]>(() => {
    if (!activeRoleCode.value) return []
    const def = ROLE_DEFINITIONS.find((r) => r.code === activeRoleCode.value)
    return def?.permissions ?? []
  })

  function can(perm: string): boolean {
    return permissions.value.includes(perm)
  }

  function canAny(perms: string[]): boolean {
    return perms.some((p) => permissions.value.includes(p))
  }

  /**
   * Tenant-модель (ТЗ v2.0 §3): зона ответственности роли.
   * siteIds пользователя = разрешённые объекты; пусто — все объекты.
   * Начальник склада видит только свой склад, руководящие роли — все.
   */
  const ALL_SITES = ['site-pod', 'site-obh', 'site-dom']
  const allowedSiteIds = computed<string[]>(() => {
    const ids = user.value?.siteIds ?? []
    return ids.length > 0 ? ids : [...ALL_SITES]
  })
  /** Роль ограничена подмножеством объектов (не все три). */
  const isSiteScoped = computed(() => allowedSiteIds.value.length < ALL_SITES.length)

  function isSiteAllowed(siteId: string): boolean {
    return allowedSiteIds.value.includes(siteId)
  }

  function loginAs(roleCode: RoleCode): void {
    activeRoleCode.value = roleCode
    user.value = ROLE_USERS[roleCode]
    localStorage.setItem('fleetops-demo-role', roleCode)
  }

  function logout(): void {
    user.value = null
    activeRoleCode.value = null
    localStorage.removeItem('fleetops-demo-role')
  }

  function restore(): void {
    const saved = localStorage.getItem('fleetops-demo-role') as RoleCode | null
    if (saved && saved in ROLE_USERS) {
      loginAs(saved)
    }
  }

  return {
    user,
    activeRoleCode,
    isAuthenticated,
    permissions,
    allowedSiteIds,
    isSiteScoped,
    isSiteAllowed,
    can,
    canAny,
    loginAs,
    logout,
    restore,
  }
})

/** Помощник для типизации списка объектов вне стора. */
export function filterSitesByScope(sites: Site[], allowed: string[]): Site[] {
  return allowed.length === 0 ? sites : sites.filter((s) => allowed.includes(s.id))
}
