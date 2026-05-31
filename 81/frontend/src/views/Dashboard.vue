<template>
  <div class="dashboard">
    <el-row :gutter="20">
      <el-col :span="6">
        <el-card class="stat-card">
          <div class="stat-content">
            <div class="stat-icon total">
              <el-icon><Cpu /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ statistics.total || 0 }}</div>
              <div class="stat-label">节点总数</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card">
          <div class="stat-content">
            <div class="stat-icon online">
              <el-icon><CircleCheck /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ statistics.online || 0 }}</div>
              <div class="stat-label">在线节点</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card">
          <div class="stat-content">
            <div class="stat-icon warning">
              <el-icon><Warning /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ statistics.warning || 0 }}</div>
              <div class="stat-label">告警节点</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card">
          <div class="stat-content">
            <div class="stat-icon offline">
              <el-icon><CircleClose /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ statistics.offline || 0 }}</div>
              <div class="stat-label">离线节点</div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20" style="margin-top: 20px 0">
      <el-col :span="12">
        <el-card>
          <template #header>
            <span>CPU 使用率分布</span>
          </template>
          <div ref="cpuChartRef" class="chart-container"></div>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card>
          <template #header>
            <span>内存使用率分布</span>
          </template>
          <div ref="memoryChartRef" class="chart-container"></div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20" style="margin-top: 20px 0">
      <el-col :span="24">
        <el-card>
          <template #header>
            <div class="card-header">
              <span>实时节点状态</span>
              <span class="update-hint">数据通过WebSocket实时更新</span>
            </div>
          </template>
          <el-table :data="displayNodes" stripe height="300">
            <el-table-column prop="nodeId" label="节点ID" width="180"></el-table-column>
            <el-table-column prop="groupId" label="分组" width="150"></el-table-column>
            <el-table-column prop="region" label="区域" width="120"></el-table-column>
            <el-table-column prop="cpu" label="CPU(%)" width="120">
              <template #default="scope">
                <el-progress :percentage="scope.row.cpu" :stroke-width="10" :color="getCpuColor(scope.row.cpu)"></el-progress>
              </template>
            </el-table-column>
            <el-table-column prop="memory" label="内存(%)" width="120">
              <template #default="scope">
                <el-progress :percentage="scope.row.memory" :stroke-width="10" :color="getCpuColor(scope.row.memory)"></el-progress>
              </template>
            </el-table-column>
            <el-table-column prop="bandwidth" label="带宽(Mbps)" width="120"></el-table-column>
            <el-table-column prop="status" label="状态" width="100">
              <template #default="scope">
                <el-tag :type="getStatusType(scope.row.status)">
                  {{ getStatusText(scope.row.status) }}
                </el-tag>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, inject } from 'vue'
import { getStatistics } from '../api'
import * as echarts from 'echarts'
import { Cpu, CircleCheck, Warning, CircleClose } from '@element-plus/icons-vue'

const statistics = ref({})
const realtimeNodes = inject('realtimeNodes', ref([]))
const cpuChartRef = ref(null)
const memoryChartRef = ref(null)
let cpuChart = null
let memoryChart = null
let statsTimer = null
let chartTimer = null

const displayNodes = computed(() => {
  return realtimeNodes.value.filter(n => n.status !== 'offline').slice(0, 20)
})

function getStatusType(status) {
  const types = {
    online: 'success',
    offline: 'danger',
    warning: 'warning'
  }
  return types[status] || 'info'
}

function getStatusText(status) {
  const texts = {
    online: '在线',
    offline: '离线',
    warning: '告警'
  }
  return texts[status] || '未知'
}

function getCpuColor(value) {
  if (value > 80) return '#f56c6c'
  if (value > 60) return '#e6a23c'
  return '#67c23a'
}

async function loadStatistics() {
  try {
    const res = await getStatistics()
    if (res.data && res.data.success) {
      statistics.value = res.data.data
    }
  } catch (error) {
    console.error('加载统计数据失败:', error)
  }
}

function initCharts() {
  if (!cpuChartRef.value || !memoryChartRef.value) return

  cpuChart = echarts.init(cpuChartRef.value)
  memoryChart = echarts.init(memoryChartRef.value)

  const commonOption = {
    tooltip: { trigger: 'axis' },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: { type: 'category', data: [] },
    yAxis: { type: 'value', max: 100 },
    series: [{ data: [], type: 'bar' }]
  }

  cpuChart.setOption({
    ...commonOption,
    series: [{ ...commonOption.series[0], itemStyle: { color: '#409EFF' } }]
  })

  memoryChart.setOption({
    ...commonOption,
    series: [{ ...commonOption.series[0], itemStyle: { color: '#67C23A' } }]
  })
}

function updateCharts() {
  if (!cpuChart || !memoryChart) return

  const nodes = realtimeNodes.value.slice(0, 10)
  const nodeNames = nodes.map(n => n.nodeId)
  const cpuData = nodes.map(n => n.cpu || 0)
  const memoryData = nodes.map(n => n.memory || 0)

  cpuChart.setOption({
    xAxis: { data: nodeNames },
    series: [{ data: cpuData }]
  })

  memoryChart.setOption({
    xAxis: { data: nodeNames },
    series: [{ data: memoryData }]
  })
}

watch(realtimeNodes, () => {
  updateCharts()
}, { deep: false })

function handleResize() {
  cpuChart?.resize()
  memoryChart?.resize()
}

onMounted(() => {
  loadStatistics()
  initCharts()

  statsTimer = setInterval(loadStatistics, 10000)

  chartTimer = setInterval(updateCharts, 5000)

  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  if (statsTimer) {
    clearInterval(statsTimer)
    statsTimer = null
  }
  if (chartTimer) {
    clearInterval(chartTimer)
    chartTimer = null
  }
  window.removeEventListener('resize', handleResize)

  cpuChart?.dispose()
  memoryChart?.dispose()
  cpuChart = null
  memoryChart = null
})
</script>

<style scoped>
.dashboard {
  padding: 0;
}

.stat-card {
  margin-bottom: 20px;
}

.stat-content {
  display: flex;
  align-items: center;
}

.stat-icon {
  width: 60px;
  height: 60px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  color: white;
  margin-right: 15px;
}

.stat-icon.total {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.stat-icon.online {
  background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
}

.stat-icon.warning {
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
}

.stat-icon.offline {
  background: linear-gradient(135deg, #eb3349 0%, #f45c43 100%);
}

.stat-info {
  flex: 1;
}

.stat-value {
  font-size: 28px;
  font-weight: bold;
  color: #303133;
}

.stat-label {
  font-size: 14px;
  color: #909399;
  margin-top: 5px;
}

.chart-container {
  height: 300px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.update-hint {
  font-size: 12px;
  color: #909399;
}
</style>
