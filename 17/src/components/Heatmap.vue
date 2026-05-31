<template>
  <div class="heatmap-chart">
    <div class="chart-header">
      <div class="chart-title">
        <el-icon><Histogram /></el-icon>
        <span>{{ title }}</span>
        <el-tag v-if="isDataAggregated" type="info" size="small" class="aggregate-tag">
          数据已聚合
        </el-tag>
      </div>
      <div class="chart-controls">
        <el-select v-model="dataType" size="small" style="width: 120px" @change="handleDataTypeChange">
          <el-option label="水位" value="waterLevel" />
          <el-option label="流速" value="flowVelocity" />
          <el-option label="雨量" value="rainfall" />
        </el-select>
        <el-select v-model="aggregateLevel" size="small" style="width: 100px; margin-left: 10px" @change="handleAggregateChange">
          <el-option label="原始" value="raw" />
          <el-option label="小时" value="hour" />
          <el-option label="天" value="day" />
        </el-select>
        <el-button size="small" type="primary" @click="refreshData" :loading="loading" style="margin-left: 10px">
          <el-icon><Refresh /></el-icon>
          刷新
        </el-button>
      </div>
    </div>
    <div ref="chartRef" class="chart-container"></div>
    <div v-if="dataInfo" class="data-info">
      <span>数据点: {{ dataInfo.total }}</span>
      <span v-if="dataInfo.min !== undefined">最小值: {{ dataInfo.min.toFixed(2) }} {{ unit }}</span>
      <span v-if="dataInfo.max !== undefined">最大值: {{ dataInfo.max.toFixed(2) }} {{ unit }}</span>
    </div>
    <div class="heatmap-legend">
      <div class="legend-item">
        <span class="legend-label">低值</span>
        <div class="legend-gradient"></div>
        <span class="legend-label">高值</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import * as echarts from 'echarts'
import { ElMessage } from 'element-plus'
import { Histogram, Refresh } from '@element-plus/icons-vue'
import dayjs from 'dayjs'

const MAX_HEATMAP_POINTS = 5000

const props = defineProps({
  title: {
    type: String,
    default: '时空热力图'
  },
  data: {
    type: Object,
    default: () => ({
      heatmapData: [],
      xAxis: [],
      yAxis: []
    })
  },
  defaultDataType: {
    type: String,
    default: 'waterLevel'
  }
})

const emit = defineEmits(['dataTypeChange', 'refresh', 'aggregateChange'])

const chartRef = ref(null)
const chartInstance = ref(null)
const loading = ref(false)
const dataType = ref(props.defaultDataType)
const aggregateLevel = ref('raw')
const isDataAggregated = ref(false)
const displayData = ref([])

const unitMap = {
  waterLevel: 'm',
  flowVelocity: 'm/s',
  rainfall: 'mm'
}

const labelMap = {
  waterLevel: '水位',
  flowVelocity: '流速',
  rainfall: '雨量'
}

const unit = computed(() => unitMap[dataType.value] || '')

const dataInfo = computed(() => {
  const heatmapData = props.data?.heatmapData || []
  if (heatmapData.length === 0) {
    return { total: 0 }
  }

  const values = heatmapData.map((item) => item[2]).filter((v) => v !== null && v !== undefined && !isNaN(v))
  if (values.length === 0) {
    return { total: heatmapData.length }
  }

  return {
    total: heatmapData.length,
    min: Math.min(...values),
    max: Math.max(...values)
  }
})

