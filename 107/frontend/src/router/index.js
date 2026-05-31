import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    redirect: '/dashboard'
  },
  {
    path: '/dashboard',
    name: 'Dashboard',
    component: () => import('@/views/Dashboard.vue')
  },
  {
    path: '/data-cleaning',
    name: 'DataCleaning',
    component: () => import('@/views/DataCleaning.vue')
  },
  {
    path: '/reports',
    name: 'Reports',
    component: () => import('@/views/Reports.vue')
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
