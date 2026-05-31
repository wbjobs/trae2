import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useAppStore = defineStore('app', () => {
  const appVersion = ref<string>('1.0.0')
  const platform = ref<string>('')
  const currentRoute = ref<string>('dashboard')
  const sidebarCollapsed = ref(false)
  const theme = ref<'dark' | 'light'>('dark')
  const notifications = ref<Array<{ id: number; type: string; message: string }>>([])
  const notificationId = ref(0)

  const isWindows = computed(() => platform.value === 'win32')
  const isLinux = computed(() => platform.value === 'linux')

  async function initApp() {
    try {
      ;[appVersion.value, platform.value] = await Promise.all([
        window.appAPI.getVersion(),
        window.appAPI.getPlatform(),
      ])
    } catch (error) {
      console.error('[AppStore] Init error:', error)
    }
  }

  function navigateTo(route: string) {
    currentRoute.value = route
  }

  function toggleSidebar() {
    sidebarCollapsed.value = !sidebarCollapsed.value
  }

  function toggleTheme() {
    theme.value = theme.value === 'dark' ? 'light' : 'dark'
  }

  function addNotification(type: string, message: string) {
    const id = notificationId.value++
    notifications.value.push({ id, type, message })

    setTimeout(() => {
      removeNotification(id)
    }, 5000)
  }

  function removeNotification(id: number) {
    const index = notifications.value.findIndex(n => n.id === id)
    if (index > -1) {
      notifications.value.splice(index, 1)
    }
  }

  function success(message: string) {
    addNotification('success', message)
  }

  function error(message: string) {
    addNotification('error', message)
  }

  function warning(message: string) {
    addNotification('warning', message)
  }

  function info(message: string) {
    addNotification('info', message)
  }

  return {
    appVersion,
    platform,
    currentRoute,
    sidebarCollapsed,
    theme,
    notifications,
    isWindows,
    isLinux,
    initApp,
    navigateTo,
    toggleSidebar,
    toggleTheme,
    addNotification,
    removeNotification,
    success,
    error,
    warning,
    info,
  }
})
