import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { MetricsData } from '@/types'
import { metricsApi } from '@/api/metrics'
import { generateMetricsData } from '@/mock/data'

export const useMetricsStore = defineStore('metrics', () => {
  const realtimeMetrics = ref<MetricsData | null>(null)
  const historicalMetrics = ref<MetricsData[]>([])
  const isConnected = ref(false)

  const avgLatency = computed(() => realtimeMetrics.value?.avgLatency || 0)
  const errorRate = computed(() => realtimeMetrics.value?.errorRate || 0)
  const totalSignaling = computed(() => realtimeMetrics.value?.totalSignaling || 0)

  let mockInterval: ReturnType<typeof setInterval> | null = null

  async function fetchHistoricalMetrics(duration: string = '24h') {
    try {
      const data = await metricsApi.getHistoricalMetrics(duration)
      historicalMetrics.value = data
    } catch (error) {
      console.warn('API不可用，使用Mock数据:', error)
      const count = duration === '1h' ? 60 : duration === '6h' ? 72 : duration === '24h' ? 96 : 60
      historicalMetrics.value = generateMetricsData(count)
    }
    if (historicalMetrics.value.length > 0) {
      realtimeMetrics.value = historicalMetrics.value[historicalMetrics.value.length - 1]
    }
  }

  function generateMockRealtimeData() {
    const now = new Date()
    const successRate = 95 + Math.random() * 4.5
    const errorRate = 100 - successRate
    const data: MetricsData = {
      timestamp: now.toISOString().replace('T', ' ').substring(0, 19),
      totalSignaling: Math.floor(Math.random() * 5000) + 1000,
      successRate: Number(successRate.toFixed(2)),
      avgLatency: Number((Math.random() * 80 + 20).toFixed(2)),
      errorRate: Number(errorRate.toFixed(2))
    }
    return data
  }

  function startRealtimeMonitoring() {
    const socket = metricsApi.connect()

    socket.on('connect', () => {
      isConnected.value = true
      if (mockInterval) {
        clearInterval(mockInterval)
        mockInterval = null
      }
    })

    socket.on('disconnect', () => {
      isConnected.value = false
      if (!mockInterval) {
        startMockRealtime()
      }
    })

    socket.on('connect_error', () => {
      if (!mockInterval) {
        startMockRealtime()
      }
    })

    metricsApi.onRealtimeMetrics((data) => {
      realtimeMetrics.value = data
      historicalMetrics.value.push(data)
      if (historicalMetrics.value.length > 100) {
        historicalMetrics.value.shift()
      }
    })

    if (!socket.connected) {
      startMockRealtime()
    }
  }

  function startMockRealtime() {
    isConnected.value = true
    mockInterval = setInterval(() => {
      const data = generateMockRealtimeData()
      realtimeMetrics.value = data
      historicalMetrics.value.push(data)
      if (historicalMetrics.value.length > 100) {
        historicalMetrics.value.shift()
      }
    }, 5000)
  }

  function stopRealtimeMonitoring() {
    metricsApi.disconnect()
    isConnected.value = false
    if (mockInterval) {
      clearInterval(mockInterval)
      mockInterval = null
    }
  }

  function getMetricsByTimeRange(startTime: string, endTime: string): MetricsData[] {
    const start = new Date(startTime).getTime()
    const end = new Date(endTime).getTime()
    return historicalMetrics.value.filter(m => {
      const t = new Date(m.timestamp).getTime()
      return t >= start && t <= end
    })
  }

  return {
    realtimeMetrics,
    historicalMetrics,
    isConnected,
    avgLatency,
    errorRate,
    totalSignaling,
    fetchHistoricalMetrics,
    startRealtimeMonitoring,
    stopRealtimeMonitoring,
    getMetricsByTimeRange
  }
})
