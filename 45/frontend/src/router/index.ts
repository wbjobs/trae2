import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router';
import { useUserStore } from '@/stores/user';

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/Login.vue'),
    meta: { title: '登录', requiresAuth: false }
  },
  {
    path: '/',
    component: () => import('@/layouts/MainLayout.vue'),
    redirect: '/dashboard',
    meta: { requiresAuth: true },
    children: [
      {
        path: 'dashboard',
        name: 'Dashboard',
        component: () => import('@/views/Dashboard.vue'),
        meta: { title: '首页', icon: 'DataBoard' }
      },
      {
        path: 'fossils',
        name: 'FossilList',
        component: () => import('@/views/FossilList.vue'),
        meta: { title: '标本档案', icon: 'Collection' }
      },
      {
        path: 'fossils/:id',
        name: 'FossilDetail',
        component: () => import('@/views/FossilDetail.vue'),
        meta: { title: '标本详情', hidden: true }
      },
      {
        path: 'fossil/new',
        name: 'FossilCreate',
        component: () => import('@/views/FossilForm.vue'),
        meta: { title: '新建标本', icon: 'Plus', roles: ['admin', 'curator'] }
      },
      {
        path: 'fossil/edit/:id',
        name: 'FossilEdit',
        component: () => import('@/views/FossilForm.vue'),
        meta: { title: '编辑标本', hidden: true, roles: ['admin', 'curator'] }
      },
      {
        path: 'viewer/:id',
        name: 'ModelViewer',
        component: () => import('@/views/ModelViewer.vue'),
        meta: { title: '三维预览', hidden: true }
      },
      {
        path: 'traces',
        name: 'TraceList',
        component: () => import('@/views/TraceList.vue'),
        meta: { title: '流转溯源', icon: 'Clock' }
      },
      {
        path: 'traces/:specimenNo',
        name: 'TraceDetail',
        component: () => import('@/views/TraceDetail.vue'),
        meta: { title: '溯源详情', hidden: true }
      },
      {
        path: 'users',
        name: 'UserManagement',
        component: () => import('@/views/UserManagement.vue'),
        meta: { title: '用户管理', icon: 'User', roles: ['admin'] }
      },
      {
        path: 'profile',
        name: 'Profile',
        component: () => import('@/views/Profile.vue'),
        meta: { title: '个人中心', hidden: true }
      }
    ]
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    component: () => import('@/views/NotFound.vue'),
    meta: { title: '页面不存在' }
  }
];

const router = createRouter({
  history: createWebHistory(),
  routes
});

router.beforeEach(async (to, from, next) => {
  const userStore = useUserStore();
  document.title = `${to.meta.title || ''} - 古生物化石标本三维建档系统`;

  if (!userStore.loaded && userStore.token) {
    await userStore.fetchUserInfo();
  }

  if (to.meta.requiresAuth && !userStore.isLoggedIn) {
    next({ path: '/login', query: { redirect: to.fullPath } });
    return;
  }

  if (to.meta.roles && userStore.user) {
    const roles = to.meta.roles as string[];
    if (!roles.includes(userStore.user.role)) {
      next('/dashboard');
      return;
    }
  }

  if (to.path === '/login' && userStore.isLoggedIn) {
    next('/dashboard');
    return;
  }

  next();
});

export default router;
