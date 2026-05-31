<template>
  <div class="analysis">
    <div class="page-header">
      <h2>深度分析</h2>
      <div class="header-actions">
        <el-radio-group v-model="timeRange" size="small" @change="handleTimeRangeChange">
          <el-radio-button value="1h">1小时</el-radio-button>
          <el-radio-button value="6h">6小时</el-radio-button>
          <el-radio-button value="24h">24小时</el-radio-button>
          <el-radio-button value="7d">7天</el-radio-button>
        </el-radio-group>
      </div>
    </div>

    <div class="stats-row">
      <StatusCard
        label="信令总量"
        :value="totalSignaling.toLocaleString()"
        status="normal"
        icon="Monitor"
      />
      <StatusCard
        label="平均成功率"
        :value="`${avgSuccessRate}%`"
        status="online"
        icon="CircleCheck"
      />
      <StatusCard
        label="平均延迟"
        :value="`${avgLatency}ms`"
        status="normal"
        icon="Timer"
      />
      <StatusCard
        label="错误率"
        :value="`${errorRateStr}%`"
        :status="errorRate > 5 ? 'error' : 'normal'"
        icon="Warning"
      />
    </div>

    <div class="charts-grid">
      <div class="chart-card">
        <div class="chart-header">
          <h3>成功率趋势</h3>
        </div>
        <SignalingChart
          :option="successRateOption"
          width="100%"
          height="300px"
        />
      </div>

      <div class="chart-card">
        <div class="chart-header">
          <h3>延迟趋势</h3>
        </div>
        <SignalingChart
          :option="latencyOption"
          width="100%"
          height="300px"
        />
      </div>

      <div class="chart-card">
        <div class="chart-header">
          <h3>错误率趋势</h3>
        </div>
        <SignalingChart
          :option="errorRateOption"
          width="100%"
          height="300px"
        />
      </div>

      <div class="chart-card">
        <div class="chart-header">
          <h3>设备信令量排行</h3>
        </div>
        <SignalingChart
          :option="deviceRankOption"
          width="100%"
          height="300px"
        />
      </div>
    </div>

    <div class="full-width-chart">
      <div class="chart-card">
        <div class="chart-header">
          <h3>信令类型时序分析</h3>
        </div>
        <SignalingChart
          :option="typeTimelineOption"
          width="100%"
          height="350px"
        />
      </div>
    </div>

    <div class="analysis-table">
      <RealtimeTable
        title="设备性能指标"
        :data="deviceMetrics"
        :loading="loading"
      >
        <el-table-column prop="deviceName" label="设备名称" width="160" />
        <el-table-column prop="signalingCount" label="信令总数" width="120" align="right" />
        <el-table-column prop="successCount" label="成功数" width="100" align="right" />
        <el-table-column prop="failedCount" label="失败数" width="100" align="right" />
        <el-table-column label="成功率" width="120">
          <template #default="{ row }">
            <div class="rate-cell">
              <span :class="getRateClass(row.successCount, row.signalingCount)">
                {{ ((row.successCount / row.signalingCount) * 100).toFixed(2) }}%
              </span>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="avgLatency" label="平均延迟(ms)" width="140" align="right">
          <template #default="{ row }">
            <span :class="getLatencyClass(row.avgLatency)">
              {{ row.avgLatency }}
            </span>
          </template>
        </el-table-column>
      </RealtimeTable>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useMetricsStore } from '@/stores/metrics'
import { useDeviceStore } from '@/stores/device'
import { useSignalingStore } from '@/stores/signaling'
import StatusCard from '@/components/StatusCard.vue'
import SignalingChart from '@/components/SignalingChart.vue'
import RealtimeTable from '@/components/RealtimeTable.vue'
import type { EChartsOption } from 'echarts'
import type { SeriesOption } from 'echarts'

const metricsStore = useMetricsStore()
const deviceStore = useDeviceStore()
const signalingStore = useSignalingStore()

const loading = ref(false)
const timeRange = ref('24h')

