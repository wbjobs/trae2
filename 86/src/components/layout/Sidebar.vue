<template>
  <aside
    class="sidebar h-full flex flex-col transition-all duration-300 ease-in-out"
    :class="{ 'w-64': !appStore.sidebarCollapsed, 'w-20': appStore.sidebarCollapsed }"
    :style="{ background: 'var(--bg-secondary)', borderRight: '1px solid var(--border-color)' }"
  >
    <div class="logo h-16 flex items-center justify-center border-b" :style="{ borderColor: 'var(--border-color)' }">
      <div v-if="!appStore.sidebarCollapsed" class="flex items-center gap-3">
        <div
          class="w-10 h-10 rounded-lg flex items-center justify-center"
          :style="{ background: 'linear-gradient(135deg, var(--primary-color), var(--info-color))' }"
        >
          <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
          </svg>
        </div>
        <div>
          <div class="font-bold text-white">Hardware Monitor</div>
          <div class="text-xs text-secondary">v{{ appStore.appVersion }}</div>
        </div>
      </div>
      <div v-else class="w-10 h-10 rounded-lg flex items-center justify-center" :style="{ background: 'var(--primary-color)' }">
        <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
        </svg>
      </div>
    </div>

    <nav class="nav-menu flex-1 py-4 overflow-y-auto">
      <div class="px-4 mb-2">
        <div v-if="!appStore.sidebarCollapsed" class="text-xs font-semibold uppercase tracking-wider text-muted mb-3">
          主菜单
        </div>
      </div>

      <div
        v-for="item in menuItems"
        :key="item.id"
        class="menu-item flex items-center gap-3 px-4 py-3 cursor-pointer transition-all duration-200 mx-2 rounded-lg"
        :class="{
          'active': appStore.currentRoute === item.id
        }"
        :style="{
          background: appStore.currentRoute === item.id ? 'rgba(74, 158, 255, 0.15)' : 'transparent',
          borderLeft: appStore.currentRoute === item.id ? '3px solid var(--primary-color)' : '3px solid transparent'
        }"
        @click="navigateTo(item.id)"
      >
        <div class="icon flex-shrink-0 w-5 h-5" :style="{ color: appStore.currentRoute === item.id ? 'var(--primary-color)' : 'var(--text-secondary)' }">
          <component :is="item.icon" />
        </div>
        <span v-if="!appStore.sidebarCollapsed" class="text-sm font-medium" :style="{ color: appStore.currentRoute === item.id ? 'var(--primary-color)' : 'var(--text-secondary)' }">
          {{ item.label }}
        </span>
      </div>
    </nav>

    <div class="system-info p-4 border-t" :style="{ borderColor: 'var(--border-color)' }">
      <div v-if="!appStore.sidebarCollapsed && hardwareStore.systemInfo" class="text-xs">
        <div class="flex items-center gap-2 mb-2">
          <span class="status-dot success"></span>
          <span class="text-secondary">{{ hardwareStore.systemInfo.os_name }}</span>
        </div>
        <div class="text-muted truncate">{{ hardwareStore.systemInfo.hostname }}</div>
        <div class="text-muted mt-1">
          运行时间: {{ hardwareStore.formatTime(hardwareStore.systemInfo.uptime_seconds) }}
        </div>
      </div>
      <div v-else-if="hardwareStore.systemInfo" class="flex justify-center">
        <span class="status-dot success" title="系统运行中"></span>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { h } from 'vue'
import { useAppStore } from '@/stores/app'
import { useHardwareStore } from '@/stores/hardware'

const appStore = useAppStore()
const hardwareStore = useHardwareStore()

const DashboardIcon = () => h('svg', {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  'stroke-width': '2',
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round'
}, [
  h('rect', { x: '3', y: '3', width: '7', height: '9', rx: '1' }),
  h('rect', { x: '14', y: '3', width: '7', height: '5', rx: '1' }),
  h('rect', { x: '14', y: '12', width: '7', height: '9', rx: '1' }),
  h('rect', { x: '3', y: '16', width: '7', height: '5', rx: '1' })
])

const ConfigIcon = () => h('svg', {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  'stroke-width': '2',
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round'
}, [
  h('circle', { cx: '12', cy: '12', r: '3' }),
  h('path', { d: 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z' })
])

const ReporterIcon = () => h('svg', {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  'stroke-width': '2',
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round'
}, [
  h('path', { d: 'M4 4v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6H6a2 2 0 0 0-2 2z' }),
  h('polyline', { points: '14 2 14 8 20 8' }),
  h('line', { x1: '16', y1: '13', x2: '8', y2: '13' }),
  h('line', { x1: '16', y1: '17', x2: '8', y2: '17' }),
  h('line', { x1: '10', y1: '9', x2: '8', y2: '9' })
])

const ScheduleIcon = () => h('svg', {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  'stroke-width': '2',
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round'
}, [
  h('circle', { cx: '12', cy: '12', r: '10' }),
  h('polyline', { points: '12 6 12 12 16 14' })
])

const menuItems = [
  { id: 'dashboard', label: '监控仪表板', icon: DashboardIcon },
  { id: 'config', label: '配置管理', icon: ConfigIcon },
  { id: 'reporter', label: '数据上报', icon: ReporterIcon },
  { id: 'schedule', label: '定时调度', icon: ScheduleIcon },
]

function navigateTo(route: string) {
  appStore.navigateTo(route)
}
</script>

<style scoped>
.sidebar {
  box-shadow: 2px 0 8px rgba(0, 0, 0, 0.1);
}

.menu-item:hover {
  background: rgba(74, 158, 255, 0.08) !important;
}

.menu-item.active .icon {
  color: var(--primary-color);
}

.logo {
  box-shadow: 0 1px 0 var(--border-color);
}
</style>
