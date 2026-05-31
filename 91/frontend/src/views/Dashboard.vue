<template>
  <div class="dashboard">
    <div class="stats-row">
      <StatusCard
        label="信令吞吐量"
        :value="signalingStore.totalThroughput.toLocaleString()"
        status="normal"
        icon="Monitor"
        :trend="5.2"
      />
      <StatusCard
        label="成功率"
        :value="`${signalingStore.successRate}%`"
        status="online"
        icon="CircleCheck"
        :trend="1.8"
      />
      <StatusCard
        label="在线设备"
        :value="deviceStore.onlineCount"
        status="online"
        icon="Cpu"
      />
      <StatusCard
        label="异常设备"
        :value="deviceStore.errorCount + deviceStore.warningCount"
        status="warning"
        icon="Warning"
        :trend="-2.3"
      />
    </div>

    <div class="charts-row">
      <div class="chart-card">
        <div class="chart-header">
          <h3>实时信令吞吐量</h3>
          <el-radio-group v-model="duration" size="small" @change="handleDurationChange">
            <el-radio-button value="1h">1小时</el-radio-button>
            <el-radio-button value="6h">6小时</el-radio-button>
            <el-radio-button value="24h">24小时</el-radio-button>
          </el-radio-group>
        </div>
        <AsyncChart
          :option="throughputOption"
          width="100%"
          height="320px"
        />
      </div>

      <div class="chart-card">
        <div class="chart-header">
          <h3>信令类型分布</h3>
        </div>
        <SignalingChart
          :option="distributionOption"
          width="100%"
          height="320px"
        />
      </div>
    </div>

    <div class="devices-row">
      <div class="section-header">
        <h3>设备状态概览</h3>
        <el-button type="primary" link @click="$router.push('/devices')">
          查看全部 <el-icon><ArrowRight /></el-icon>
        </el-button>
      </div>
      <div class="device-grid">
        <StatusCard
          v-for="device in displayDevices"
          :key="device.id"
          :label="device.name"
          :value="device.status === 'online' ? '在线' : device.status === 'offline' ? '离线' : device.status === 'warning' ? '告警' : '异常'"
          :status="device.status"
          icon="Cpu"
        />
      </div>
    </div>

    <div class="table-row">
      <AsyncTable
        title="最新信令消息"
        :data="signalingStore.latestMessages"
        :loading="loading"
        :realtime="true"
      >
        <el-table-column label="时间" width="210">
          <template #default="{ row }">
            {{ formatTimestamp(row.timestamp) }}
          </template>
        </el-table-column>
        <el-table-column prop="deviceName" label="设备" width="140" />
        <el-table-column prop="type" label="类型" width="100">
          <template #default="{ row }">
            <el-tag :type="getTypeTag(row.type)" size="small">{{ row.type }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="method" label="方法" width="120" />
        <el-table-column prop="from" label="来源" min-width="150" show-overflow-tooltip />
        <el-table-column prop="to" label="目标" min-width="150" show-overflow-tooltip />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 'success' ? 'success' : row.status === 'failed' ? 'danger' : 'warning'" size="small">
              {{ row.status === 'success' ? '成功' : row.status === 'failed' ? '失败' : '处理中' }}
            </el-tag>
          </template>
        </el-table-column>
      </AsyncTable>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useSignalingStore, useDeviceStore, useMetricsStore } from '@/stores'
import StatusCard from '@/components/StatusCard.vue'
import AsyncChart from '@/components/AsyncChart.vue'
import AsyncTable from '@/components/AsyncTable.vue'
import { ArrowRight } from '@element-plus/icons-vue'
import type { EChartsOption } from 'echarts'
import type { SignalingType } from '@/types'

const signalingStore = useSignalingStore()
const deviceStore = useDeviceStore()
const metricsStore = useMetricsStore()

const loading = ref(false)
const duration = ref('1h')

const displayDevices = computed(() => deviceStore.devices.slice(0, 4))

