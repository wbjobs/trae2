import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { ReporterStatus, HardwareInfo } from '@/types'

export const useReporterStore = defineStore('reporter', () => {
  const reporterStatus = ref<ReporterStatus | null>(null)
  const isInitialized = ref(false)
  const isReporting = ref(false)
  const lastError = ref<string | null>(null)
  const reportQueue = ref<HardwareInfo[]>([])

  const successRate = computed(() => {
    if (!reporterStatus.value || reporterStatus.value.total_reports === 0) {
      return 100
    }
    return Math.round(
      (reporterStatus.value.successful_reports / reporterStatus.value.total_reports) * 100
    )
  })

  async function initReporter(endpointUrl: string, authToken?: string, encryptionKey?: string) {
    try {
      isInitialized.value = false
      lastError.value = null
      const success = await window.reporterAPI.init(endpointUrl, authToken, encryptionKey)
      isInitialized.value = success
      return success
    } catch (error: any) {
      lastError.value = error.message || '初始化上报器失败'
      console.error('[ReporterStore] Init error:', error)
      throw error
    }
  }

  async function reportData(data: string) {
    try {
      isReporting.value = true
      lastError.value = null
      const success = await window.reporterAPI.report(data)
      return success
    } catch (error: any) {
      lastError.value = error.message || '上报数据失败'
      console.error('[ReporterStore] Report error:', error)
      throw error
    } finally {
      isReporting.value = false
    }
  }

  async function reportBatch(dataArray: string[]) {
    try {
      isReporting.value = true
      lastError.value = null
      const success = await window.reporterAPI.reportBatch(dataArray)
      return success
    } catch (error: any) {
      lastError.value = error.message || '批量上报失败'
      console.error('[ReporterStore] Batch error:', error)
      throw error
    } finally {
      isReporting.value = false
    }
  }

  async function queueData(data: HardwareInfo) {
    try {
      reportQueue.value.push(data)
      const json = JSON.stringify(data)
      await window.reporterAPI.queueData(json)
      await fetchStatus()
    } catch (error: any) {
      console.error('[ReporterStore] Queue error:', error)
      throw error
    }
  }

  async function flushQueue() {
    try {
      isReporting.value = true
      lastError.value = null
      const success = await window.reporterAPI.flush()
      if (success) {
        reportQueue.value = []
      }
      await fetchStatus()
      return success
    } catch (error: any) {
      lastError.value = error.message || '刷新队列失败'
      console.error('[ReporterStore] Flush error:', error)
      throw error
    } finally {
      isReporting.value = false
    }
  }

  async function fetchStatus() {
    try {
      reporterStatus.value = await window.reporterAPI.getStatus()
      return reporterStatus.value
    } catch (error: any) {
      console.error('[ReporterStore] Status error:', error)
      throw error
    }
  }

  function clearError() {
    lastError.value = null
  }

  function clearQueue() {
    reportQueue.value = []
  }

  return {
    reporterStatus,
    isInitialized,
    isReporting,
    lastError,
    reportQueue,
    successRate,
    initReporter,
    reportData,
    reportBatch,
    queueData,
    flushQueue,
    fetchStatus,
    clearError,
    clearQueue,
  }
})
