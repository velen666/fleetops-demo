import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/pages/LoginPage.vue'),
      meta: { public: true },
    },
    {
      path: '/',
      component: () => import('@/layouts/DashboardLayout.vue'),
      children: [
        {
          path: '',
          name: 'overview',
          component: () => import('@/pages/OverviewPage.vue'),
          meta: { title: 'Обзор', icon: 'LayoutDashboard', sidebarOrder: 10 },
        },
        {
          path: 'events',
          name: 'events',
          component: () => import('@/pages/EventsListPage.vue'),
          meta: {
            title: 'События',
            icon: 'Radio',
            sidebarOrder: 20,
            requiredPermission: 'events.read',
          },
        },
        {
          path: 'incidents',
          name: 'incidents',
          component: () => import('@/pages/IncidentsListPage.vue'),
          meta: {
            title: 'Инциденты',
            icon: 'AlertTriangle',
            sidebarOrder: 30,
            requiredPermission: 'incidents.read',
          },
        },
        {
          path: 'incidents/:incidentId',
          name: 'incident-details',
          component: () => import('@/pages/IncidentDetailsPage.vue'),
          meta: { title: 'Карточка инцидента', hidden: true, requiredPermission: 'incidents.read' },
        },
        {
          path: 'downtimes',
          name: 'downtimes',
          component: () => import('@/pages/DowntimesPage.vue'),
          meta: {
            title: 'Простои',
            icon: 'Clock',
            sidebarOrder: 40,
            requiredPermission: 'downtime.read',
          },
        },
        {
          path: 'analytics',
          name: 'analytics',
          component: () => import('@/pages/AnalyticsPage.vue'),
          meta: {
            title: 'Аналитика и экономика',
            icon: 'TrendingDown',
            sidebarOrder: 50,
            requiredPermission: 'economics.read',
          },
        },
        {
          path: 'robots',
          name: 'robots',
          component: () => import('@/pages/RobotsListPage.vue'),
          meta: { title: 'Роботы', icon: 'Bot', sidebarOrder: 60 },
        },
        {
          path: 'sites',
          name: 'sites',
          component: () => import('@/pages/SitesListPage.vue'),
          meta: { title: 'Объекты', icon: 'MapPin', sidebarOrder: 62 },
        },
        {
          path: 'maintenance',
          name: 'maintenance',
          component: () => import('@/pages/MaintenancePage.vue'),
          meta: {
            title: 'ТОиР',
            icon: 'Wrench',
            sidebarOrder: 65,
            requiredPermission: 'actions.read',
          },
        },
        {
          path: 'reports',
          name: 'reports',
          component: () => import('@/pages/ReportsPage.vue'),
          meta: {
            title: 'Отчёты',
            icon: 'FileText',
            sidebarOrder: 70,
            requiredPermission: 'reports.read',
          },
        },
      ],
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/',
    },
  ],
})

router.beforeEach((to) => {
  const auth = useAuthStore()
  if (!to.meta.public && !auth.isAuthenticated) {
    return { name: 'login' }
  }
  // RBAC: проверка прав при прямом URL
  if (
    to.meta.requiredPermission &&
    auth.isAuthenticated &&
    !auth.can(to.meta.requiredPermission as string)
  ) {
    return { name: 'overview' }
  }
})
