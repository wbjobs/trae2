<template>
  <div class="trend-chart">
    <div class="chart-header">
      <div class="chart-title">
        <el-icon><TrendCharts /></el-icon>
        <span>{{ title }}</span>
        <el-tag v-if="isDownsampled" type="info" size="small" class="downsample-tag">
          已降采样 ({{ originalCount }} → {{ displayCount }})
        </el-tag>
      </div>
      <div class="chart-controls">
        <el-radio-group v-model="chartType" size="small" @change="handleChartTypeChange">
          <el-radio-button value="line">折线图</el-radio-button>
          <el-radio-button value="smooth">平滑曲线</el-radio-button>
          <el-radio-button value="area">面积图</el-radio-button>
        </el-radio-group>
        <el-select v-model="timeRange" size="small" style="width: 120px; margin-left: 10px" @change="handleTimeRangeChange">
          <el-option label="最近24小时" value="24h" />
          <el-option label="最近7天" value="7d" />
          <el-option label="最近30天" value="30d" />
          <el-option label="自定义" value="custom" />
        </el-select>
        <el-button size="small" type="primary" @click="refreshData" :loading="loading">
          <el-icon><Refresh /></el-icon>
          刷新
        </el-button>
      </div>
    </div>
    <div ref="chartRef" class="chart-container"></div>
    <div v-if="showStats" class="chart-stats">
      <div class="stat-item">
        <span class="stat-label">平均值</span>
        <span class="stat-value">{{ stats.mean }}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">最大值</span>
        <span class="stat-value">{{ stats.max }}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">最小值</span>
        <span class="stat-value">{{ stats.min }}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">趋势</span>
        <span class="stat-value" :class="trendClass">{{ trendText }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, computed, nextTick } from 'vue'
import * as echarts from 'echarts'
import { ElMessage } from 'element-plus'
import { TrendCharts, Refresh } from '@element-plus/icons-vue'
import dayjs from 'dayjs'
import { statisticsService } from '@/services/statistics'
import { dataCleaning } from '@/services/dataCleaning'

const MAX_DISPLAY_POINTS = 2000
const OPTIMAL_DISPLAY_POINTS = 1000

const props = defineProps({
  title: {
    type: String,
    default: '趋势分析图'
  },
  data: {
    type: Array,
    default: () => []
  },
  xField: {
    type: String,
    default: 'timestamp'
  },
  yField: {
    type: String,
    default: 'waterLevel'
  },
  yAxisName: {
    type: String,
    default: '水位 (m)'
  },
  unit: {
    type: String,
    default: 'm'
  },
  showStats: {
    type: Boolean,
    default: true
  },
  smooth: {
    type: Boolean,
    default: true
  },
  threshold: {
    type: Number,
    default: null
  },
  autoDownsample: {
    type: Boolean,
    default: true
  }
})

const emit = defineEmits(['dataChange', 'timeRangeChange', 'refresh'])

const chartRef = ref(null)
const chartInstance = ref(null)
const loading = ref(false)
const chartType = ref('smooth')
const timeRange = ref('7d')
const displayData = ref([])
const isDownsampled = ref(false)
const originalCount = ref(0)

const displayCount = computed(() => displayData.value.length)

const stats = computed(() => {
  if (props.data.length === 0) return { mean: '-', max: '-', min: '-', stdDev: '-' }
  const basicStats = statisticsService.calculateBasicStats(props.data, props.yField)
  return basicStats
})

const trendAnalysis = computed(() => {
  if (props.data.length < 10) return { trend: 'insufficient' }
  return statisticsService.calculateTrend(props.data, props.xField, props.yField)
})

const trendText = computed(() => {
  const trendMap = {
    increasing: '上升',
    decreasing: '下降',
    stable: '稳定',
    insufficient: '数据不足'
  }
  return trendMap[trendAnalysis.value.trend] || '-'
})

const trendClass = computed(() => {
  const classMap = {
    increasing: 'trend-up',
    decreasing: 'trend-down',
    stable: 'trend-stable',
    insufficient: ''
  }
  return classMap[trendAnalysis.value.trend] || ''
})

const processDataForChart = (rawData) => {
  if (!Array.isArray(rawData) || rawData.length === 0) {
    return []
  }

  originalCount.value = rawData.length

  let data = rawData.filter(item =>
    item &&
    item[props.yField] !== null &&
    item[props.yField] !== undefined &&
    !isNaN(item[props.yField])
  )

  if (props.autoDownsample && data.length > MAX_DISPLAY_POINTS) {
    data = dataCleaning.downsampleForChart(data, props.yField, OPTIMAL_DISPLAY_POINTS)
    isDownsampled.value = true
  } else {
    isDownsampled.value = false
  }

  return data
}

const initChart = () => {
  if (!chartRef.value) return

  chartInstance.value = echarts.init(chartRef.value)
  window.addEventListener('resize', handleResize)
}

const handleResize = () => {
  chartInstance.value && chartInstance.value.resize()
}

