import { createRouter, createWebHistory } from 'vue-router'
import Dashboard from '../views/Dashboard.vue'
import NodeList from '../views/NodeList.vue'
import HotNodes from '../views/HotNodes.vue'

const routes = [
  {
    path: '/',
    name: 'Dashboard',
    component: Dashboard
  },
  {
    path: '/nodes',
    name: 'NodeList',
    component: NodeList
  },
  {
    path: '/hot',
    name: 'HotNodes',
    component: HotNodes
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
