<template>
  <div class="device-list">
    <div class="page-header">
      <h2>设备管理</h2>
      <div class="header-actions">
        <el-input
          v-model="searchKeyword"
          placeholder="搜索设备名称/IP"
          clearable
          style="width: 240px"
          @keyup.enter="handleSearch"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
        <el-button type="primary" @click="handleSearch">
          <el-icon><Search /></el-icon>
          搜索
        </el-button>
      </div>
    </div>

    <div class="stats-cards">
      <StatusCard label="设备总数" :value="deviceStore.devices.length" status="normal" icon="Cpu" />
      <StatusCard label="在线" :value="deviceStore.onlineCount" status="online" icon="CircleCheck" />
      <StatusCard label="离线" :value="deviceStore.offlineCount" status="offline" icon="CircleClose" />
      <StatusCard label="告警" :value="deviceStore.warningCount" status="warning" icon="Warning" />
      <StatusCard label="异常" :value="deviceStore.errorCount" status="error" icon="Warning" />
    </div>

    <div class="table-card">
      <el-table
        :data="filteredDevices"
        style="width: 100%"
        v-loading="loading"
        stripe
      >
        <el-table-column prop="name" label="设备名称" min-width="160">
          <template #default="{ row }">
            <div class="device-name">
              <el-icon :size="18" color="#409eff"><Cpu /></el-icon>
              <span>{{ row.name }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="ip" label="IP地址" width="160" />
        <el-table-column prop="type" label="设备类型" width="140" />
        <el-table-column prop="location" label="位置" width="140" />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="getStatusTag(row.status)" size="small">
              {{ getStatusText(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="资源使用" width="200">
          <template #default="{ row }">
            <div class="resource-info">
              <div class="resource-item">
                <span class="label">CPU</span>
                <el-progress
                  :percentage="row.cpuUsage"
                  :stroke-width="8"
                  :color="getProgressColor(row.cpuUsage)"
                  :show-text="false"
                  style="width: 80px"
                />
                <span class="value">{{ row.cpuUsage }}%</span>
              </div>
              <div class="resource-item">
                <span class="label">内存</span>
                <el-progress
                  :percentage="row.memoryUsage"
                  :stroke-width="8"
                  :color="getProgressColor(row.memoryUsage)"
                  :show-text="false"
                  style="width: 80px"
                />
                <span class="value">{{ row.memoryUsage }}%</span>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="signalingCount" label="信令数" width="100" align="right" />
        <el-table-column prop="lastHeartbeat" label="最后心跳" width="180" />
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="handleView(row)">
              查看
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="detailVisible" title="设备详情" width="600px">
      <div v-if="currentDevice" class="detail-content">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="设备名称">{{ currentDevice.name }}</el-descriptions-item>
          <el-descriptions-item label="IP地址">{{ currentDevice.ip }}</el-descriptions-item>
          <el-descriptions-item label="设备类型">{{ currentDevice.type }}</el-descriptions-item>
          <el-descriptions-item label="位置">{{ currentDevice.location }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="getStatusTag(currentDevice.status)" size="small">
              {{ getStatusText(currentDevice.status) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="信令数">{{ currentDevice.signalingCount }}</el-descriptions-item>
          <el-descriptions-item label="CPU使用率">{{ currentDevice.cpuUsage }}%</el-descriptions-item>
          <el-descriptions-item label="内存使用率">{{ currentDevice.memoryUsage }}%</el-descriptions-item>
          <el-descriptions-item label="最后心跳" :span="2">{{ currentDevice.lastHeartbeat }}</el-descriptions-item>
        </el-descriptions>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useDeviceStore } from '@/stores/device'
import StatusCard from '@/components/StatusCard.vue'
import { Search, Cpu } from '@element-plus/icons-vue'
import type { Device, DeviceStatus } from '@/types'

const deviceStore = useDeviceStore()

const loading = ref(false)
const searchKeyword = ref('')
const detailVisible = ref(false)
const currentDevice = ref<Device | null>(null)

const filteredDevices = computed(() => {
  if (!searchKeyword.value) return deviceStore.devices
  const keyword = searchKeyword.value.toLowerCase()
  return deviceStore.devices.filter(
    d => d.name.toLowerCase().includes(keyword) || d.ip.includes(keyword)
  )
})

function getStatusTag(status: DeviceStatus): 'success' | 'info' | 'warning' | 'danger' {
  const tagMap: Record<DeviceStatus, 'success' | 'info' | 'warning' | 'danger'> = {
    online: 'success',
    offline: 'info',
    warning: 'warning',
    error: 'danger'
  }
  return tagMap[status]
}

function getStatusText(status: DeviceStatus): string {
  const textMap: Record<DeviceStatus, string> = {
    online: '在线',
    offline: '离线',
    warning: '告警',
    error: '异常'
  }
  return textMap[status]
}

function getProgressColor(value: number): string {
  if (value >= 90) return '#f56c6c'
  if (value >= 70) return '#e6a23c'
  return '#67c23a'
}

function handleSearch() {
  // 已通过computed实现
}

function handleView(row: Device) {
  currentDevice.value = row
  detailVisible.value = true
}

onMounted(() => {
  deviceStore.fetchDevices()
})
</script>

<style scoped>
.device-list {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.page-header h2 {
  margin: 0;
  color: #fff;
  font-size: 20px;
}

.header-actions {
  display: flex;
  gap: 12px;
}

:deep(.el-input__wrapper) {
  background-color: #001e36;
  border-color: #1f2d3d;
}

:deep(.el-input__inner) {
  color: #b9c0cc;
}

.stats-cards {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 16px;
}

.table-card {
  background: #001529;
  border: 1px solid #1f2d3d;
  border-radius: 8px;
  overflow: hidden;
}

:deep(.el-table) {
  --el-table-bg-color: #001529;
  --el-table-tr-bg-color: #001529;
  --el-table-text-color: #b9c0cc;
  --el-table-header-bg-color: #001e36;
  --el-table-header-text-color: #8b9aae;
  --el-table-border-color: #1f2d3d;
  --el-table-row-hover-bg-color: #001e36;
  --el-table-stripe-bg-color: #001830;
}

:deep(.el-table th) {
  background-color: #001e36;
}

:deep(.el-table td),
:deep(.el-table th.is-leaf) {
  border-bottom: 1px solid #1f2d3d;
}

.device-name {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #fff;
}

.resource-info {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.resource-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.resource-item .label {
  width: 36px;
  font-size: 12px;
  color: #8b9aae;
}

.resource-item .value {
  width: 40px;
  font-size: 12px;
  color: #b9c0cc;
}

.detail-content {
  color: #b9c0cc;
}

:deep(.el-descriptions) {
  --el-descriptions-item-label-color: #8b9aae;
  --el-descriptions-text-color: #b9c0cc;
  --el-descriptions-border-color: #1f2d3d;
  --el-descriptions-item-bg-color: #001e36;
}

:deep(.el-dialog) {
  --el-dialog-bg-color: #001529;
  --el-dialog-border-color: #1f2d3d;
  --el-text-color-primary: #fff;
  --el-text-color-regular: #b9c0cc;
}

:deep(.el-dialog__header) {
  border-bottom: 1px solid #1f2d3d;
}

:deep(.el-dialog__footer) {
  border-top: 1px solid #1f2d3d;
}

:deep(.el-form-item__label) {
  color: #8b9aae;
}

:deep(.el-input__wrapper),
:deep(.el-select__wrapper) {
  background-color: #001e36;
  border-color: #1f2d3d;
}

@media (max-width: 1400px) {
  .stats-cards {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (max-width: 768px) {
  .stats-cards {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
