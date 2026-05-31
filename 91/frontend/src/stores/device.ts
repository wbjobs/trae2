import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Device } from '@/types'
import { deviceApi } from '@/api/device'
import { mockDevices } from '@/mock/data'

export const useDeviceStore = defineStore('device', () => {
  const devices = ref<Device[]>([])
  const loading = ref(false)

  const onlineCount = computed(() => devices.value.filter(d => d.status === 'online').length)
  const offlineCount = computed(() => devices.value.filter(d => d.status === 'offline').length)
  const warningCount = computed(() => devices.value.filter(d => d.status === 'warning').length)
  const errorCount = computed(() => devices.value.filter(d => d.status === 'error').length)

  async function fetchDevices() {
    try {
      const data = await deviceApi.getDeviceList()
      devices.value = data
    } catch (error) {
      console.warn('API不可用，使用Mock数据:', error)
      devices.value = mockDevices
    }
  }

  function updateDeviceStatus(id: string, status: Device['status']) {
    const device = devices.value.find(d => d.id === id)
    if (device) {
      device.status = status
    }
  }

  return {
    devices,
    loading,
    onlineCount,
    offlineCount,
    warningCount,
    errorCount,
    fetchDevices,
    updateDeviceStatus
  }
})
