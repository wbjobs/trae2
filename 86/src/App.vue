<template>
  <div class="app-container h-full w-full flex">
    <Sidebar />
    <div class="main-content flex-1 flex flex-col overflow-hidden">
      <Header />
      <main class="content flex-1 overflow-auto p-6">
        <Dashboard v-if="appStore.currentRoute === 'dashboard'" />
        <ConfigPage v-else-if="appStore.currentRoute === 'config'" />
        <ReporterPage v-else-if="appStore.currentRoute === 'reporter'" />
        <SchedulePage v-else-if="appStore.currentRoute === 'schedule'" />
      </main>
    </div>
    <NotificationList />
    <AlertPopup
      :visible="alertStore.showPopup"
      :alerts="alertStore.activeAlerts"
      @close="alertStore.closePopup()"
      @dismiss-all="alertStore.dismissAll()"
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useAppStore } from '@/stores/app'
import { useHardwareStore } from '@/stores/hardware'
import { useAlertStore } from '@/stores/alert'
import Sidebar from '@/components/layout/Sidebar.vue'
import Header from '@/components/layout/Header.vue'
import NotificationList from '@/components/common/NotificationList.vue'
import AlertPopup from '@/components/common/AlertPopup.vue'
import Dashboard from '@/views/Dashboard.vue'
import ConfigPage from '@/views/ConfigPage.vue'
import ReporterPage from '@/views/ReporterPage.vue'
import SchedulePage from '@/views/SchedulePage.vue'

const appStore = useAppStore()
const hardwareStore = useHardwareStore()
const alertStore = useAlertStore()

onMounted(async () => {
  try {
    await appStore.initApp()
    await hardwareStore.fetchSystemInfo()
    appStore.info('应用已启动')
  } catch (error) {
    console.error('App init error:', error)
    appStore.error('应用初始化失败')
  }
})
</script>

<style scoped>
.app-container {
  background: linear-gradient(135deg, var(--bg-primary) 0%, var(--bg-secondary) 100%);
}

.main-content {
  min-width: 0;
}

.content {
  background: transparent;
}
</style>
