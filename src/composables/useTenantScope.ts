import { computed, type ComputedRef } from 'vue'
import { useAuthStore } from '@/stores/auth'
import type {
  Downtime,
  Incident,
  MaintenanceWork,
  OperationalEvent,
  Robot,
  Site,
  SiteZone,
  Substitution,
} from '@/types/domain'

/**
 * Tenant-модель доступа (ТЗ v2.0 §3): данные реестров ограничиваются
 * зоной ответственности роли. Начальник склада — свой объект; руководящие
 * роли (эксплуатация, финансы, директор, админ) — все объекты.
 *
 * Применяется на уровне выборки страниц; MySitePage работает по своему
 * объекту напрямую.
 */
export function useTenantScope() {
  const auth = useAuthStore()
  const allowed = computed(() => auth.allowedSiteIds)
  const scoped = computed(() => auth.isSiteScoped)

  const inScope = (siteId: string | null | undefined): boolean =>
    !siteId || allowed.value.includes(siteId)

  return {
    allowed,
    scoped,
    isSiteAllowed: (siteId: string) => auth.isSiteAllowed(siteId),
    sites: <T extends Site>(list: T[]): ComputedRef<T[]> =>
      computed(() => list.filter((s) => inScope(s.id))),
    zones: <T extends SiteZone>(list: T[]): ComputedRef<T[]> =>
      computed(() => list.filter((z) => inScope(z.siteId))),
    robots: <T extends Robot>(list: T[]): ComputedRef<T[]> =>
      computed(() => list.filter((r) => inScope(r.siteId))),
    incidents: <T extends Incident>(list: T[]): ComputedRef<T[]> =>
      computed(() => list.filter((i) => inScope(i.siteId))),
    downtimes: <T extends Downtime>(list: T[]): ComputedRef<T[]> =>
      computed(() => list.filter((d) => inScope(d.siteId))),
    events: <T extends OperationalEvent>(list: T[]): ComputedRef<T[]> =>
      computed(() => list.filter((e) => inScope(e.siteId))),
    maintenance: <T extends MaintenanceWork>(list: T[]): ComputedRef<T[]> =>
      computed(() => list.filter((m) => inScope(m.siteId))),
    substitutions: <T extends Substitution>(list: T[]): ComputedRef<T[]> =>
      computed(() => list.filter((s) => inScope(s.siteId))),
  }
}
