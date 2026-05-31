<template>
  <div class="basin-comparison">
    <div class="comparison-header">
      <div class="comparison-title">
        <el-icon><Rank /></el-icon>
        <span>多流域对比分析</span>
      </div>
      <div class="comparison-controls">
        <el-select v-model="selectedValueField" size="small" style="width: 120px" @change="handleFieldChange">
          <el-option label="水位" value="waterLevel" />
          <el-option label="流速" value="flowVelocity" />
          <el-option label="雨量" value="rainfall" />
        </el-select>
        <el-select v-model="chartType" size="small" style="width: 120px; margin-left: 10px" @change="handleChartTypeChange">
          <el-option label="趋势对比" value="trend" />
          <el-option label="统计对比" value="stats" />
          <el-option label="相关性矩阵" value="correlation" />
        </el-select>
        <el-button size="small" type="primary" @click="refreshData" :loading="loading">
          <el-icon><Refresh /></el-icon>
          刷新
        </el-button>
      </div>
    </div>

    <div class="comparison-content">
      <div v-if="chartType === 'trend'" ref="trendChartRef" class="chart-container"></div>

      <div v-else-if="chartType === 'stats'" class="stats-comparison">
        <el-table :data="comparisonTableData" border stripe style="width: 100%">
          <el-table-column prop="basinName" label="流域" width="120" fixed />
          <el-table-column prop="dataCount" label="数据量" width="100" align="center" />
          <el-table-column prop="mean" label="平均值" width="100" align="center" />
          <el-table-column prop="max" label="最大值" width="100" align="center" />
          <el-table-column prop="min" label="最小值" width="100" align="center" />
          <el-table-column prop="stdDev" label="标准差" width="100" align="center" />
          <el-table-column prop="trend" label="趋势" width="100" align="center">
            <template #default="scope">
              <el-tag :type="getTrendType(scope.row.trend)" size="small">
                {{ getTrendText(scope.row.trend) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="100" fixed="right">
            <template #default="scope">
              <el-button size="small" @click="viewDetail(scope.row)">详情</el-button>
            </template>
          </el-table-column>
        </el-table>

        <div class="summary-cards" v-if="comparisonSummary">
          <el-card shadow="hover" class="summary-card">
            <div class="card-content">
              <el-icon class="card-icon highest"><TrendCharts /></el-icon>
              <div class="card-info">
                <div class="card-label">最高均值流域</div>
                <div class="card-value">{{ comparisonSummary.highestMean || '-' }}</div>
              </div>
            </div>
          </el-card>
          <el-card shadow="hover" class="summary-card">
            <div class="card-content">
              <el-icon class="card-icon lowest"><TrendCharts /></el-icon>
              <div class="card-info">
                <div class="card-label">最低均值流域</div>
                <div class="card-value">{{ comparisonSummary.lowestMean || '-' }}</div>
              </div>
            </div>
          </el-card>
          <el-card shadow="hover" class="summary-card">
            <div class="card-content">
              <el-icon class="card-icon range"><DataLine /></el-icon>
              <div class="card-info">
                <div class="card-label">均值极差</div>
                <div class="card-value">{{ comparisonSummary.meanRange }} {{ unit }}</div>
              </div>
            </div>
          </el-card>
        </div>
      </div>

      <div v-else-if="chartType === 'correlation'" ref="correlationChartRef" class="chart-container"></div>
    </div>

    <el-dialog
      v-model="detailDialogVisible"
      :title="`${selectedDetail?.basinName || ''} 详情`"
      width="600px"
    >
      <div v-if="selectedDetail" class="detail-content">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="数据量">{{ selectedDetail.dataCount }}</el-descriptions-item>
          <el-descriptions-item label="统计方法">Z-Score</el-descriptions-item>
          <el-descriptions-item label="平均值">{{ selectedDetail.mean }} {{ unit }}</el-descriptions-item>
          <el-descriptions-item label="中位数">{{ selectedDetail.median }} {{ unit }}</el-descriptions-item>
          <el-descriptions-item label="最大值">{{ selectedDetail.max }} {{ unit }}</el-descriptions-item>
          <el-descriptions-item label="最小值">{{ selectedDetail.min }} {{ unit }}</el-descriptions-item>
          <el-descriptions-item label="标准差">{{ selectedDetail.stdDev }} {{ unit }}</el-descriptions-item>
          <el-descriptions-item label="极差">{{ selectedDetail.range }} {{ unit }}</el-descriptions-item>
          <el-descriptions-item label="趋势方向">
            <el-tag :type="getTrendType(selectedDetail.trend)">
              {{ getTrendText(selectedDetail.trend) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="变化速率">{{ selectedDetail.slope }}</el-descriptions-item>
        </el-descriptions>

        <el-divider>百分位数分布</el-divider>

        <div class="percentile-grid" v-if="selectedDetail.percentile">
          <div class="percentile-item" v-for="(value, key) in selectedDetail.percentile" :key="key">
            <div class="percentile-label">{{ key }}</div>
            <div class="percentile-value">{{ value }} {{ unit }}</div>
          </div>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, computed, nextTick } from 'vue'
import * as echarts from 'echarts'
import { ElMessage } from 'element-plus'
import { Rank, Refresh, TrendCharts, DataLine } from '@element-plus/icons-vue'
import { comparisonAnalysis } from '@/services/comparisonAnalysis'
import { performanceUtils } from '@/utils/performance'

const props = defineProps({
  basinDataList: {
    type: Array,
    default: () => []
  },
  defaultValueField: {
    type: String,
    default: 'waterLevel'
  }
})

const emit = defineEmits(['fieldChange', 'refresh'])

const trendChartRef = ref(null)
const correlationChartRef = ref(null)
const trendChartInstance = ref(null)
const correlationChartInstance = ref(null)
const loading = ref(false)
const selectedValueField = ref(props.defaultValueField)
const chartType = ref('trend')
const detailDialogVisible = ref(false)
const selectedDetail = ref(null)

const comparisonResult = ref(null)
const comparisonSummary = ref(null)

const unitMap = {
  waterLevel: 'm',
  flowVelocity: 'm/s',
  rainfall: 'mm'
}

const unit = computed(() => unitMap[selectedValueField.value] || '')

const comparisonTableData = computed(() => {
  if (!comparisonResult.value) return []

  return comparisonResult.value.comparisons.map(c => ({
    basinName: c.basinName,
    dataCount: c.dataCount,
    mean: c.stats?.mean || '-',
    max: c.stats?.max || '-',
    min: c.stats?.min || '-',
    stdDev: c.stats?.stdDev || '-',
    median: c.stats?.median || '-',
    range: c.stats?.range || '-',
    trend: c.trend?.trend || 'stable',
    slope: c.trend?.slope || 0,
    percentile: c.percentile
  }))
})

const runComparison = performanceUtils.debounce(() => {
  if (props.basinDataList.length === 0) {
    comparisonResult.value = null
    comparisonSummary.value = null
    return
  }

  const result = comparisonAnalysis.compareBasinStats(
    props.basinDataList,
    selectedValueField.value
  )

  comparisonResult.value = result
  comparisonSummary.value = result.summary

  renderCharts()
}, 300)

const initTrendChart = () => {
  if (!trendChartRef.value) return
  trendChartInstance.value = echarts.init(trendChartRef.value)
}

const initCorrelationChart = () => {
  if (!correlationChartRef.value) return
  correlationChartInstance.value = echarts.init(correlationChartRef.value)
}

const renderTrendChart = () => {
  if (!trendChartInstance.value || props.basinDataList.length === 0) return

  const { categories, series } = comparisonAnalysis.prepareComparisonChartData(
    props.basinDataList,
    selectedValueField.value
  )

  const option = {
    animation: categories.length < 500,
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' }
    },
    legend: {
      data: series.map(s => s.name),
      top: 0
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '12%',
      top: '15%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: categories,
      boundaryGap: false,
      axisLabel: {
        rotate: 45,
        fontSize: 10,
        interval: Math.max(0, Math.floor(categories.length / 20) - 1)
      }
    },
    yAxis: {
      type: 'value',
      name: unit.value,
      nameTextStyle: { color: '#666', fontSize: 12 }
    },
    series,
    dataZoom: [
      { type: 'inside', start: 0, end: 100 },
      { type: 'slider', start: 0, end: 100, height: 20, bottom: 5 }
    ]
  }

  try {
    trendChartInstance.value.setOption(option, true)
  } catch (error) {
    console.error('Trend comparison chart error:', error)
  }
}

const renderCorrelationChart = () => {
  if (!correlationChartInstance.value || props.basinDataList.length === 0) return

  const dataSets = props.basinDataList.map(basin => ({
    name: basin.basinName,
    data: basin.data || [],
    valueField: selectedValueField.value
  }))

  const { matrix, labels } = comparisonAnalysis.calculateCorrelationMatrix(dataSets)

  const option = {
    tooltip: {
      position: 'top',
      formatter: (params) => {
        const [x, y, value] = params.value
        return `${labels[x]} ↔ ${labels[y]}<br/>相关系数: ${value.toFixed(4)}`
      }
    },
    grid: {
      left: '15%',
      right: '10%',
      bottom: '15%',
      top: '10%'
    },
    xAxis: {
      type: 'category',
      data: labels,
      splitArea: { show: true }
    },
    yAxis: {
      type: 'category',
      data: labels,
      splitArea: { show: true }
    },
    visualMap: {
      min: -1,
      max: 1,
      calculable: true,
      orient: 'horizontal',
      left: 'center',
      bottom: '5%',
      inRange: {
        color: ['#d73027', '#f46d43', '#fdae61', '#fee090', '#ffffbf', '#e0f3f8', '#abd9e9', '#74add1', '#4575b4', '#313695']
      }
    },
    series: [{
      name: '相关系数',
      type: 'heatmap',
      data: matrix.flatMap((row, i) => row.map((value, j) => [i, j, value])),
      label: { show: true, fontSize: 10 },
      emphasis: {
        itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0, 0, 0, 0.5)' }
      }
    }]
  }

  try {
    correlationChartInstance.value.setOption(option, true)
  } catch (error) {
    console.error('Correlation chart error:', error)
  }
}

const renderCharts = () => {
  nextTick(() => {
    if (chartType.value === 'trend') {
      renderTrendChart()
    } else if (chartType.value === 'correlation') {
      renderCorrelationChart()
    }
  })
}

const handleFieldChange = (value) => {
  emit('fieldChange', value)
  runComparison()
}

const handleChartTypeChange = () => {
  nextTick(() => {
    if (chartType.value === 'trend' && !trendChartInstance.value) {
      initTrendChart()
    } else if (chartType.value === 'correlation' && !correlationChartInstance.value) {
      initCorrelationChart()
    }
    renderCharts()
  })
}

const refreshData = () => {
  loading.value = true
  emit('refresh')
  setTimeout(() => {
    loading.value = false
    ElMessage.success('数据已刷新')
    runComparison()
  }, 1000)
}

const viewDetail = (row) => {
  selectedDetail.value = row
  detailDialogVisible.value = true
}

const getTrendType = (trend) => {
  const map = { increasing: 'danger', decreasing: 'success', stable: 'info' }
  return map[trend] || 'info'
}

const getTrendText = (trend) => {
  const map = { increasing: '上升', decreasing: '下降', stable: '稳定' }
  return map[trend] || '稳定'
}

const handleResize = performanceUtils.debounce(() => {
  trendChartInstance.value && trendChartInstance.value.resize()
  correlationChartInstance.value && correlationChartInstance.value.resize()
}, 200)

watch(
  () => props.basinDataList,
  () => {
    runComparison()
  },
  { deep: true, immediate: true }
)

onMounted(() => {
  initTrendChart()
  initCorrelationChart()
  window.addEventListener('resize', handleResize)
  runComparison()
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  trendChartInstance.value && trendChartInstance.value.dispose()
  correlationChartInstance.value && correlationChartInstance.value.dispose()
})
</script>

<style scoped>
.basin-comparison {
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  padding: 16px;
}

.comparison-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  flex-wrap: wrap;
  gap: 12px;
}

