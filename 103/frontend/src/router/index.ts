import Vue from 'vue'
import VueRouter, { RouteConfig } from 'vue-router'
import Layout from '@/layout/index.vue'

Vue.use(VueRouter)

export const constantRoutes: RouteConfig[] = [
  {
    path: '/login',
    component: () => import('@/views/login/index.vue'),
    hidden: true,
  },
  {
    path: '/404',
    component: () => import('@/views/error/404.vue'),
    hidden: true,
  },
  {
    path: '/',
    component: Layout,
    redirect: '/dashboard',
    children: [
      {
        path: 'dashboard',
        name: 'Dashboard',
        component: () => import('@/views/dashboard/index.vue'),
        meta: { title: '预约工作台', icon: 'el-icon-s-home' },
      },
    ],
  },
  {
    path: '/instruments',
    component: Layout,
    redirect: '/instruments/list',
    meta: { title: '仪器预约', icon: 'el-icon-microphone' },
    children: [
      {
        path: 'list',
        name: 'InstrumentList',
        component: () => import('@/views/instruments/list.vue'),
        meta: { title: '仪器列表', icon: 'el-icon-menu' },
      },
      {
        path: ':id/calendar',
        name: 'InstrumentCalendar',
        component: () => import('@/views/instruments/calendar.vue'),
        meta: { title: '预约日历', icon: 'el-icon-date', hidden: true },
      },
      {
        path: 'my-reservations',
        name: 'MyReservations',
        component: () => import('@/views/reservations/my-reservations.vue'),
        meta: { title: '我的预约', icon: 'el-icon-document' },
      },
    ],
  },
  {
    path: '/records',
    component: Layout,
    redirect: '/records/list',
    meta: { title: '记录追溯', icon: 'el-icon-time' },
    children: [
      {
        path: 'list',
        name: 'RecordList',
        component: () => import('@/views/records/list.vue'),
        meta: { title: '使用记录', icon: 'el-icon-notebook-2' },
      },
      {
        path: 'audit-logs',
        name: 'AuditLogs',
        component: () => import('@/views/records/audit-logs.vue'),
        meta: { title: '操作日志', icon: 'el-icon-document-checked', roles: ['super_admin', 'lab_admin'] },
      },
    ],
  },
  {
    path: '/files',
    component: Layout,
    children: [
      {
        path: '',
        name: 'Files',
        component: () => import('@/views/files/index.vue'),
        meta: { title: '文件库', icon: 'el-icon-folder-opened' },
      },
    ],
  },
  {
    path: '/messages',
    component: Layout,
    children: [
      {
        path: '',
        name: 'Messages',
        component: () => import('@/views/messages/index.vue'),
        meta: { title: '消息中心', icon: 'el-icon-bell' },
      },
    ],
  },
  {
    path: '/system',
    component: Layout,
    redirect: '/system/users',
    meta: { title: '系统管理', icon: 'el-icon-setting', roles: ['super_admin', 'lab_admin'] },
    children: [
      {
        path: 'users',
        name: 'UserManagement',
        component: () => import('@/views/system/users.vue'),
        meta: { title: '用户管理', icon: 'el-icon-user', roles: ['super_admin', 'lab_admin'] },
      },
      {
        path: 'roles',
        name: 'RoleManagement',
        component: () => import('@/views/system/roles.vue'),
        meta: { title: '角色管理', icon: 'el-icon-s-custom', roles: ['super_admin'] },
      },
      {
        path: 'settings',
        name: 'SystemSettings',
        component: () => import('@/views/system/settings.vue'),
        meta: { title: '系统设置', icon: 'el-icon-s-tools', roles: ['super_admin'] },
      },
    ],
  },
  {
    path: '*',
    redirect: '/404',
    hidden: true,
  },
]

const createRouter = () =>
  new VueRouter({
    mode: 'history',
    base: '/',
    scrollBehavior: () => ({ y: 0 }),
    routes: constantRoutes,
  })

const router = createRouter()

export function resetRouter() {
  const newRouter = createRouter()
  ;(router as any).matcher = (newRouter as any).matcher
}

export default router
