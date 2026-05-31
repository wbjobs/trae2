<template>
  <header
    class="header h-16 flex items-center justify-between px-6 border-b flex-shrink-0"
    :style="{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }"
  >
    <div class="left flex items-center gap-4">
      <button
        class="w-10 h-10 rounded-lg flex items-center justify-center transition-all hover:bg-hover"
        :style="{ background: 'var(--bg-tertiary)' }"
        @click="appStore.toggleSidebar"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" :style="{ color: 'var(--text-secondary)' }">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      <div>
        <h1 class="text-lg font-semibold text-white">{{ currentPageTitle }}</h1>
        <div class="text-xs text-secondary">{{ currentPageSubtitle }}</div>
      </div>
    </div>

    <div class="right flex items-center gap-4">
      <div v-if="hardwareStore.systemInfo" class="flex items-center gap-4 mr-4">
        <div class="text-right">
          <div class="text-xs text-muted">系统</div>
          <div class="text-sm font-medium text-white">{{ hardwareStore.systemInfo.os_name }}</div>
        </div>
        <div class="w-px h-8" :style="{ background: 'var(--border-color)' }"></div>
        <div class="text-right">
          <div class="text-xs text-muted">架构</div>
          <div class="text-sm font-medium text-white">{{ hardwareStore.systemInfo.architecture }}</div>
        </div>
      </div>

      <div
        class="status-indicator flex items-center gap-2 px-3 py-1.5 rounded-full"
        :style="{ background: hardwareStore.isCollecting ? 'rgba(82, 196, 26, 0.15)' : 'rgba(108, 111, 147, 0.15)' }"
      >
        <span
          class="status-dot"
          :class="{ 'success animate-pulse': hardwareStore.isCollecting, 'unknown': !hardwareStore.isCollecting }"
        ></span>
        <span class="text-sm font-medium" :style="{ color: hardwareStore.isCollecting ? 'var(--success-color)' : 'var(--text-muted)' }">
          {{ hardwareStore.isCollecting ? '采集中' : '已停止' }}
        </span>
      </div>

      <button
        class="w-10 h-10 rounded-lg flex items-center justify-center transition-all"
        :class="hardwareStore.isCollecting ? 'btn-danger' : 'btn-success'"
        :title="hardwareStore.isCollecting ? '停止采集' : '开始采集'"
        @click="toggleCollection"
      >
        <svg v-if="!hardwareStore.isCollecting" class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M8 5v14l11-7z"/>
        </svg>
        <svg v-else class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
        </svg>
      </button>

      <button
        class="w-10 h-10 rounded-lg flex items-center justify-center transition-all"
        :style="{ background: 'var(--bg-tertiary)' }"
        title="刷新数据"
        @click="refreshData"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" :style="{ color: 'var(--text-secondary)' }">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      </button>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { useAppStore } from '@/stores/app'
import { useHardwareStore } from '@/stores/hardware'

const appStore = useAppStore()
const hardwareStore = useHardwareStore()

const currentPageTitle = computed(() => {
  const titles: Record<string, string> = {
    dashboard: '硬件监控仪表板',
    config: '配置管理',
    reporter: '数据上报配置',
  }
  return titles[appStore.currentRoute] || 'Hardware Monitor'
})

const currentPageSubtitle = computed(() => {
  const subtitles: Record<string, string> = {
    dashboard: '实时监控系统硬件状态',
    config: '管理采集规则和设备配置',
    reporter: '配置数据上报服务',
  }
  return subtitles[appStore.currentRoute] || ''
})

async function toggleCollection() {
  if (hardwareStore.isCollecting) {
    hardwareStore.stopAutoCollect()
    appStore.info('已停止数据采集')
  } else {
    if (!hardwareStore.isInitialized) {
      await hardwareStore.initHardware()
    }
    hardwareStore.startAutoCollect(5000)
    appStore.success('已开始数据采集')
  }
}

async function refreshData() {
  try {
    if (!hardwareStore.isInitialized) {
      await hardwareStore.initHardware()
    }
    await hardwareStore.collectParallel()
    await hardwareStore.fetchSystemInfo()
    appStore.success('数据已刷新')
  } catch (error: any) {
    appStore.error('数据刷新失败: ' + error.message)
  }
}

function handleRefreshEvent() {
  refreshData()
}

function handleStartEvent() {
  if (!hardwareStore.isCollecting) {
    toggleCollection()
  }
}

function handleStopEvent() {
  if (hardwareStore.isCollecting) {
    toggleCollection()
  }
}

function handleClearEvent() {
  hardwareStore.clearData()
  appStore.info('数据已清空')
}

let unregisterRefresh: (() => void) | null = null
let unregisterStart: (() => void) | null = null
let unregisterStop: (() => void) | null = null
let unregisterClear: (() => void) | null = null

onMounted(() => {
  if (window.eventAPI) {
    unregisterRefresh = window.eventAPI.onActionRefresh(handleRefreshEvent)
    unregisterStart = window.eventAPI.onActionStart(handleStartEvent)
    unregisterStop = window.eventAPI.onActionStop(handleStopEvent)
    unregisterClear = window.eventAPI.onActionClear(handleClearEvent)
  }
})

onUnmounted(() => {
  unregisterRefresh?.()
  unregisterStart?.()
  unregisterStop?.()
  unregisterClear?.()
})
</script>

<style scoped>
.header {
  box-shadow: 0 1px 0 var(--border-color);
}

button:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-sm);
}
</style>
