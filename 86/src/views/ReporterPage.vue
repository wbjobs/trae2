<template>
  <div class="reporter-page">
    <div class="page-header mb-6">
      <h1 class="text-2xl font-bold text-text-primary mb-2">数据上报配置</h1>
      <p class="text-text-secondary">配置后端服务地址、加密密钥和上报策略</p>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div class="lg:col-span-2">
        <div class="card p-5">
          <h2 class="text-lg font-semibold text-text-primary mb-4">上报服务配置</h2>

          <form @submit.prevent="initReporter" class="space-y-4">
            <div>
              <label class="form-label">
                <span class="flex items-center gap-2">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                  </svg>
                  后端服务地址
                </span>
              </label>
              <div class="flex gap-2">
                <input 
                  v-model="endpointUrl" 
                  type="url" 
                  class="form-input flex-1"
                  placeholder="https://api.example.com/report"
                  :disabled="reporterStore.isInitialized"
                />
                <span 
                  class="px-3 py-2 rounded-lg text-sm font-medium"
                  :class="isHttps ? 'bg-success/20 text-success' : 'bg-warning/20 text-warning'"
                >
                  {{ isHttps ? 'HTTPS' : 'HTTP' }}
                </span>
              </div>
            </div>

            <div>
              <label class="form-label">
                <span class="flex items-center gap-2">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                  </svg>
                  认证令牌 (可选)
                </span>
              </label>
              <div class="relative">
                <input 
                  v-model="authToken" 
                  :type="showToken ? 'text' : 'password'"
                  class="form-input pr-12"
                  placeholder="Bearer eyJhbGciOiJIUzI1NiIs..."
                  :disabled="reporterStore.isInitialized"
                />
                <button 
                  type="button"
                  class="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary"
                  @click="showToken = !showToken"
                >
                  <svg v-if="!showToken" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                </button>
              </div>
            </div>

            <div>
              <label class="form-label">
                <span class="flex items-center gap-2">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  加密密钥 (AES-256-GCM)
                </span>
              </label>
              <div class="flex gap-2">
                <input 
                  v-model="encryptionKey" 
                  :type="showKey ? 'text' : 'password'"
                  class="form-input flex-1"
                  placeholder="32字节十六进制密钥 (64字符)"
                  :disabled="reporterStore.isInitialized"
                />
                <button 
                  type="button"
                  class="btn btn-secondary"
                  @click="generateKey"
                  :disabled="reporterStore.isInitialized"
                >
                  生成密钥
                </button>
                <button 
                  type="button"
                  class="p-2 hover:bg-bg-tertiary rounded-lg"
                  @click="showKey = !showKey"
                >
                  <svg v-if="!showKey" class="w-5 h-5 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  <svg v-else class="w-5 h-5 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                </button>
              </div>
              <p v-if="encryptionKey && encryptionKey.length !== 64" class="text-xs text-warning mt-1">
                密钥应为32字节的十六进制字符串（64个字符）
              </p>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label class="form-label">批量大小</label>
                <input 
                  v-model.number="batchSize" 
                  type="number" 
                  min="1"
                  max="1000"
                  class="form-input"
                  :disabled="reporterStore.isInitialized"
                />
              </div>
              <div>
                <label class="form-label">最大间隔 (ms)</label>
                <input 
                  v-model.number="maxInterval" 
                  type="number" 
                  min="1000"
                  class="form-input"
                  :disabled="reporterStore.isInitialized"
                />
              </div>
              <div>
                <label class="form-label">重试次数</label>
                <input 
                  v-model.number="retryCount" 
                  type="number" 
                  min="0"
                  max="10"
                  class="form-input"
                  :disabled="reporterStore.isInitialized"
                />
              </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="form-label">重试间隔 (ms)</label>
                <input 
                  v-model.number="retryInterval" 
                  type="number" 
                  min="1000"
                  class="form-input"
                  :disabled="reporterStore.isInitialized"
                />
              </div>
              <div>
                <label class="form-label">请求超时 (ms)</label>
                <input 
                  v-model.number="timeout" 
                  type="number" 
                  min="1000"
                  class="form-input"
                  :disabled="reporterStore.isInitialized"
                />
              </div>
            </div>

            <div class="flex items-center gap-4">
              <label class="flex items-center gap-2">
                <input type="checkbox" v-model="useTls" class="form-checkbox" :disabled="true" />
                <span class="text-sm text-text-secondary">使用 TLS 加密传输</span>
              </label>
            </div>

            <div class="flex gap-3 pt-4">
              <button 
                v-if="!reporterStore.isInitialized"
                type="submit" 
                class="btn btn-primary"
                :disabled="!endpointUrl || reporterStore.isReporting"
              >
                <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                初始化上报服务
              </button>
              <button 
                v-if="reporterStore.isInitialized"
                type="button" 
                class="btn btn-error"
                @click="resetReporter"
              >
                <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                重置配置
              </button>
              <button 
                v-if="reporterStore.isInitialized"
                type="button" 
                class="btn btn-secondary"
                @click="sendTestData"
                :disabled="reporterStore.isReporting"
              >
                <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                发送测试数据
              </button>
            </div>
          </form>

          <div v-if="reporterStore.lastError" class="mt-4 p-4 bg-error/10 border border-error/30 rounded-lg">
            <div class="flex items-start gap-3">
              <svg class="w-5 h-5 text-error flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <div class="text-sm font-medium text-error">错误</div>
                <div class="text-sm text-text-secondary">{{ reporterStore.lastError }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="lg:col-span-1">
        <div class="card p-5 mb-6">
          <h2 class="text-lg font-semibold text-text-primary mb-4">服务状态</h2>
          
          <div class="space-y-4">
            <div class="flex items-center justify-between">
              <span class="text-text-secondary">初始化状态</span>
              <span class="status-badge" :class="reporterStore.isInitialized ? 'status-success' : 'status-error'">
                {{ reporterStore.isInitialized ? '已初始化' : '未初始化' }}
              </span>
            </div>
            
            <div class="flex items-center justify-between">
              <span class="text-text-secondary">上报中</span>
              <span class="status-badge" :class="reporterStore.isReporting ? 'status-warning' : 'status-info'">
                {{ reporterStore.isReporting ? '是' : '否' }}
              </span>
            </div>

            <div v-if="reporterStore.reporterStatus" class="space-y-2 pt-2 border-t border-border">
              <div class="flex items-center justify-between">
                <span class="text-text-secondary">总上报次数</span>
                <span class="text-text-primary font-medium">{{ reporterStore.reporterStatus.total_reports }}</span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-text-secondary">成功</span>
                <span class="text-success font-medium">{{ reporterStore.reporterStatus.successful_reports }}</span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-text-secondary">失败</span>
                <span class="text-error font-medium">{{ reporterStore.reporterStatus.failed_reports }}</span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-text-secondary">重试次数</span>
                <span class="text-warning font-medium">{{ reporterStore.reporterStatus.total_retries }}</span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-text-secondary">队列大小</span>
                <span class="text-text-primary font-medium">{{ reporterStore.reporterStatus.queue_size }}</span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-text-secondary">成功率</span>
                <span 
                  class="font-medium"
                  :class="{
                    'text-success': reporterStore.successRate >= 90,
                    'text-warning': reporterStore.successRate >= 70 && reporterStore.successRate < 90,
                    'text-error': reporterStore.successRate < 70,
                  }"
                >
                  {{ reporterStore.successRate }}%
                </span>
              </div>
            </div>

            <div v-if="reporterStore.reporterStatus?.last_report_at" class="pt-2 border-t border-border">
              <div class="text-text-secondary text-sm mb-1">最后上报时间</div>
              <div class="text-text-primary">{{ formatTime(reporterStore.reporterStatus.last_report_at) }}</div>
            </div>

            <div v-if="reporterStore.reporterStatus?.last_error" class="pt-2 border-t border-border">
              <div class="text-text-secondary text-sm mb-1">最后错误</div>
              <div class="text-error text-sm">{{ reporterStore.reporterStatus.last_error }}</div>
            </div>
          </div>

          <div class="mt-4 pt-4 border-t border-border">
            <button 
              class="btn btn-secondary w-full"
              @click="refreshStatus"
              :disabled="!reporterStore.isInitialized"
            >
              <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              刷新状态
            </button>
          </div>
        </div>

        <div v-if="reporterStore.isInitialized && reporterStore.reportQueue.length > 0" class="card p-5">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-lg font-semibold text-text-primary">上报队列</h2>
            <span class="status-badge status-info">{{ reporterStore.reportQueue.length }} 条</span>
          </div>
          
          <div class="space-y-2 max-h-60 overflow-y-auto">
            <div 
              v-for="(item, index) in reporterStore.reportQueue.slice(-10).reverse()" 
              :key="index"
              class="bg-bg-secondary rounded-lg p-3 text-sm"
            >
              <div class="flex items-center justify-between mb-1">
                <span class="text-text-primary font-medium">{{ item.hardware_type }}</span>
                <span class="text-text-secondary text-xs">{{ formatTime(item.collected_at) }}</span>
              </div>
              <div class="text-text-secondary text-xs">
                设备: {{ item.device_id }}
              </div>
            </div>
          </div>

          <div class="mt-4 pt-4 border-t border-border space-y-2">
            <button 
              class="btn btn-primary w-full"
              @click="flushQueue"
              :disabled="reporterStore.isReporting || reporterStore.reportQueue.length === 0"
            >
              <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              立即上报队列
            </button>
            <button 
              class="btn btn-secondary w-full"
              @click="clearQueue"
              :disabled="reporterStore.reportQueue.length === 0"
            >
              <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              清空队列
            </button>
          </div>
        </div>

        <div class="card p-5 mt-6">
          <h2 class="text-lg font-semibold text-text-primary mb-4">加密说明</h2>
          <div class="space-y-3 text-sm text-text-secondary">
            <div class="flex items-start gap-2">
              <svg class="w-4 h-4 text-primary flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <span>使用 AES-256-GCM 算法加密上报数据</span>
            </div>
            <div class="flex items-start gap-2">
              <svg class="w-4 h-4 text-primary flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>密钥为32字节（64字符十六进制），请妥善保管</span>
            </div>
            <div class="flex items-start gap-2">
              <svg class="w-4 h-4 text-primary flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <span>每个数据包使用独立的随机 nonce，确保安全</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAppStore } from '@/stores/app'