const throughputOption = computed<EChartsOption>(() => {
  const data = signalingStore.throughputData
  const times = data.map(d => d.timestamp.split(' ')[1] || d.timestamp)
  const counts = data.map(d => d.count)
  const success = data.map(d => d.success)
  const failed = data.map(d => d.failed)

  return {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(0, 21, 41, 0.9)',
      borderColor: '#1f2d3d',
      textStyle: { color: '#b9c0cc' }
    },
    legend: {
      data: ['总量', '成功', '失败'],
      textStyle: { color: '#8b9aae' },
      top: 0
    },
    xAxis: {
      type: 'category',
      data: times,
      axisLine: { lineStyle: { color: '#1f2d3d' } },
      axisLabel: { color: '#8b9aae' }
    },
    yAxis: {
      type: 'value',
      axisLine: { lineStyle: { color: '#1f2d3d' } },
      axisLabel: { color: '#8b9aae' },
      splitLine: { lineStyle: { color: '#1f2d3d', type: 'dashed' } }
    },
    series: [
      {
        name: '总量',
        type: 'line',
        data: counts,
        smooth: true,
        lineStyle: { color: '#409eff', width: 2 },
        itemStyle: { color: '#409eff' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(64, 158, 255, 0.3)' },
              { offset: 1, color: 'rgba(64, 158, 255, 0.05)' }
            ]
          }
        }
      },
      {
        name: '成功',
        type: 'line',
        data: success,
        smooth: true,
        lineStyle: { color: '#67c23a', width: 2 },
        itemStyle: { color: '#67c23a' }
      },
      {
        name: '失败',
        type: 'line',
        data: failed,
        smooth: true,
        lineStyle: { color: '#f56c6c', width: 2 },
        itemStyle: { color: '#f56c6c' }
      }
    ]
  }
})

const distributionOption = computed<EChartsOption>(() => {
  const data = signalingStore.distributionData.map(d => ({
    value: d.count,
    name: d.type
  }))

  return {
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(0, 21, 41, 0.9)',
      borderColor: '#1f2d3d',
      textStyle: { color: '#b9c0cc' },
      formatter: '{b}: {c} ({d}%)'
    },
    legend: {
      orient: 'vertical',
      right: '5%',
      top: 'center',
      textStyle: { color: '#8b9aae' }
    },
    series: [
      {
        type: 'pie',
        radius: ['40%', '70%'],
        center: ['35%', '50%'],
        avoidLabelOverlap: false,
        itemStyle: {
          borderRadius: 8,
          borderColor: '#001529',
          borderWidth: 2
        },
        label: {
          show: false
        },
        emphasis: {
          label: {
            show: true,
            fontSize: 14,
            fontWeight: 'bold',
            color: '#fff'
          }
        },
        data,
        color: ['#409eff', '#67c23a', '#e6a23c', '#f56c6c', '#909399', '#8e44ad', '#16a085', '#d35400']
      }
    ]
  }
})

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp)
  const pad = (n: number) => n.toString().padStart(2, '0')
  const pad3 = (n: number) => n.toString().padStart(3, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad3(date.getMilliseconds())}`
}

function getTypeTag(type: SignalingType): 'primary' | 'success' | 'warning' | 'danger' | 'info' {
  const tagMap: Record<SignalingType, 'primary' | 'success' | 'warning' | 'danger' | 'info'> = {
    'SIP': 'primary',
    'H.323': 'success',
    'MGCP': 'warning',
    'MEGACO': 'danger',
    'SCTP': 'info',
    'Diameter': 'primary',
    'RADIUS': 'success',
    'Other': 'info'
  }
  return tagMap[type] || 'info'
}

async function handleDurationChange(val: string) {
  loading.value = true
  try {
    await signalingStore.fetchThroughput(val)
  } finally {
    loading.value = false
  }
}

async function initData() {
  loading.value = true
  try {
    await Promise.all([
      signalingStore.fetchLatestMessages(20),
      signalingStore.fetchThroughput(duration.value),
      signalingStore.fetchDistribution(),
      deviceStore.fetchDevices()
    ])
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  initData()
  signalingStore.startRealtimeUpdates()
  metricsStore.startRealtimeMonitoring()
})

onBeforeUnmount(() => {
  signalingStore.stopRealtimeUpdates()
  metricsStore.stopRealtimeMonitoring()
})
</script>

<style scoped>
.dashboard {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.stats-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px;
}

.charts-row {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 20px;
}

.chart-card {
  background: #001529;
  border: 1px solid #1f2d3d;
  border-radius: 8px;
  padding: 20px;
}

.chart-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.chart-header h3 {
  margin: 0;
  color: #fff;
  font-size: 15px;
  font-weight: 600;
}

:deep(.el-radio-button__inner) {
  background-color: #001e36;
  border-color: #1f2d3d;
  color: #8b9aae;
}

:deep(.el-radio-button__orig-radio:checked + .el-radio-button__inner) {
  background-color: #409eff;
  border-color: #409eff;
  color: #fff;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.section-header h3 {
  margin: 0;
  color: #fff;
  font-size: 15px;
  font-weight: 600;
}

.device-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px;
}

@media (max-width: 1400px) {
  .stats-row,
  .device-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  
  .charts-row {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .stats-row,
  .device-grid {
    grid-template-columns: 1fr;
  }
}
</style>