const renderChart = () => {
  if (!chartInstance.value) {
    return
  }

  if (displayData.value.length === 0) {
    chartInstance.value.clear()
    return
  }

  const timeSeriesData = dataCleaning.normalizeTimeSeries(displayData.value, props.xField, props.yField)

  if (timeSeriesData.length === 0) {
    chartInstance.value.clear()
    return
  }

  const xData = timeSeriesData.map((item) => {
    if (props.xField === 'timestamp' || props.xField === 'time') {
      return dayjs(item.time).format('MM-DD HH:mm')
    }
    return item[props.xField]
  })

  const yData = timeSeriesData.map((item) => item.value)

  const isSmooth = chartType.value === 'smooth'
  const isArea = chartType.value === 'area'
  const dataPointCount = timeSeriesData.length
  const showSymbol = dataPointCount < 500
  const symbolSize = showSymbol ? 4 : 0

  const option = {
    animation: dataPointCount < 1000,
    animationThreshold: 2000,
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: '#d9d9d9',
      borderWidth: 1,
      textStyle: {
        color: '#333'
      },
      axisPointer: {
        type: 'cross',
        animation: dataPointCount < 1000
      },
      formatter: (params) => {
        const param = params[0]
        return `
          <div style="padding: 8px;">
            <div style="font-weight: bold; margin-bottom: 4px;">${param.name}</div>
            <div>${props.yAxisName}: ${param.value} ${props.unit}</div>
          </div>
        `
      }
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '12%',
      top: '8%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: xData,
      boundaryGap: false,
      axisLabel: {
        rotate: 45,
        fontSize: 10,
        color: '#666',
        interval: Math.max(0, Math.floor(dataPointCount / 20) - 1)
      },
      axisLine: {
        lineStyle: {
          color: '#d9d9d9'
        }
      },
      axisTick: {
        show: dataPointCount < 500
      }
    },
    yAxis: {
      type: 'value',
      name: props.yAxisName,
      nameTextStyle: {
        color: '#666',
        fontSize: 12
      },
      axisLabel: {
        color: '#666',
        formatter: (value) => value.toFixed(1)
      },
      axisLine: {
        show: false
      },
      splitLine: {
        lineStyle: {
          color: '#f0f0f0',
          type: 'dashed'
        }
      }
    },
    series: [
      {
        name: props.yAxisName,
        type: 'line',
        data: yData,
        smooth: isSmooth,
        symbol: showSymbol ? 'circle' : 'none',
        symbolSize: symbolSize,
        lineStyle: {
          width: dataPointCount > 500 ? 1 : 2,
          color: '#409EFF'
        },
        itemStyle: {
          color: '#409EFF'
        },
        areaStyle: isArea
          ? {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: 'rgba(64, 158, 255, 0.3)' },
                { offset: 1, color: 'rgba(64, 158, 255, 0.05)' }
              ])
            }
          : null,
        markLine: props.threshold
          ? {
              silent: true,
              symbol: 'none',
              lineStyle: {
                color: '#F56C6C',
                type: 'dashed',
                width: 1
              },
              data: [{ yAxis: props.threshold, name: '预警阈值' }],
              label: {
                formatter: '预警阈值',
                position: 'end',
                color: '#F56C6C',
                fontSize: 10
              }
            }
          : null,
        sampling: 'lttb',
        progressive: 500,
        progressiveThreshold: 1000,
        large: dataPointCount > 2000,
        largeThreshold: 3000
      }
    ],
    dataZoom: [
      {
        type: 'inside',
        start: 0,
        end: 100,
        zoomOnMouseWheel: dataPointCount > 100,
        moveOnMouseMove: true,
        moveOnMouseWheel: false
      },
      {
        type: 'slider',
        start: 0,
        end: 100,
        height: 20,
        bottom: 5,
        borderColor: '#d9d9d9',
        fillerColor: 'rgba(64, 158, 255, 0.2)',
        handleStyle: {
          color: '#409EFF'
        },
        showDetail: dataPointCount < 500
      }
    ]
  }

  try {
    chartInstance.value.setOption(option, true)
  } catch (error) {
    console.error('Chart rendering error:', error)
    chartInstance.value.clear()
  }
}

const handleChartTypeChange = () => {
  renderChart()
}

const handleTimeRangeChange = (value) => {
  emit('timeRangeChange', value)
}

const refreshData = async () => {
  loading.value = true
  emit('refresh')
  setTimeout(() => {
    loading.value = false
    ElMessage.success('数据已刷新')
  }, 1000)
}

watch(
  () => props.data,
  async (newData) => {
    displayData.value = processDataForChart(newData)
    await nextTick()
    renderChart()
  },
  { deep: true, immediate: true }
)

onMounted(() => {
  initChart()
  if (props.data && props.data.length > 0) {
    displayData.value = processDataForChart(props.data)
    nextTick(() => renderChart())
  }
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  if (chartInstance.value) {
    chartInstance.value.dispose()
    chartInstance.value = null
  }
})
</script>

<style scoped>
.trend-chart {
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  padding: 16px;
}

.chart-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  flex-wrap: wrap;
  gap: 12px;
}

.chart-title {
  display: flex;
  align-items: center;
  font-size: 16px;
  font-weight: 600;
  color: #333;
}

.chart-title .el-icon {
  margin-right: 8px;
  color: #409EFF;
}

.downsample-tag {
  margin-left: 12px;
  font-weight: normal;
}

.chart-controls {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

.chart-container {
  width: 100%;
  height: 300px;
}

.chart-stats {
  display: flex;
  justify-content: space-around;
  padding: 12px;
  background: #f5f7fa;
  border-radius: 6px;
  margin-top: 12px;
}

.stat-item {
  text-align: center;
}

.stat-label {
  display: block;
  font-size: 12px;
  color: #999;
  margin-bottom: 4px;
}

.stat-value {
  font-size: 18px;
  font-weight: 600;
  color: #333;
}

.trend-up {
  color: #F56C6C;
}

.trend-down {
  color: #67C23A;
}

.trend-stable {
  color: #909399;
}

@media (max-width: 768px) {
  .chart-controls {
    width: 100%;
    justify-content: flex-start;
  }

  .chart-stats {
    flex-wrap: wrap;
    gap: 12px;
  }
}
</style>