const totalSignaling = computed(() => metricsStore.totalSignaling)
const avgSuccessRate = computed(() => signalingStore.successRate)
const avgLatency = computed(() => metricsStore.avgLatency.toFixed(2))
const errorRate = computed(() => metricsStore.errorRate)
const errorRateStr = computed(() => metricsStore.errorRate.toFixed(2))

const deviceMetrics = computed(() => deviceStore.deviceMetrics)

const successRateOption = computed<EChartsOption>(() => {
  const data = metricsStore.historicalMetrics
  const times = data.map(d => d.timestamp.split(' ')[1] || d.timestamp.split(' ')[0])
  const values = data.map(d => d.successRate)

  return {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(0, 21, 41, 0.9)',
      borderColor: '#1f2d3d',
      textStyle: { color: '#b9c0cc' },
      formatter: '{b}<br/>成功率: {c}%'
    },
    xAxis: {
      type: 'category',
      data: times,
      axisLine: { lineStyle: { color: '#1f2d3d' } },
      axisLabel: { color: '#8b9aae' }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 100,
      axisLine: { lineStyle: { color: '#1f2d3d' } },
      axisLabel: { color: '#8b9aae', formatter: '{value}%' },
      splitLine: { lineStyle: { color: '#1f2d3d', type: 'dashed' } }
    },
    series: [
      {
        type: 'line',
        data: values,
        smooth: true,
        lineStyle: { color: '#67c23a', width: 2 },
        itemStyle: { color: '#67c23a' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(103, 194, 58, 0.3)' },
              { offset: 1, color: 'rgba(103, 194, 58, 0.05)' }
            ]
          }
        },
        markLine: {
          silent: true,
          lineStyle: { color: '#e6a23c', type: 'dashed' },
          data: [{ yAxis: 95, label: { formatter: '阈值 95%', color: '#e6a23c' } }]
        }
      }
    ]
  }
})

const latencyOption = computed<EChartsOption>(() => {
  const data = metricsStore.historicalMetrics
  const times = data.map(d => d.timestamp.split(' ')[1] || d.timestamp.split(' ')[0])
  const values = data.map(d => d.avgLatency)

  return {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(0, 21, 41, 0.9)',
      borderColor: '#1f2d3d',
      textStyle: { color: '#b9c0cc' },
      formatter: '{b}<br/>延迟: {c}ms'
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
      axisLabel: { color: '#8b9aae', formatter: '{value}ms' },
      splitLine: { lineStyle: { color: '#1f2d3d', type: 'dashed' } }
    },
    series: [
      {
        type: 'bar',
        data: values,
        itemStyle: {
          color: (params: any) => {
            if (params.value > 100) return '#f56c6c'
            if (params.value > 50) return '#e6a23c'
            return '#409eff'
          },
          borderRadius: [4, 4, 0, 0]
        }
      }
    ]
  }
})

const errorRateOption = computed<EChartsOption>(() => {
  const data = metricsStore.historicalMetrics
  const times = data.map(d => d.timestamp.split(' ')[1] || d.timestamp.split(' ')[0])
  const values = data.map(d => d.errorRate)

  return {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(0, 21, 41, 0.9)',
      borderColor: '#1f2d3d',
      textStyle: { color: '#b9c0cc' },
      formatter: '{b}<br/>错误率: {c}%'
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
      axisLabel: { color: '#8b9aae', formatter: '{value}%' },
      splitLine: { lineStyle: { color: '#1f2d3d', type: 'dashed' } }
    },
    series: [
      {
        type: 'line',
        data: values,
        smooth: true,
        lineStyle: { color: '#f56c6c', width: 2 },
        itemStyle: { color: '#f56c6c' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(245, 108, 108, 0.3)' },
              { offset: 1, color: 'rgba(245, 108, 108, 0.05)' }
            ]
          }
        }
      }
    ]
  }
})