import { useReporterStore } from '@/stores/reporter'
import type { HardwareInfo } from '@/types'

const appStore = useAppStore()
const reporterStore = useReporterStore()

const endpointUrl = ref('')
const authToken = ref('')
const encryptionKey = ref('')
const showToken = ref(false)
const showKey = ref(false)
const batchSize = ref(100)
const maxInterval = ref(30000)
const retryCount = ref(3)
const retryInterval = ref(5000)
const timeout = ref(10000)

const isHttps = computed(() => endpointUrl.value.startsWith('https://'))
const useTls = computed(() => isHttps.value)

onMounted(async () => {
  if (reporterStore.isInitialized) {
    await reporterStore.fetchStatus()
  }
})

async function initReporter() {
  try {
    const key = encryptionKey.value.trim() || undefined
    const token = authToken.value.trim() || undefined
    const success = await reporterStore.initReporter(endpointUrl.value, token, key)
    if (success) {
      appStore.success('上报服务初始化成功')
      await reporterStore.fetchStatus()
    } else {
      appStore.error('上报服务初始化失败')
    }
  } catch (error: any) {
    appStore.error(`初始化失败: ${error.message}`)
  }
}

function resetReporter() {
  reporterStore.isInitialized = false
  reporterStore.reporterStatus = null
  reporterStore.clearError()
  reporterStore.clearQueue()
  appStore.info('已重置上报配置')
}

