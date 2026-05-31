import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { SignalingMessage, ThroughputData, SignalingDistribution, TraceQueryParams, PaginatedResult } from '@/types'
import { signalingApi } from '@/api/signaling'
import { metricsApi } from '@/api/metrics'
import { generateThroughputData, mockDistribution, generateLatestMessages, generateTraceQueryResult } from '@/mock/data'

const MAX_MESSAGES = 100

export const useSignalingStore = defineStore('signaling', () => {
  const latestMessages = ref<SignalingMessage[]>([])
  const messageIdSet = ref<Set<string>>(new Set())
  const throughputData = ref<ThroughputData[]>([])
  const distributionData = ref<SignalingDistribution[]>([])
  const queryResult = ref<PaginatedResult<SignalingMessage> | null>(null)
  const loading = ref(false)

  function sortMessagesByTimestamp(messages: SignalingMessage[]): SignalingMessage[] {
    return [...messages].sort((a, b) => b.timestamp - a.timestamp)
  }

  const totalThroughput = computed(() => {
    return throughputData.value.reduce((sum, item) => sum + item.count, 0)
  })

  const successRate = computed(() => {
    const total = totalThroughput.value
    if (total === 0) return 0
    const success = throughputData.value.reduce((sum, item) => sum + item.success, 0)
    return Number(((success / total) * 100).toFixed(2))
  })

  async function fetchLatestMessages(count: number = 20) {
    try {
      const data = await signalingApi.getRealtimeMessages()
      latestMessages.value = sortMessagesByTimestamp(data).slice(0, count)
      messageIdSet.value = new Set(latestMessages.value.map(m => m.id))
    } catch (error) {
      console.warn('API不可用，使用Mock数据:', error)
      const data = generateLatestMessages(count)
      latestMessages.value = sortMessagesByTimestamp(data)
      messageIdSet.value = new Set(latestMessages.value.map(m => m.id))
    }
  }

  async function fetchThroughput(interval: string = '1m', startTime?: string, endTime?: string) {
    try {
      const data = await signalingApi.getMetrics(interval, startTime, endTime)
      throughputData.value = data
    } catch (error) {
      console.warn('API不可用，使用Mock数据:', error)
      throughputData.value = generateThroughputData(1)
    }
  }

  async function fetchDistribution() {
    try {
      const data = await signalingApi.getTypeDistribution()
      distributionData.value = data
    } catch (error) {
      console.warn('API不可用，使用Mock数据:', error)
      distributionData.value = mockDistribution
    }
  }

  async function queryTrace(params: TraceQueryParams) {
    loading.value = true
    try {
      const data = await signalingApi.queryTrace(params)
      queryResult.value = data
      return data
    } catch (error) {
      console.warn('API不可用，使用Mock数据:', error)
      const result = generateTraceQueryResult(params.page || 1, params.pageSize || 20)
      queryResult.value = result
      return result
    } finally {
      loading.value = false
    }
  }

  function startRealtimeUpdates() {
    metricsApi.onRealtimeThroughput((data) => {
      throughputData.value.push(data)
      if (throughputData.value.length > 60) {
        throughputData.value.shift()
      }
    })

    metricsApi.onRealtimeMetrics((data: any) => {
      if (data.type || data.method) {
        addMessage(data as SignalingMessage)
      }
    })
  }

  function stopRealtimeUpdates() {
    metricsApi.disconnect()
  }

  function ensureTimestampIsNumber(message: any): SignalingMessage {
    return {
      ...message,
      timestamp: typeof message.timestamp === 'string'
        ? new Date(message.timestamp).getTime()
        : Number(message.timestamp)
    }
  }

  function addMessage(message: any) {
    const normalizedMessage = ensureTimestampIsNumber(message)

    if (messageIdSet.value.has(normalizedMessage.id)) {
      return
    }

    messageIdSet.value.add(normalizedMessage.id)
    latestMessages.value.push(normalizedMessage)

    latestMessages.value = sortMessagesByTimestamp(latestMessages.value)

    if (latestMessages.value.length > MAX_MESSAGES) {
      const removedMessages = latestMessages.value.splice(MAX_MESSAGES)
      removedMessages.forEach(m => messageIdSet.value.delete(m.id))
    }
  }

  return {
    latestMessages,
    throughputData,
    distributionData,
    queryResult,
    loading,
    totalThroughput,
    successRate,
    fetchLatestMessages,
    fetchThroughput,
    fetchDistribution,
    queryTrace,
    startRealtimeUpdates,
    stopRealtimeUpdates,
    addMessage
  }
})