.comparison-title {
  display: flex;
  align-items: center;
  font-size: 16px;
  font-weight: 600;
  color: #333;
}

.comparison-title .el-icon {
  margin-right: 8px;
  color: #8E44AD;
}

.comparison-controls {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

.chart-container {
  width: 100%;
  height: 400px;
}

.stats-comparison {
  width: 100%;
}

.summary-cards {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  margin-top: 16px;
}

.summary-card {
  border-radius: 8px;
}

.card-content {
  display: flex;
  align-items: center;
  gap: 12px;
}

.card-icon {
  font-size: 32px;
}

.card-icon.highest {
  color: #F56C6C;
}

.card-icon.lowest {
  color: #67C23A;
}

.card-icon.range {
  color: #E6A23C;
}

.card-info {
  flex: 1;
}

.card-label {
  font-size: 12px;
  color: #999;
  margin-bottom: 4px;
}

.card-value {
  font-size: 18px;
  font-weight: 600;
  color: #333;
}

.detail-content {
  padding: 16px 0;
}

.percentile-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 8px;
}

.percentile-item {
  text-align: center;
  padding: 12px;
  background: #f5f7fa;
  border-radius: 6px;
}

.percentile-label {
  font-size: 11px;
  color: #999;
  margin-bottom: 4px;
}

.percentile-value {
  font-size: 14px;
  font-weight: 600;
  color: #333;
}

@media (max-width: 768px) {
  .summary-cards {
    grid-template-columns: 1fr;
  }

  .percentile-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}
</style>
