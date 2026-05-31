import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {
  CollectionResult,
  CollectorStatus,
  SystemInfo,
  HardwareInfo,
  CpuInfo,
  MemoryInfo,
  DiskInfo,
  NetworkInfo,
  HistoryRecord,
} from '@/types'
import { useAlertStore } from '@/stores/alert'

const MAX_RESULTS = 20
const MAX_HISTORY = 60

export const useHardwareStore = defineStore('hardware', () => {
  const systemInfo = ref<SystemInfo | null>(null)
  const collectionResults = ref<CollectionResult[]>([])
  const collectorStatus = ref<CollectorStatus | null>(null)
  const isCollecting = ref(false)
  const isInitialized = ref(false)
  const lastError = ref<string | null>(null)
  const history = ref<HistoryRecord[]>([])
  const collectionInterval = ref<number | null>(null)

  const latestCpuInfo = computed<CpuInfo | null>(() => {
    for (const result of collectionResults.value) {
      if (result.data?.cpu) {
        return result.data.cpu
      }
    }
    return null
  })

  const latestMemoryInfo = computed<MemoryInfo | null>(() => {
    for (const result of collectionResults.value) {
      if (result.data?.memory) {
        return result.data.memory
      }
    }
    return null
  })

  const latestDiskInfo = computed<DiskInfo[]>(() => {
    const latestDiskResult = collectionResults.value
      .slice()
      .reverse()
      .find(r => r.data?.disks && r.data.disks.length > 0)
    return latestDiskResult?.data?.disks ?? []
  })

  const latestNetworkInfo = computed<NetworkInfo[]>(() => {
    const latestNetworkResult = collectionResults.value
      .slice()
      .reverse()
      .find(r => r.data?.networks && r.data.networks.length > 0)
    return latestNetworkResult?.data?.networks ?? []
  })

  const aggregatedData = computed<HardwareInfo | null>(() => {
    if (collectionResults.value.length === 0) return null

    const firstResult = collectionResults.value[0]
    if (!firstResult.data) return null

    const aggregated: HardwareInfo = {
      device_id: firstResult.data.device_id,
      hardware_type: 'Unknown',
      disks: [],
      networks: [],
      external_devices: [],
      sensors: [],
      collected_at: firstResult.collected_at,
      extra: [],
    }

    const seenCpu = new Set<string>()
    const seenMemory = new Set<string>()
    const seenMotherboard = new Set<string>()

    for (const result of collectionResults.value) {
      if (!result.data) continue

      if (result.data.cpu && !seenCpu.has(result.data.device_id)) {
        aggregated.cpu = result.data.cpu
        aggregated.hardware_type = 'Cpu'
        seenCpu.add(result.data.device_id)
      }
      if (result.data.memory && !seenMemory.has(result.data.device_id)) {
        aggregated.memory = result.data.memory
        seenMemory.add(result.data.device_id)
      }
      if (result.data.motherboard && !seenMotherboard.has(result.data.device_id)) {
        aggregated.motherboard = result.data.motherboard
        seenMotherboard.add(result.data.device_id)
      }
      if (result.data.disks.length > 0 && aggregated.disks.length === 0) {
        aggregated.disks = result.data.disks
      }
      if (result.data.networks.length > 0 && aggregated.networks.length === 0) {
        aggregated.networks = result.data.networks
      }
      aggregated.external_devices.push(...result.data.external_devices)
      aggregated.sensors.push(...result.data.sensors)
      aggregated.extra.push(...result.data.extra)
    }

    return aggregated
  })

  const successCount = computed(() => {
    return collectionResults.value.filter(r => r.success).length
  })

  const errorCount = computed(() => {
    return collectionResults.value.filter(r => !r.success).length
  })

  async function initHardware() {
    try {
      lastError.value = null
      isInitialized.value = await window.hardwareAPI.init()
      return isInitialized.value
    } catch (error: any) {
      lastError.value = error.message || '初始化失败'
      console.error('[HardwareStore] Init error:', error)
      return false
    }
  }

  async function collectOnce() {
    try {
      lastError.value = null
      const results = await window.hardwareAPI.collectOnce()
      collectionResults.value = results.slice(0, MAX_RESULTS)
      updateHistory(results)
      checkAlertsFromResults(results)
      return results
    } catch (error: any) {
      lastError.value = error.message || '采集失败'
      console.error('[HardwareStore] Collect error:', error)
      throw error
    }
  }

  async function collectParallel() {
    try {
      lastError.value = null
      const results = await window.hardwareAPI.collectParallel()
      collectionResults.value = results.slice(0, MAX_RESULTS)
      updateHistory(results)
      checkAlertsFromResults(results)
      return results
    } catch (error: any) {
      lastError.value = error.message || '并行采集失败'
      console.error('[HardwareStore] Collect parallel error:', error)
      throw error
    }
  }

  async function fetchSystemInfo() {
    try {
      systemInfo.value = await window.hardwareAPI.getSystemInfo()
      return systemInfo.value
    } catch (error: any) {
      console.error('[HardwareStore] System info error:', error)
      throw error
    }
  }

  async function fetchCollectorStatus() {
    try {
      collectorStatus.value = await window.hardwareAPI.getCollectorStatus()
      return collectorStatus.value
    } catch (error: any) {
      console.error('[HardwareStore] Status error:', error)
      throw error
    }
  }

  function startAutoCollect(intervalMs: number = 5000) {
    if (collectionInterval.value) {
      stopAutoCollect()
    }

    isCollecting.value = true
    let tickCount = 0

    collectionInterval.value = window.setInterval(async () => {
      try {
        await collectParallel()
        tickCount++
        if (tickCount % 6 === 0) {
          await fetchCollectorStatus()
        }
      } catch (error) {
        console.error('[HardwareStore] Auto collect error:', error)
      }
    }, intervalMs)
  }

  function stopAutoCollect() {
    if (collectionInterval.value) {
      clearInterval(collectionInterval.value)
      collectionInterval.value = null
    }
    isCollecting.value = false
  }

  function updateHistory(results: CollectionResult[]) {
    let cpuUsage = 0
    let memoryUsage = 0
    let diskUsage = 0

    for (const result of results) {
      if (result.data?.cpu) {
        cpuUsage = Math.max(cpuUsage, result.data.cpu.usage_percent)
      }
      if (result.data?.memory) {
        memoryUsage = Math.max(memoryUsage, result.data.memory.usage_percent)
      }
      if (result.data?.disks) {
        for (const disk of result.data.disks) {
          diskUsage = Math.max(diskUsage, disk.usage_percent)
        }
      }
    }

    history.value.push({
      timestamp: new Date().toISOString(),
      cpu_usage: cpuUsage,
      memory_usage: memoryUsage,
      disk_usage: diskUsage,
    })

    if (history.value.length > MAX_HISTORY) {
      history.value = history.value.slice(-MAX_HISTORY)
    }
  }

  function checkAlertsFromResults(results: CollectionResult[]) {
    const alertStore = useAlertStore()
    let cpuUsage: number | undefined
    let cpuTemp: number | undefined
    let memoryUsage: number | undefined
    const diskUsages: number[] = []

    for (const result of results) {
      if (result.data?.cpu) {
        cpuUsage = result.data.cpu.usage_percent
        cpuTemp = result.data.cpu.temperature_celsius
      }
      if (result.data?.memory) {
        memoryUsage = result.data.memory.usage_percent
      }
      if (result.data?.disks) {
        for (const disk of result.data.disks) {
          diskUsages.push(disk.usage_percent)
        }
      }
    }

    alertStore.checkAlerts(cpuUsage, cpuTemp, memoryUsage, diskUsages)
  }

  function clearData() {
    collectionResults.value = []
    history.value = []
    lastError.value = null
  }

  function formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes < 0) return '0 B'
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    const index = Math.min(i, sizes.length - 1)
    return parseFloat((bytes / Math.pow(k, index)).toFixed(2)) + ' ' + sizes[index]
  }

  function formatTime(seconds: number): string {
    const days = Math.floor(seconds / 86400)
    const hours = Math.floor((seconds % 86400) / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60

    const parts: string[] = []
    if (days > 0) parts.push(`${days}天`)
    if (hours > 0) parts.push(`${hours}小时`)
    if (minutes > 0) parts.push(`${minutes}分钟`)
    parts.push(`${secs}秒`)

    return parts.join(' ')
  }

  function getStatusClass(usage: number): string {
    if (usage >= 90) return 'danger'
    if (usage >= 70) return 'warning'
    return 'success'
  }

  return {
    systemInfo,
    collectionResults,
    collectorStatus,
    isCollecting,
    isInitialized,
    lastError,
    history,
    latestCpuInfo,
    latestMemoryInfo,
    latestDiskInfo,
    latestNetworkInfo,
    aggregatedData,
    successCount,
    errorCount,
    initHardware,
    collectOnce,
    collectParallel,
    fetchSystemInfo,
    fetchCollectorStatus,
    startAutoCollect,
    stopAutoCollect,
    clearData,
    formatBytes,
    formatTime,
    getStatusClass,
  }
})