const aggregateHeatmapData = (data, level) => {
  if (!data || !data.heatmapData || !data.xAxis || !data.yAxis) {
    return data
  }

  if (level === 'raw' || data.heatmapData.length <= MAX_HEATMAP_POINTS) {
    isDataAggregated.value = false
    return data
  }

  isDataAggregated.value = true
  const { heatmapData, xAxis, yAxis } = data

  let xStep = 1
  let yStep = 1

  const totalPoints = xAxis.length * yAxis.length
  if (totalPoints > MAX_HEATMAP_POINTS) {
    const ratio = Math.sqrt(totalPoints / MAX_HEATMAP_POINTS)
    xStep = Math.max(1, Math.floor(ratio))
    yStep = Math.max(1, Math.floor(ratio))
  }

  const aggregatedMap = new Map()

  heatmapData.forEach((point) => {
    const [x, y, value] = point
    const aggX = Math.floor(x / xStep)
    const aggY = Math.floor(y / yStep)
    const key = `${aggX},${aggY}`

    if (!aggregatedMap.has(key)) {
      aggregatedMap.set(key, { values: [], x: aggX, y: aggY })
    }
    if (value !== null && value !== undefined && !isNaN(value)) {
      aggregatedMap.get(key).values.push(value)
    }
  })

  const newHeatmapData = []
  aggregatedMap.forEach((item) => {
    if (item.values.length > 0) {
      const avg = item.values.reduce((a, b) => a + b, 0) / item.values.length
      newHeatmapData.push([item.x, item.y, Number(avg.toFixed(2))])
    }
  })

  const newXAxis = xAxis.filter((_, i) => i % xStep === 0)
  const newYAxis = yAxis.filter((_, i) => i % yStep === 0)

  return {
    heatmapData: newHeatmapData,
    xAxis: newXAxis,
    yAxis: newYAxis,
    isAggregated: true
  }
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
  if (!chartInstance.value || !props.data) {
    return
  }

  const aggregatedData = aggregateHeatmapData(props.data, aggregateLevel.value)
  const { heatmapData, xAxis, yAxis } = aggregatedData

  if (!heatmapData || heatmapData.length === 0) {
    chartInstance.value.clear()
    return
  }

  const values = heatmapData.map((item) => item[2]).filter((v) => v !== null && v !== undefined && !isNaN(v))
  if (values.length === 0) {
    chartInstance.value.clear()
    return
  }

  const minValue = Math.min(...values)
  const maxValue = Math.max(...values)
  const dataPointCount = heatmapData.length

  const option = {
    animation: dataPointCount < 1000,
    animationThreshold: 2000,
    tooltip: {
      position: 'top',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: '#d9d9d9',
      borderWidth: 1,
      textStyle: {
        color: '#333'
      },
      formatter: (params) => {
        const [x, y, value] = params.value
        const xLabel = xAxis[x] || x
        const yLabel = yAxis[y] || `${y}:00`
        return `
          <div style="padding: 8px;">
            <div>日期: ${xLabel}</div>
            <div>时间: ${yLabel}</div>
            <div>${labelMap[dataType.value]}: ${value} ${unitMap[dataType.value]}</div>
          </div>
        `
      }
    },
    grid: {
      left: '10%',
      right: '5%',
      bottom: '18%',
      top: '10%'
    },
    xAxis: {
      type: 'category',
      data: xAxis || [],
      splitArea: {
        show: true,
        areaStyle: {
          color: ['rgba(250, 250, 250, 0.3)', 'rgba(240, 240, 240, 0.3)']
        }
      },
      axisLabel: {
        rotate: 45,
        fontSize: 10,
        color: '#666',
        interval: Math.max(0, Math.floor(xAxis.length / 15) - 1)
      },
      axisLine: {
        lineStyle: {
          color: '#d9d9d9'
        }
      },
      axisTick: {
        show: xAxis.length < 100
      }
    },
    yAxis: {
      type: 'category',
      data: yAxis || [],
      splitArea: {
        show: true,
        areaStyle: {
          color: ['rgba(250, 250, 250, 0.3)', 'rgba(240, 240, 240, 0.3)']
        }
      },
      axisLabel: {
        fontSize: 10,
        color: '#666',
        interval: Math.max(0, Math.floor(yAxis.length / 12) - 1)
      },
      axisLine: {
        lineStyle: {
          color: '#d9d9d9'
        }
      },
      axisTick: {
        show: yAxis.length < 50
      }
    },
    visualMap: {
      min: minValue,
      max: maxValue,
      calculable: true,
      orient: 'horizontal',
      left: 'center',
      bottom: '5%',
      inRange: {
        color: ['#313695', '#4575b4', '#74add1', '#abd9e9', '#e0f3f8', '#ffffbf', '#fee090', '#fdae61', '#f46d43', '#d73027', '#a50026']
      },
      textStyle: {
        color: '#666',
        fontSize: 10
      },
      itemWidth: 15,
      itemHeight: 120,
      textGap: 10
    },
    series: [
      {
        name: labelMap[dataType.value],
        type: 'heatmap',
        data: heatmapData,
        label: {
          show: dataPointCount < 200,
          fontSize: 8,
          color: '#333'
        },
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowColor: 'rgba(0, 0, 0, 0.5)'
          }
        },
        progressive: 200,
        progressiveThreshold: 500,
        large: dataPointCount > 1000,
        largeThreshold: 2000,
        itemStyle: {
          borderWidth: dataPointCount < 500 ? 1 : 0,
          borderColor: '#fff'
        }
      }
    ],
    dataZoom: [
      {
        type: 'inside',
        xAxisIndex: 0,
        start: 0,
        end: 100,
        zoomOnMouseWheel: true,
        moveOnMouseMove: true
      },
      {
        type: 'inside',
        yAxisIndex: 0,
        start: 0,
        end: 100,
        zoomOnMouseWheel: true,
        moveOnMouseMove: true
      }
    ]
  }

  try {
    chartInstance.value.setOption(option, true)
  } catch (error) {
    console.error('Heatmap rendering error:', error)
    chartInstance.value.clear()
  }
}

const handleDataTypeChange = (value) => {
  emit('dataTypeChange', value)
}

const handleAggregateChange = (value) => {
  aggregateLevel.value = value
  renderChart()
  emit('aggregateChange', value)
}

const refreshData = () => {
  loading.value = true
  emit('refresh')
  setTimeout(() => {
    loading.value = false
    ElMessage.success('数据已刷新')
  }, 1000)
}

watch(
  () => props.data,
  () => {
    renderChart()
  },
  { deep: true, immediate: true }
)

onMounted(() => {
  initChart()
  renderChart()
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
.heatmap-chart {
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
  color: #E6A23C;
}

.aggregate-tag {
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
  height: 400px;
}

.data-info {
  display: flex;
  justify-content: center;
  gap: 24px;
  padding: 8px;
  background: #f9f9f9;
  border-radius: 4px;
  margin-top: 12px;
  font-size: 12px;
  color: #666;
}

.heatmap-legend {
  display: flex;
  justify-content: center;
  margin-top: 12px;
}

.legend-item {
  display: flex;
  align-items: center;
}

.legend-label {
  font-size: 12px;
  color: #666;
  margin: 0 8px;
}

.legend-gradient {
  width: 200px;
  height: 12px;
  background: linear-gradient(to right, #313695, #4575b4, #74add1, #abd9e9, #e0f3f8, #ffffbf, #fee090, #fdae61, #f46d43, #d73027, #a50026);
  border-radius: 2px;
}

@media (max-width: 768px) {
  .chart-controls {
    width: 100%;
    justify-content: flex-start;
  }

  .data-info {
    flex-wrap: wrap;
    gap: 12px;
  }
}
</style>
