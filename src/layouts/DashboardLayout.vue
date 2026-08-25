<script setup lang="ts">
import { computed } from 'vue'
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
} from 'lucide-vue-next'
import type { Component } from 'vue'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

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
  requiredPermission?: string
  requiredRole?: string
}

const allNavItems: NavItem[] = [
  { name: 'overview', title: 'Обзор', icon: 'LayoutDashboard', sidebarOrder: 10 },
  {
    // Объектовый дашборд (ТЗ v2.0 §8.1) — стартовый экран начальника склада.
    name: 'my-site',
    title: 'Мой объект',
    icon: 'MapPin',
    sidebarOrder: 5,
    requiredRole: 'SITE_MANAGER',
  },
  {
    name: 'events',
    title: 'События',
    icon: 'Radio',
    sidebarOrder: 20,
    requiredPermission: 'events.read',
  },
  {
    name: 'incidents',
    title: 'Инциденты',
    icon: 'AlertTriangle',
    sidebarOrder: 30,
    requiredPermission: 'incidents.read',
  },
  {
    name: 'downtimes',
    title: 'Простои',
    icon: 'Clock',
    sidebarOrder: 40,
    requiredPermission: 'downtime.read',
  },
  {
    name: 'analytics',
    title: 'Аналитика и экономика',
    icon: 'TrendingDown',
    sidebarOrder: 50,
    requiredPermission: 'economics.read',
  },
  { name: 'robots', title: 'Роботы и объекты', icon: 'Bot', sidebarOrder: 60 },
  {
    name: 'reports',
    title: 'Отчёты',
    icon: 'FileText',
    sidebarOrder: 70,
    requiredPermission: 'reports.read',
  },
]

const navItems = computed(() =>
  allNavItems.filter((item) => {
    if (item.requiredRole && auth.activeRoleCode !== item.requiredRole) return false
    if (item.name === 'overview' && auth.activeRoleCode === 'SITE_MANAGER') return false
    return !item.requiredPermission || auth.can(item.requiredPermission)
  }),
)

const currentTitle = computed(() => (route.meta?.title as string) ?? 'FleetOps')

function navigate(name: string): void {
  router.push({ name })
}

function logout(): void {
  auth.logout()
  window.location.href = '/login'
}
</script>

<template>
  <div class="flex h-screen bg-background text-foreground">
    <aside class="flex w-64 flex-col border-r border-border bg-sidebar">
      <div class="flex h-14 items-center gap-2 border-b border-sidebar-border px-4">
        <div
          class="size-8 rounded-lg bg-gradient-to-br from-brand-blue-500 to-brand-blue-700 flex items-center justify-center"
        >
          <Bot class="size-5 text-white" />
        </div>
        <span class="text-lg font-semibold tracking-tight">FleetOps</span>
      </div>

      <nav class="flex-1 space-y-1 p-3 overflow-y-auto">
        <button
          v-for="item in navItems"
          :key="item.name"
          :class="[
            'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
            route.name === item.name
              ? 'bg-sidebar-accent text-sidebar-accent-foreground'
              : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
          ]"
          @click="navigate(item.name)"
        >
          <component :is="iconMap[item.icon]" class="size-4" />
          {{ item.title }}
        </button>
      </nav>

      <div class="border-t border-sidebar-border p-3">
        <div class="flex items-center gap-2 px-2 py-1.5 mb-2">
          <div
            class="size-8 rounded-full bg-primary/15 flex items-center justify-center text-primary font-semibold text-sm"
          >
            {{ auth.user?.name?.charAt(0) ?? '?' }}
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium truncate">{{ auth.user?.name }}</p>
            <p class="text-xs text-muted-foreground truncate">{{ auth.user?.role }}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          class="w-full justify-start text-muted-foreground"
          @click="logout"
        >
          <LogOut class="size-4 mr-2" />
          Сменить роль
        </Button>
      </div>
    </aside>

    <div class="flex-1 flex flex-col overflow-hidden">
      <header class="flex h-14 items-center border-b border-border px-6">
        <h1 class="text-lg font-semibold">{{ currentTitle }}</h1>
      </header>
      <main class="flex-1 overflow-y-auto p-6">
        <RouterView v-slot="{ Component: ViewComponent }">
          <KeepAlive>
            <component :is="ViewComponent" />
          </KeepAlive>
        </RouterView>
      </main>
    </div>
  </div>
</template>