const deviceRankOption = computed<EChartsOption>(() => {
  const data = [...deviceStore.deviceMetrics]
    .sort((a, b) => b.signalingCount - a.signalingCount)
    .slice(0, 10)

  return {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(0, 21, 41, 0.9)',
      borderColor: '#1f2d3d',
      textStyle: { color: '#b9c0cc' },
      axisPointer: { type: 'shadow' }
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      top: '3%',
      containLabel: true
    },
    xAxis: {
      type: 'value',
      axisLine: { lineStyle: { color: '#1f2d3d' } },
      axisLabel: { color: '#8b9aae' },
      splitLine: { lineStyle: { color: '#1f2d3d', type: 'dashed' } }
    },
    yAxis: {
      type: 'category',
      data: data.map(d => d.deviceName),
      axisLine: { lineStyle: { color: '#1f2d3d' } },
      axisLabel: { color: '#8b9aae' }
    },
    series: [
      {
        type: 'bar',
        data: data.map(d => d.signalingCount),
        itemStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 1, y2: 0,
            colorStops: [
              { offset: 0, color: '#409eff' },
              { offset: 1, color: '#67c23a' }
            ]
          },
          borderRadius: [0, 4, 4, 0]
        }
      }
    ]
  }
})

const typeTimelineOption = computed<EChartsOption>(() => {
  const data = signalingStore.throughputData
  const times = data.map(d => d.timestamp.split(' ')[1] || d.timestamp)
  
  const types = ['SIP', 'H.323', 'MGCP', 'MEGACO', 'SCTP', 'Diameter', 'RADIUS']
  const colors = ['#409eff', '#67c23a', '#e6a23c', '#f56c6c', '#909399', '#8e44ad', '#16a085']
  
  const series = types.map((type, index) => ({
    name: type,
    type: 'line' as const,
    stack: 'total',
    smooth: true,
    lineStyle: { color: colors[index], width: 1 },
    itemStyle: { color: colors[index] },
    areaStyle: {
      color: colors[index],
      opacity: 0.6
    },
    emphasis: {
      focus: 'series' as const
    },
    data: data.map(() => Math.floor(Math.random() * 500) + 100)
  })) as SeriesOption[]

  return {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(0, 21, 41, 0.9)',
      borderColor: '#1f2d3d',
      textStyle: { color: '#b9c0cc' }
    },
    legend: {
      data: types,
      textStyle: { color: '#8b9aae' },
      top: 0
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      top: '15%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
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
    series
  }
})

function getRateClass(success: number, total: number): string {
  const rate = (success / total) * 100
  if (rate >= 99) return 'rate-excellent'
  if (rate >= 95) return 'rate-good'
  if (rate >= 90) return 'rate-warning'
  return 'rate-danger'
}

function getLatencyClass(latency: number): string {
  if (latency < 50) return 'latency-good'
  if (latency < 100) return 'latency-warning'
  return 'latency-danger'
}

async function handleTimeRangeChange(val: string) {
  loading.value = true
  try {
    await Promise.all([
      metricsStore.fetchHistoricalMetrics(val),
      deviceStore.fetchDeviceMetrics(),
      signalingStore.fetchThroughput(val)
    ])
  } finally {
    loading.value = false
  }
}

async function initData() {
  loading.value = true
  try {
    await Promise.all([
      metricsStore.fetchHistoricalMetrics(timeRange.value),
      deviceStore.fetchDeviceMetrics(),
      signalingStore.fetchThroughput(timeRange.value),
      signalingStore.fetchDistribution()
    ])
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  initData()
})
</script>

<style scoped>
.analysis {
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

.stats-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px;
}

.charts-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20px;
}

.chart-card {
  background: #001529;
  border: 1px solid #1f2d3d;
  border-radius: 8px;
  padding: 20px;
}

.chart-header {
  margin-bottom: 16px;
}

.chart-header h3 {
  margin: 0;
  color: #fff;
  font-size: 15px;
  font-weight: 600;
}

.full-width-chart {
  width: 100%;
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

.rate-excellent { color: #67c23a; font-weight: 600; }
.rate-good { color: #409eff; font-weight: 600; }
.rate-warning { color: #e6a23c; font-weight: 600; }
.rate-danger { color: #f56c6c; font-weight: 600; }

.latency-good { color: #67c23a; }
.latency-warning { color: #e6a23c; }
.latency-danger { color: #f56c6c; }

@media (max-width: 1400px) {
  .stats-row {
    grid-template-columns: repeat(2, 1fr);
  }
  
  .charts-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .stats-row {
    grid-template-columns: 1fr;
  }
}
</style>
