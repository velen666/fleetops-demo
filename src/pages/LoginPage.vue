<script setup lang="ts">
import { useAuthStore } from '@/stores/auth'
import { ROLE_DEFINITIONS, type RoleCode } from '@/data/roles'
import {} from '@/components/ui/button'
import { Bot, ShieldCheck, Wrench, Eye, TrendingUp, Users, Settings } from 'lucide-vue-next'
import type { Component } from 'vue'

const auth = useAuthStore()

const iconMap: Record<string, Component> = {
  SYSTEM_ADMIN: Settings,
  SHIFT_OPERATOR: Eye,
  FLEET_OPERATIONS_MANAGER: ShieldCheck,
  SERVICE_ENGINEER: Wrench,
  SERVICE_MANAGER: Users,
  SITE_MANAGER: Bot,
  OPERATIONS_DIRECTOR: TrendingUp,
  FINANCE_MANAGER: TrendingUp,
}

function enter(code: RoleCode): void {
  auth.loginAs(code)
  window.location.href = '/'
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-background p-4">
    <div class="w-full max-w-3xl space-y-6">
      <div class="text-center space-y-2">
        <div class="flex justify-center">
          <div
            class="size-16 rounded-2xl bg-gradient-to-br from-brand-blue-500 to-brand-blue-700 flex items-center justify-center"
          >
            <Bot class="size-8 text-white" />
          </div>
        </div>
        <h1 class="text-2xl font-bold">FleetOps</h1>
        <p class="text-muted-foreground text-sm">
          Управление эксплуатацией роботизированного парка
        </p>
      </div>

      <div>
        <p class="text-center text-sm text-muted-foreground mb-4">
          Выберите роль для входа в систему
        </p>
        <div class="grid gap-3 sm:grid-cols-2">
          <button
            v-for="role in ROLE_DEFINITIONS"
            :key="role.code"
            class="flex items-start gap-3 rounded-xl border border-border bg-card p-4 text-left transition-all hover:border-primary hover:bg-accent/50"
            @click="enter(role.code)"
          >
            <div class="size-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <component :is="iconMap[role.code]" class="size-5 text-primary" />
            </div>
            <div class="flex-1 min-w-0">
              <p class="font-medium text-sm">{{ role.name }}</p>
              <p class="text-xs text-muted-foreground mt-0.5">{{ role.description }}</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
