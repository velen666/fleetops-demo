<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter, RouterView } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { Button } from '@/components/ui/button'
import {
  LayoutDashboard,
  Radio,
  AlertTriangle,
  Clock,
  TrendingDown,
  Bot,
  FileText,
  LogOut,
  Wrench,
  MapPin,
  Menu,
  X,
} from 'lucide-vue-next'
import type { Component } from 'vue'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const mobileNavOpen = ref(false)
const isDesktop = ref(false)
const mobileNavDrawer = ref<HTMLElement | null>(null)
const mobileNavClose = ref<{ $el: HTMLElement } | null>(null)
const mobileNavTrigger = ref<{ $el: HTMLElement } | null>(null)
let desktopMedia: MediaQueryList | undefined

function syncViewport(): void {
  isDesktop.value = desktopMedia?.matches ?? false
}

onMounted(() => {
  desktopMedia = window.matchMedia('(min-width: 1024px)')
  syncViewport()
  desktopMedia.addEventListener('change', syncViewport)
})

onBeforeUnmount(() => desktopMedia?.removeEventListener('change', syncViewport))

const iconMap: Record<string, Component> = {
  LayoutDashboard,
  Radio,
  AlertTriangle,
  Clock,
  TrendingDown,
  Bot,
  FileText,
  Wrench,
  MapPin,
}

interface NavItem {
  name: string
  title: string
  icon: string
  sidebarOrder: number
  group: 'control' | 'operations' | 'assets' | 'insights'
  requiredPermission?: string
  requiredRole?: string
  requiredRoles?: string[]
}

const allNavItems: NavItem[] = [
  { name: 'overview', title: 'Обзор', icon: 'LayoutDashboard', sidebarOrder: 10, group: 'control' },
  {
    // Портфель роботизации (Отчёт §10.4) — главная руководителя эксплуатации.
    name: 'portfolio',
    title: 'Портфель',
    icon: 'LayoutDashboard',
    sidebarOrder: 8,
    group: 'control',
    requiredRoles: ['SYSTEM_ADMIN', 'FLEET_OPERATIONS_MANAGER', 'SERVICE_MANAGER'],
  },
  {
    // Экономика эксплуатации (Отчёт §10.5) — главная финансовой роли.
    name: 'finance-home',
    title: 'Экономика',
    icon: 'TrendingDown',
    sidebarOrder: 8,
    group: 'control',
    requiredRoles: ['OPERATIONS_DIRECTOR', 'FINANCE_MANAGER', 'SYSTEM_ADMIN'],
  },
  {
    // Объектовый дашборд (ТЗ v2.0 §8.1) — стартовый экран начальника склада.
    name: 'my-site',
    title: 'Мой объект',
    icon: 'MapPin',
    sidebarOrder: 5,
    group: 'control',
    requiredRole: 'SITE_MANAGER',
  },
  {
    name: 'events',
    title: 'События',
    icon: 'Radio',
    sidebarOrder: 20,
    group: 'operations',
    requiredPermission: 'events.read',
  },
  {
    name: 'incidents',
    title: 'Инциденты',
    icon: 'AlertTriangle',
    sidebarOrder: 30,
    group: 'operations',
    requiredPermission: 'incidents.read',
  },
  {
    name: 'downtimes',
    title: 'Простои',
    icon: 'Clock',
    sidebarOrder: 40,
    group: 'operations',
    requiredPermission: 'downtime.read',
  },
  {
    name: 'analytics',
    title: 'Аналитика и экономика',
    icon: 'TrendingDown',
    sidebarOrder: 50,
    group: 'insights',
    requiredPermission: 'economics.read',
  },
  // Раздельные разделы (ТЗ v2.0 §4): «Объекты» и «Роботы»
  {
    name: 'sites',
    title: 'Объекты',
    icon: 'MapPin',
    sidebarOrder: 55,
    group: 'assets',
  },
  { name: 'robots', title: 'Роботы', icon: 'Bot', sidebarOrder: 60, group: 'assets' },
  {
    // Сервис и ТОиР (ACC-005): раздел доступен из навигации, а не только по URL.
    name: 'maintenance',
    title: 'Сервис и ТОиР',
    icon: 'Wrench',
    sidebarOrder: 63,
    group: 'operations',
    requiredPermission: 'actions.read',
  },
  {
    name: 'reports',
    title: 'Отчёты',
    icon: 'FileText',
    sidebarOrder: 70,
    group: 'insights',
    requiredPermission: 'reports.read',
  },
]

const navItems = computed(() =>
  allNavItems
    .filter((item) => {
      if (item.requiredRole && auth.activeRoleCode !== item.requiredRole) return false
      if (
        item.requiredRoles &&
        (!auth.activeRoleCode || !item.requiredRoles.includes(auth.activeRoleCode))
      )
        return false
      if (item.name === 'overview' && auth.activeRoleCode === 'SITE_MANAGER') return false
      return !item.requiredPermission || auth.can(item.requiredPermission)
    })
    .sort((a, b) => a.sidebarOrder - b.sidebarOrder),
)

const currentTitle = computed(() => (route.meta?.title as string) ?? 'FleetOps')
const roleContext = computed(() =>
  auth.activeRoleCode === 'SITE_MANAGER' ? 'Объектовый контур' : 'Портфель роботизации',
)
const navGroups = computed(() => {
  const labels: Record<NavItem['group'], string> = {
    control: 'Управление',
    operations: 'Операционный контур',
    assets: 'Активы',
    insights: 'Анализ и отчёты',
  }
  const groups: NavItem['group'][] = ['control', 'operations', 'assets', 'insights']
  return groups
    .map((group) => ({
      label: labels[group],
      items: navItems.value.filter((item) => item.group === group),
    }))
    .filter((group) => group.items.length > 0)
})

