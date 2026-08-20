<script setup lang="ts">
import { useDemoData } from '@/composables/useDemoData'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useRouter } from 'vue-router'

const { downtimes, sites, robots } = useDemoData()
const router = useRouter()

function siteName(id: string): string {
  return sites.value.find((s) => s.id === id)?.name ?? id
}

function robotName(id: string | null): string {
  if (!id) return '—'
  return robots.value.find((r) => r.id === id)?.name ?? id
}

function goToIncident(incidentId: string): void {
  router.push({ name: 'incident-details', params: { incidentId } })
}
</script>

<template>
  <Card>
    <CardContent class="p-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Инцидент</TableHead>
            <TableHead>Объект</TableHead>
            <TableHead>Робот</TableHead>
            <TableHead>Начало</TableHead>
            <TableHead>Конец</TableHead>
            <TableHead>Длительность</TableHead>
            <TableHead>Статус</TableHead>
            <TableHead>Правило</TableHead>
            <TableHead>Потери</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow
            v-for="dt in downtimes"
            :key="dt.id"
            class="cursor-pointer hover:bg-muted/50"
            @click="goToIncident(dt.incidentId)"
          >
            <TableCell class="text-xs text-primary hover:underline">
              {{ dt.incidentId.slice(0, 8) }}…
            </TableCell>
            <TableCell class="text-sm">{{ siteName(dt.siteId) }}</TableCell>
            <TableCell class="text-sm">{{ robotName(dt.robotId) }}</TableCell>
            <TableCell class="text-xs font-mono">{{
              dt.startedAt.slice(0, 16).replace('T', ' ')
            }}</TableCell>
            <TableCell class="text-xs font-mono">{{
              dt.endedAt?.slice(0, 16).replace('T', ' ') ?? 'открыт'
            }}</TableCell>
            <TableCell class="text-sm tabular-nums"
              >{{ (dt.accountableDurationSeconds / 3600).toFixed(1) }} ч</TableCell
            >
            <TableCell>
              <span
                class="text-xs rounded px-1.5 py-0.5"
                :class="{
                  'bg-success/15 text-success': dt.confirmationStatus === 'CONFIRMED',
                  'bg-warning/15 text-warning': dt.confirmationStatus === 'PROPOSED',
                  'bg-destructive/15 text-destructive': dt.confirmationStatus === 'REJECTED',
                }"
                >{{ dt.confirmationStatus }}</span
              >
            </TableCell>
            <TableCell class="text-xs">{{ dt.ruleName }}</TableCell>
            <TableCell class="text-sm font-medium tabular-nums"
              >{{ dt.lossRubles.toLocaleString('ru-RU') }} ₽</TableCell
            >
          </TableRow>
        </TableBody>
      </Table>
    </CardContent>
  </Card>
</template>
