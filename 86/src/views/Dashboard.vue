<template>
  <div class="dashboard h-full flex flex-col gap-6">
    <div class="grid grid-cols-4 gap-5">
      <StatCard
        label="CPU 使用率"
        :value="cpuUsage"
        unit="%"
        :sub-label="cpuInfo?.name"
        :show-progress="true"
        :is-percentage="true"
        icon-color="#4a9eff"
        :icon-bg="'rgba(74, 158, 255, 0.15)'"
      >
        <template #icon>
          <svg class="w-6 h-6" style="color: #4a9eff" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
          </svg>
        </template>
      </StatCard>

      <StatCard
        label="内存使用率"
        :value="memoryUsage"
        unit="%"
        :sub-label="`${hardwareStore.formatBytes(memoryInfo?.used_bytes || 0)} / ${hardwareStore.formatBytes(memoryInfo?.total_bytes || 0)}`"
        :show-progress="true"
        :is-percentage="true"
        icon-color="#52c41a"
        :icon-bg="'rgba(82, 196, 26, 0.15)'"
      >
        <template #icon>
          <svg class="w-6 h-6" style="color: #52c41a" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
        </template>
      </StatCard>

      <StatCard
        label="磁盘使用率"
        :value="maxDiskUsage"
        unit="%"
        :sub-label="`${diskCount} 个磁盘`"
        :show-progress="true"
        :is-percentage="true"
        icon-color="#faad14"
        :icon-bg="'rgba(250, 173, 20, 0.15)'"
      >
        <template #icon>
          <svg class="w-6 h-6" style="color: #faad14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
          </svg>
        </template>
      </StatCard>

      <StatCard
        label="网络流量"
        :value="totalNetworkTraffic"
        :format-bytes="true"
        :sub-label="`${networkCount} 个网络接口`"
        icon-color="#13c2c2"
        :icon-bg="'rgba(19, 194, 194, 0.15)'"
      >
        <template #icon>
          <svg class="w-6 h-6" style="color: #13c2c2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
          </svg>
        </template>
      </StatCard>
    </div>

    <div class="grid grid-cols-2 gap-5 flex-1 min-h-0">
      <div class="card overflow-hidden flex flex-col">
        <div class="card-header">
          <h3 class="card-title">CPU 详情</h3>
          <span class="badge badge-primary">实时</span>
        </div>
        <div class="flex-1 overflow-auto">
          <div v-if="cpuInfo" class="space-y-4">
            <div class="grid grid-cols-2 gap-4">
              <div class="p-3 rounded-lg" :style="{ background: 'var(--bg-secondary)' }">
                <div class="text-xs text-muted">型号</div>
                <div class="text-sm font-medium text-white mt-1 truncate">{{ cpuInfo.name }}</div>
              </div>
              <div class="p-3 rounded-lg" :style="{ background: 'var(--bg-secondary)' }">
                <div class="text-xs text-muted">厂商</div>
                <div class="text-sm font-medium text-white mt-1">{{ cpuInfo.vendor_id }}</div>
              </div>
              <div class="p-3 rounded-lg" :style="{ background: 'var(--bg-secondary)' }">
                <div class="text-xs text-muted">核心数</div>
                <div class="text-sm font-medium text-white mt-1">{{ cpuInfo.cores }} 核 {{ cpuInfo.threads }} 线程</div>
              </div>
              <div class="p-3 rounded-lg" :style="{ background: 'var(--bg-secondary)' }">
                <div class="text-xs text-muted">主频</div>
                <div class="text-sm font-medium text-white mt-1">{{ safeFixed(cpuInfo.frequency_mhz, 0) }} MHz</div>
              </div>
              <div class="p-3 rounded-lg" :style="{ background: 'var(--bg-secondary)' }">
                <div class="text-xs text-muted">L1 缓存</div>
                <div class="text-sm font-medium text-white mt-1">{{ safeFixed(cpuInfo.cache_l1_kb, 0) }} KB</div>
              </div>
              <div class="p-3 rounded-lg" :style="{ background: 'var(--bg-secondary)' }">
                <div class="text-xs text-muted">L3 缓存</div>
                <div class="text-sm font-medium text-white mt-1">{{ safeFixed(cpuInfo.cache_l3_kb / 1024, 1) }} MB</div>
              </div>
            </div>
            <div v-if="cpuInfo.temperature_celsius" class="p-3 rounded-lg" :style="{ background: 'var(--bg-secondary)' }">
              <div class="flex items-center justify-between">
                <span class="text-xs text-muted">温度</span>
                <span
                  class="text-sm font-medium"
                  :class="cpuInfo.temperature_celsius > 80 ? 'text-danger' : cpuInfo.temperature_celsius > 60 ? 'text-warning' : 'text-success'"
                >
                  {{ safeFixed(cpuInfo.temperature_celsius, 1) }}°C
                </span>
              </div>
            </div>
          </div>
          <div v-else class="h-full flex items-center justify-center text-muted">
            暂无 CPU 数据
          </div>
        </div>
      </div>

      <div class="card overflow-hidden flex flex-col">
        <div class="card-header">
          <h3 class="card-title">内存详情</h3>
          <span class="badge badge-primary">实时</span>
        </div>
        <div class="flex-1 overflow-auto">
          <div v-if="memoryInfo" class="space-y-4">
            <div class="space-y-3">
              <div>
                <div class="flex justify-between text-sm mb-1">
                  <span class="text-secondary">物理内存</span>
                  <span class="text-white">{{ hardwareStore.formatBytes(memoryInfo.used_bytes) }} / {{ hardwareStore.formatBytes(memoryInfo.total_bytes) }}</span>
                </div>
                <div class="progress-bar">
                  <div class="progress-fill success" :style="{ width: `${Math.max(0, Math.min(100, memoryInfo.usage_percent || 0))}%` }"></div>
                </div>
              </div>
              <div>
                <div class="flex justify-between text-sm mb-1">
                  <span class="text-secondary">交换空间</span>
                  <span class="text-white">{{ hardwareStore.formatBytes(memoryInfo.swap_used_bytes) }} / {{ hardwareStore.formatBytes(memoryInfo.swap_total_bytes) }}</span>
                </div>
                <div class="progress-bar">
                  <div
                    class="progress-fill"
                    :class="memoryInfo.swap_total_bytes > 0 ? hardwareStore.getStatusClass((memoryInfo.swap_used_bytes / memoryInfo.swap_total_bytes) * 100) : 'primary'"
                    :style="{ width: memoryInfo.swap_total_bytes > 0 ? `${Math.max(0, Math.min(100, (memoryInfo.swap_used_bytes / memoryInfo.swap_total_bytes) * 100))}%` : '0%' }"
                  ></div>
                </div>
              </div>
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div class="p-3 rounded-lg" :style="{ background: 'var(--bg-secondary)' }">
                <div class="text-xs text-muted">可用内存</div>
                <div class="text-sm font-medium text-white mt-1">{{ hardwareStore.formatBytes(memoryInfo.available_bytes) }}</div>
              </div>
              <div class="p-3 rounded-lg" :style="{ background: 'var(--bg-secondary)' }">
                <div class="text-xs text-muted">空闲内存</div>
                <div class="text-sm font-medium text-white mt-1">{{ hardwareStore.formatBytes(memoryInfo.free_bytes) }}</div>
              </div>
              <div v-if="memoryInfo.speed_mhz" class="p-3 rounded-lg" :style="{ background: 'var(--bg-secondary)' }">
                <div class="text-xs text-muted">内存频率</div>
                <div class="text-sm font-medium text-white mt-1">{{ memoryInfo.speed_mhz }} MHz</div>
              </div>
              <div v-if="memoryInfo.slots_total" class="p-3 rounded-lg" :style="{ background: 'var(--bg-secondary)' }">
                <div class="text-xs text-muted">插槽使用</div>
                <div class="text-sm font-medium text-white mt-1">{{ memoryInfo.slots_used }} / {{ memoryInfo.slots_total }}</div>
              </div>
            </div>
          </div>
          <div v-else class="h-full flex items-center justify-center text-muted">
            暂无内存数据
          </div>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-2 gap-5 flex-1 min-h-0">
      <div class="card overflow-hidden flex flex-col">
        <div class="card-header">
          <h3 class="card-title">磁盘列表</h3>
          <span class="badge badge-info">{{ diskCount }} 个磁盘</span>
        </div>
        <div class="flex-1 overflow-auto">
          <div v-if="diskInfo.length > 0" class="space-y-3">
            <div
              v-for="(disk, index) in diskInfo"
              :key="index"
              class="p-4 rounded-lg transition-colors"
              :style="{ background: 'var(--bg-secondary)' }"
            >
              <div class="flex items-center justify-between mb-2">
                <div class="flex items-center gap-2">
                  <svg class="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                  </svg>
                  <span class="font-medium text-white">{{ disk.name || disk.mount_point }}</span>
                  <span v-if="disk.is_removable" class="badge badge-warning">可移动</span>
                </div>
                <span
                  class="text-sm font-medium"
                  :class="disk.usage_percent > 90 ? 'text-danger' : disk.usage_percent > 70 ? 'text-warning' : 'text-success'"
                >
                  {{ safeFixed(disk.usage_percent, 1) }}%
                </span>
              </div>
              <div class="progress-bar mb-2">
                <div class="progress-fill" :class="hardwareStore.getStatusClass(disk.usage_percent)" :style="{ width: `${Math.max(0, Math.min(100, disk.usage_percent || 0))}%` }"></div>
              </div>
              <div class="flex justify-between text-xs text-muted">
                <span>{{ hardwareStore.formatBytes(disk.used_bytes) }} / {{ hardwareStore.formatBytes(disk.total_bytes) }}</span>
                <span>{{ disk.filesystem }} · {{ disk.drive_type }}</span>
              </div>
              <div class="text-xs text-muted mt-1">
                挂载点: {{ disk.mount_point }}
              </div>
            </div>
          </div>
          <div v-else class="h-full flex items-center justify-center text-muted">
            暂无磁盘数据
          </div>
        </div>
      </div>

      <div class="card overflow-hidden flex flex-col">
        <div class="card-header">
          <h3 class="card-title">网络接口</h3>
          <span class="badge badge-info">{{ networkCount }} 个接口</span>
        </div>
        <div class="flex-1 overflow-auto">
          <div v-if="networkInfo.length > 0" class="space-y-3">
            <div
              v-for="(net, index) in networkInfo"
              :key="index"
              class="p-4 rounded-lg transition-colors"
              :style="{ background: 'var(--bg-secondary)' }"
            >
              <div class="flex items-center justify-between mb-2">
                <div class="flex items-center gap-2">
                  <span class="status-dot" :class="net.is_up ? 'success' : 'unknown'"></span>
                  <span class="font-medium text-white">{{ net.interface_name }}</span>
                </div>
                <span class="badge" :class="net.is_up ? 'badge-success' : 'badge-danger'">
                  {{ net.is_up ? '已连接' : '未连接' }}
                </span>
              </div>
              <div class="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span class="text-muted">MAC 地址:</span>
                  <span class="text-white ml-2 font-mono text-xs">{{ net.mac_address }}</span>
                </div>
                <div>
                  <span class="text-muted">接收:</span>
                  <span class="text-white ml-2">{{ hardwareStore.formatBytes(net.rx_bytes) }}</span>
                </div>
                <div>
                  <span class="text-muted">发送:</span>
                  <span class="text-white ml-2">{{ hardwareStore.formatBytes(net.tx_bytes) }}</span>
                </div>
                <div>
                  <span class="text-muted">数据包:</span>
                  <span class="text-white ml-2">{{ (net.rx_packets + net.tx_packets).toLocaleString() }}</span>
                </div>
              </div>
            </div>
          </div>
          <div v-else class="h-full flex items-center justify-center text-muted">
            暂无网络数据
          </div>
        </div>
      </div>
    </div>

    <div v-if="hardwareStore.history.length > 0" class="card">
      <div class="card-header">
        <h3 class="card-title">使用趋势 (最近 60 条记录)</h3>
        <div class="flex items-center gap-4">
          <div class="flex items-center gap-2">
            <span class="w-3 h-3 rounded-full" style="background: #4a9eff"></span>
            <span class="text-xs text-muted">CPU</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="w-3 h-3 rounded-full" style="background: #52c41a"></span>
            <span class="text-xs text-muted">内存</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="w-3 h-3 rounded-full" style="background: #faad14"></span>
            <span class="text-xs text-muted">磁盘</span>
          </div>
        </div>
      </div>
      <div class="h-32 flex items-end gap-1">
        <div
          v-for="(record, index) in hardwareStore.history"
          :key="index"
          class="flex-1 flex flex-col gap-0.5"
        >
          <div class="w-full bg-primary opacity-80 rounded-t" :style="{ height: `${record.cpu_usage}%` }"></div>
          <div class="w-full bg-success opacity-80" :style="{ height: `${record.memory_usage}%` }"></div>
          <div class="w-full bg-warning opacity-80 rounded-b" :style="{ height: `${record.disk_usage}%` }"></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useHardwareStore } from '@/stores/hardware'