function isActive(name: string): boolean {
  return route.name === name
}

function openMobileNav(): void {
  mobileNavOpen.value = true
  void nextTick(() => mobileNavClose.value?.$el.focus())
}

function closeMobileNav(returnFocus = true): void {
  mobileNavOpen.value = false
  if (returnFocus) void nextTick(() => mobileNavTrigger.value?.$el.focus())
}

function trapMobileFocus(event: KeyboardEvent): void {
  if (event.key !== 'Tab' || isDesktop.value || !mobileNavOpen.value || !mobileNavDrawer.value)
    return
  const focusable = Array.from(
    mobileNavDrawer.value.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  )
  const first = focusable[0]
  const last = focusable.at(-1)
  if (!first || !last) return
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

function navigate(name: string): void {
  router.push({ name })
  closeMobileNav(false)
}

function logout(): void {
  closeMobileNav(false)
  auth.logout()
  window.location.href = '/login'
}
</script>

<template>
  <div class="app-shell flex h-screen text-foreground">
    <a
      href="#main-content"
      class="sr-only fixed left-4 top-4 z-50 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground focus:not-sr-only focus-visible:ring-3 focus-visible:ring-ring"
    >
      К основному содержимому
    </a>
    <Button
      v-if="mobileNavOpen"
      variant="ghost"
      class="fixed inset-0 z-40 h-auto w-auto rounded-none p-0 lg:hidden"
      aria-label="Закрыть навигацию"
      @click="closeMobileNav()"
    >
      <span class="sr-only">Закрыть навигацию</span>
    </Button>
    <aside
      ref="mobileNavDrawer"
      :class="[
        'app-sidebar fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-sidebar-border transition-transform duration-200 lg:static lg:z-auto lg:shrink-0 lg:translate-x-0',
        mobileNavOpen ? 'translate-x-0' : '-translate-x-full',
      ]"
      :aria-hidden="!isDesktop && !mobileNavOpen ? 'true' : undefined"
      :inert="!isDesktop && !mobileNavOpen"
      @keydown="trapMobileFocus"
    >
      <div class="flex min-h-18 items-center gap-3 border-b border-sidebar-border px-5">
        <div
          class="flex size-10 items-center justify-center rounded-xl bg-[image:var(--gradient-primary)] shadow-[var(--shadow-glow-primary)]"
        >
          <Bot class="size-5 text-primary-foreground" />
        </div>
        <div>
          <span class="block text-lg font-bold tracking-tight">FleetOps</span>
          <span class="text-xs text-muted-foreground">Operations Command Center</span>
        </div>
        <Button
          ref="mobileNavClose"
          variant="ghost"
          size="icon"
          class="ml-auto lg:hidden"
          aria-label="Закрыть навигацию"
          @click="closeMobileNav()"
        >
          <X class="size-5" />
          <span class="sr-only">Закрыть навигацию</span>
        </Button>
      </div>

      <nav class="flex-1 space-y-6 overflow-y-auto px-3 py-5" aria-label="Основная навигация">
        <section v-for="group in navGroups" :key="group.label" class="space-y-1.5">
          <p class="eyebrow px-3">{{ group.label }}</p>
          <Button
            v-for="item in group.items"
            :key="item.name"
            variant="ghost"
            :aria-current="isActive(item.name) ? 'page' : undefined"
            :class="[
              'w-full justify-start gap-3 rounded-lg px-3 text-sm font-medium',
              isActive(item.name)
                ? 'bg-sidebar-accent text-sidebar-accent-foreground shadow-sm'
                : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground',
            ]"
            @click="navigate(item.name)"
          >
            <component :is="iconMap[item.icon]" class="size-4" />
            {{ item.title }}
          </Button>
        </section>
      </nav>

      <div class="border-t border-sidebar-border p-4">
        <div class="mb-3 flex items-center gap-3 rounded-xl bg-sidebar-accent/45 p-3">
          <div
            class="flex size-9 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary"
          >
            {{ auth.user?.name?.charAt(0) ?? '?' }}
          </div>
          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium truncate">{{ auth.user?.name }}</p>
            <p class="text-xs text-muted-foreground truncate">{{ auth.user?.role }}</p>
          </div>
        </div>
        <Button variant="ghost" class="w-full justify-start text-muted-foreground" @click="logout">
          <LogOut class="size-4 mr-2" />
          Сменить роль
        </Button>
      </div>
    </aside>

    <div class="flex min-w-0 flex-1 flex-col overflow-hidden" :inert="!isDesktop && mobileNavOpen">
      <header
        class="app-header flex min-h-18 items-center border-b border-border px-5 sm:px-6 lg:px-8"
      >
        <Button
          ref="mobileNavTrigger"
          variant="ghost"
          size="icon"
          class="mr-3 lg:hidden"
          aria-label="Открыть навигацию"
          @click="openMobileNav"
        >
          <Menu class="size-5" />
          <span class="sr-only">Открыть навигацию</span>
        </Button>
        <div class="min-w-0">
          <p class="eyebrow mb-1">{{ roleContext }} · 30 дней</p>
          <h1 class="text-balance text-lg font-bold tracking-tight">{{ currentTitle }}</h1>
        </div>
      </header>
      <main
        id="main-content"
        tabindex="-1"
        class="flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8"
      >
        <div class="mx-auto w-full max-w-[1440px]">
          <RouterView v-slot="{ Component: ViewComponent }">
            <KeepAlive>
              <component :is="ViewComponent" />
            </KeepAlive>
          </RouterView>
        </div>
      </main>
    </div>
  </div>
</template>
