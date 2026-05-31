import { createRouter, createWebHashHistory } from 'vue-router'
import Layout from '@/views/Layout.vue'

const routes = [
  {
    path: '/',
    component: Layout,
    redirect: '/dashboard',
    children: [
      {
        path: 'dashboard',
        name: 'Dashboard',
        component: () => import('@/views/Dashboard.vue'),
        meta: { title: '数据总览', icon: 'DataAnalysis' }
      },
      {
        path: 'germplasm',
        name: 'Germplasm',
        component: () => import('@/views/Germplasm.vue'),
        meta: { title: '种质资源管理', icon: 'Collection' }
      },
      {
        path: 'germplasm/new',
        name: 'GermplasmNew',
        component: () => import('@/views/GermplasmForm.vue'),
        meta: { title: '登记种质资源', icon: 'Plus' }
      },
      {
        path: 'germplasm/edit/:id',
        name: 'GermplasmEdit',
        component: () => import('@/views/GermplasmForm.vue'),
        meta: { title: '编辑种质资源', icon: 'Edit' }
      },
      {
        path: 'germplasm/detail/:id',
        name: 'GermplasmDetail',
        component: () => import('@/views/GermplasmDetail.vue'),
        meta: { title: '种质资源详情', icon: 'View' }
      },
      {
        path: 'trait',
        name: 'Trait',
        component: () => import('@/views/Trait.vue'),
        meta: { title: '性状观测记录', icon: 'Document' }
      },
      {
        path: 'trait/new',
        name: 'TraitNew',
        component: () => import('@/views/TraitForm.vue'),
        meta: { title: '新增性状记录', icon: 'Plus' }
      },
      {
        path: 'trait/analysis',
        name: 'TraitAnalysis',
        component: () => import('@/views/TraitAnalysis.vue'),
        meta: { title: '性状年度对比分析', icon: 'TrendCharts' }
      },
      {
        path: 'classification',
        name: 'Classification',
        component: () => import('@/views/Classification.vue'),
        meta: { title: '资源分类管理', icon: 'Menu' }
      },
      {
        path: 'image',
        name: 'Image',
        component: () => import('@/views/Image.vue'),
        meta: { title: '田间影像管理', icon: 'Picture' }
      },
      {
        path: 'distribution',
        name: 'Distribution',
        component: () => import('@/views/DistributionMap.vue'),
        meta: { title: '资源分布热力图', icon: 'Location' }
      }
    ]
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export default router
