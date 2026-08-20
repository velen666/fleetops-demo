import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { User } from '@/types/domain'
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
    can,
    canAny,
    loginAs,
    logout,
    restore,
  }
})