async function generateKey() {
  try {
    const key = await window.encryptionAPI.generateKey()
    encryptionKey.value = key
    appStore.success('已生成加密密钥')
  } catch (error: any) {
    appStore.error(`生成密钥失败: ${error.message}`)
  }
}

async function sendTestData() {
  try {
    const testData: HardwareInfo = {
      device_id: 'test-device',
      hardware_type: 'Test',
      disks: [],
      networks: [],
      collected_at: new Date().toISOString(),
      extra: [['test', 'true'], ['timestamp', Date.now().toString()]],
    }
    const json = JSON.stringify(testData)
    const success = await reporterStore.reportData(json)
    if (success) {
      appStore.success('测试数据上报成功')
    } else {
      appStore.error('测试数据上报失败')
    }
    await reporterStore.fetchStatus()
  } catch (error: any) {
    appStore.error(`上报失败: ${error.message}`)
  }
}

async function refreshStatus() {
  try {
    await reporterStore.fetchStatus()
    appStore.success('状态已刷新')
  } catch (error: any) {
    appStore.error(`刷新失败: ${error.message}`)
  }
}

async function flushQueue() {
  try {
    const success = await reporterStore.flushQueue()
    if (success) {
      appStore.success('队列数据已上报')
    } else {
      appStore.error('队列上报失败')
    }
  } catch (error: any) {
    appStore.error(`上报失败: ${error.message}`)
  }
}

function clearQueue() {
  reporterStore.clearQueue()
  appStore.info('队列已清空')
}

function formatTime(dateStr: string): string {
  try {
    const date = new Date(dateStr)
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    return dateStr
  }
}
</script>

<style scoped>
.reporter-page {
  min-height: 100%;
}
</style>
