import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import { lazyLoadView } from '@/utils/lazyLoad'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: () => import('@/components/Layout.vue'),
    redirect: '/dashboard',
    children: [
      {
        path: 'dashboard',
        name: 'Dashboard',
        component: lazyLoadView(() => import('@/views/Dashboard.vue')),
        meta: { title: '实时监控面板', icon: 'Monitor' }
      },
      {
        path: 'trace',
        name: 'Trace',
        component: lazyLoadView(() => import('@/views/TraceQuery.vue')),
        meta: { title: '信令溯源查询', icon: 'Search' }
      },
      {
        path: 'devices',
        name: 'Devices',
        component: lazyLoadView(() => import('@/views/DeviceList.vue')),
        meta: { title: '设备管理', icon: 'Cpu' }
      },
      {
        path: 'analysis',
        name: 'Analysis',
        component: lazyLoadView(() => import('@/views/Analysis.vue')),
        meta: { title: '深度分析', icon: 'DataAnalysis' }
      },
      {
        path: 'alerts',
        name: 'Alerts',
        component: lazyLoadView(() => import('@/views/AlertCenter.vue')),
        meta: { title: '告警中心', icon: 'Bell' }
      }
    ]
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach((to, _from, next) => {
  document.title = `${to.meta.title || '工业信令监控系统'} - 工业信令监控系统`
  next()
})

export default router