import { useAppStore } from '@/stores/app'
import StatCard from '@/components/common/StatCard.vue'

const hardwareStore = useHardwareStore()
const appStore = useAppStore()

const cpuInfo = computed(() => hardwareStore.latestCpuInfo)
const memoryInfo = computed(() => hardwareStore.latestMemoryInfo)
const diskInfo = computed(() => hardwareStore.latestDiskInfo)
const networkInfo = computed(() => hardwareStore.latestNetworkInfo)

const cpuUsage = computed(() => {
  const val = cpuInfo.value?.usage_percent
  return typeof val === 'number' && Number.isFinite(val) ? Math.max(0, Math.min(100, val)) : 0
})

const memoryUsage = computed(() => {
  const val = memoryInfo.value?.usage_percent
  return typeof val === 'number' && Number.isFinite(val) ? Math.max(0, Math.min(100, val)) : 0
})

const maxDiskUsage = computed(() => {
  if (diskInfo.value.length === 0) return 0
  const values = diskInfo.value
    .map(d => d.usage_percent)
    .filter(v => typeof v === 'number' && Number.isFinite(v))
  if (values.length === 0) return 0
  return Math.max(0, Math.min(100, Math.max(...values)))
})

const totalNetworkTraffic = computed(() => {
  return networkInfo.value.reduce((sum, net) => {
    const rx = Number.isFinite(net.rx_bytes) && net.rx_bytes >= 0 ? net.rx_bytes : 0
    const tx = Number.isFinite(net.tx_bytes) && net.tx_bytes >= 0 ? net.tx_bytes : 0
    return sum + rx + tx
  }, 0)
})

function safeFixed(num: number | undefined | null, digits: number = 0): string {
  if (num === undefined || num === null || !Number.isFinite(num)) {
    return '0'
  }
  return num.toFixed(digits)
}
const diskCount = computed(() => diskInfo.value.length)
const networkCount = computed(() => networkInfo.value.length)

onMounted(async () => {
  try {
    if (!hardwareStore.isInitialized) {
      await hardwareStore.initHardware()
    }
    await hardwareStore.collectParallel()
  } catch (error: any) {
    appStore.error('数据采集失败: ' + error.message)
  }
})
</script>

<style scoped>
.dashboard {
  min-height: 0;
}

.overflow-auto {
  scrollbar-width: thin;
  scrollbar-color: var(--border-color) var(--bg-secondary);
}
</style>
