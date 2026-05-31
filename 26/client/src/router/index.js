import { createRouter, createWebHistory } from 'vue-router'
import { useUserStore } from '@/store/user'

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/login/index.vue'),
    meta: { title: '登录', public: true }
  },
  {
    path: '/',
    component: () => import('@/layout/index.vue'),
    redirect: '/dashboard',
    children: [
      {
        path: 'dashboard',
        name: 'Dashboard',
        component: () => import('@/views/dashboard/index.vue'),
        meta: { title: '数据概览', icon: 'Odometer' }
      },
      {
        path: 'archives',
        name: 'Archives',
        component: () => import('@/views/archives/index.vue'),
        meta: { title: '档案管理', icon: 'Files' }
      },
      {
        path: 'archives/:id',
        name: 'ArchiveDetail',
        component: () => import('@/views/archives/detail.vue'),
        meta: { title: '档案详情', hidden: true }
      },
      {
        path: 'traceability',
        name: 'Traceability',
        component: () => import('@/views/traceability/index.vue'),
        meta: { title: '溯源查询', icon: 'Connection' }
      },
      {
        path: 'traceability/:id',
        name: 'TraceabilityChain',
        component: () => import('@/views/traceability/chain.vue'),
        meta: { title: '溯源链详情', hidden: true }
      },
      {
        path: 'materials',
        name: 'Materials',
        component: () => import('@/views/materials/index.vue'),
        meta: { title: '物料台账', icon: 'Goods' }
      },
      {
        path: 'transfers',
        name: 'Transfers',
        component: () => import('@/views/transfers/index.vue'),
        meta: { title: '流转记录', icon: 'Van' }
      },
      {
        path: 'signatures',
        name: 'Signatures',
        component: () => import('@/views/signatures/index.vue'),
        meta: { title: '电子签章', icon: 'EditPen' }
      },
      {
        path: 'verification',
        name: 'Verification',
        component: () => import('@/views/verification/index.vue'),
        meta: { title: '身份核验', icon: 'User' }
      },
      {
        path: 'warnings',
        name: 'Warnings',
        component: () => import('@/views/warnings/index.vue'),
        meta: { title: '流转预警', icon: 'Warning' }
      },
      {
        path: 'qrcode',
        name: 'QRCode',
        component: () => import('@/views/qrcode/index.vue'),
        meta: { title: '二维码管理', icon: 'Picture' }
      },
      {
        path: 'profile',
        name: 'Profile',
        component: () => import('@/views/profile/index.vue'),
        meta: { title: '个人中心', icon: 'Setting', hidden: true }
      }
    ]
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    component: () => import('@/views/error/404.vue'),
    meta: { title: '页面不存在', public: true }
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach((to, from, next) => {
  const userStore = useUserStore()
  document.title = to.meta.title ? `${to.meta.title} - 非遗溯源平台` : '非遗溯源平台'

  if (to.meta.public) {
    next()
  } else if (!userStore.token) {
    next({ path: '/login', query: { redirect: to.fullPath } })
  } else {
    next()
  }
})

export default router
