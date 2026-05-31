<template>
  <div class="anomaly-marker">
    <div class="marker-header">
      <div class="marker-title">
        <el-icon><Warning /></el-icon>
        <span>异常检测结果</span>
        <el-tag v-if="anomalyStats" size="small" :type="anomalyStats.anomalyCount > 0 ? 'danger' : 'success'">
          {{ anomalyStats.anomalyCount }} 个异常点
        </el-tag>
      </div>
      <div class="marker-controls">
        <el-select v-model="detectionMethod" size="small" style="width: 120px" @change="handleMethodChange">
          <el-option label="Z-Score" value="z-score" />
          <el-option label="IQR" value="iqr" />
          <el-option label="滚动检测" value="rolling" />
        </el-select>
        <el-input-number
          v-model="threshold"
          :min="1"
          :max="10"
          :step="0.5"
          size="small"
          style="margin-left: 10px"
          @change="handleThresholdChange"
        />
      </div>
    </div>

    <div class="anomaly-summary" v-if="anomalyZones.length > 0">
      <div class="summary-item" v-for="zone in anomalyZones.slice(0, 5)" :key="zone.startIndex">
        <el-tag :type="getZoneType(zone.anomalySeverity)" size="small">
          {{ getZoneLabel(zone.anomalySeverity) }}
        </el-tag>
        <span class="zone-time">{{ formatTime(zone.startTime) }} - {{ formatTime(zone.endTime) }}</span>
        <span class="zone-value">峰值: {{ zone.maxValue }}</span>
      </div>
    </div>

    <div ref="chartRef" class="chart-container"></div>

    <div class="anomaly-list" v-if="anomalies.length > 0">
      <div class="list-header">
        <span>异常点详情</span>
        <el-tag size="small">显示前 {{ Math.min(anomalies.length, 20) }} 个</el-tag>
      </div>
      <div class="list-content">
        <div class="list-item" v-for="anomaly in anomalies.slice(0, 20)" :key="anomaly.index">
          <div class="item-index">#{{ anomaly.index }}</div>
          <div class="item-info">
            <div class="item-time">{{ formatTime(anomaly.item?.timestamp) }}</div>
            <div class="item-value">
              <span :class="getAnomalyClass(anomaly.anomalyType)">
                值: {{ anomaly.value }}
              </span>
              <span class="zscore">Z-Score: {{ anomaly.zScore }}</span>
            </div>
          </div>
          <div class="item-type">
            <el-tag :type="anomaly.anomalyType === 'severe' ? 'danger' : 'warning'" size="small">
              {{ anomaly.anomalyType === 'severe' ? '严重' : '轻微' }}
            </el-tag>
          </div>
        </div>
      </div>
    </div>

    <el-empty v-if="anomalies.length === 0" description="未检测到异常数据" />
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, computed, nextTick } from 'vue'
import * as echarts from 'echarts'
import { Warning } from '@element-plus/icons-vue'
import dayjs from 'dayjs'
import { anomalyDetection } from '@/services/anomalyDetection'
import { dataCleaning } from '@/services/dataCleaning'
import { performanceUtils } from '@/utils/performance'

const MAX_DISPLAY_POINTS = 2000

const props = defineProps({
  data: {
    type: Array,
    default: () => []
  },
  valueField: {
    type: String,
    default: 'waterLevel'
  },
  timeField: {
    type: String,
    default: 'timestamp'
  },
  yAxisName: {
    type: String,
    default: '水位 (m)'
  },
  unit: {
    type: String,
    default: 'm'
  },
  warningLevel: {
    type: Number,
    default: null
  },
  alertLevel: {
    type: Number,
    default: null
  }
})

const emit = defineEmits(['anomalyDetected', 'methodChange'])

const chartRef = ref(null)
const chartInstance = ref(null)
const detectionMethod = ref('z-score')
const threshold = ref(3)

const displayData = ref([])
const anomalies = ref([])
const anomalyZones = ref([])
const anomalyStats = ref(null)

const processData = performanceUtils.memoize(
  (data, field) => {
    if (!Array.isArray(data) || data.length === 0) return []

    const filtered = data.filter(item =>
      item &&
      item[field] !== null &&
      item[field] !== undefined &&
      !isNaN(item[field])
    )

    return dataCleaning.downsampleForChart(filtered, field, MAX_DISPLAY_POINTS)
  },
  (data, field) => `${data?.length || 0}_${field}_${threshold.value}_${detectionMethod.value}`
)

const runDetection = performanceUtils.debounce(() => {
  if (props.data.length === 0) {
    anomalies.value = []
    anomalyZones.value = []
    anomalyStats.value = null
    return
  }

  const result = anomalyDetection.markAnomalyZones(props.data, props.valueField, {
    method: detectionMethod.value,
    threshold: threshold.value
  })

  anomalies.value = result.anomalies
  anomalyZones.value = result.anomalyZones
  anomalyStats.value = result.stats

  emit('anomalyDetected', {
    anomalies: result.anomalies,
    zones: result.anomalyZones,
    stats: result.stats
  })

  renderChart()
}, 300)

const initChart = () => {
  if (!chartRef.value) return

  chartInstance.value = echarts.init(chartRef.value)
  window.addEventListener('resize', handleResize)
}

const handleResize = performanceUtils.debounce(() => {
  chartInstance.value && chartInstance.value.resize()
}, 200)

const renderChart = () => {
  if (!chartInstance.value || props.data.length === 0) {
    chartInstance.value?.clear()
    return
  }

  const timeSeriesData = dataCleaning.normalizeTimeSeries(
    processData(props.data, props.valueField),
    props.timeField,
    props.valueField
  )

  if (timeSeriesData.length === 0) {
    chartInstance.value.clear()
    return
  }

  const xData = timeSeriesData.map(item => dayjs(item.time).format('MM-DD HH:mm'))
  const yData = timeSeriesData.map(item => item.value)

  const markAreas = anomalyDetection.generateAnomalyMarkAreas(anomalyZones.value)

  const levelCrossings = props.warningLevel || props.alertLevel
    ? anomalyDetection.detectLevelCrossings(
        props.data,
        props.valueField,
        props.warningLevel,
        props.alertLevel
      )
    : null

  const levelMarkAreas = []
  if (levelCrossings?.alertZones) {
    levelCrossings.alertZones.forEach(zone => {
      levelMarkAreas.push({
        xAxis: dayjs(zone.startItem?.timestamp).format('MM-DD HH:mm'),
        xAxis2: dayjs(zone.endItem?.timestamp).format('MM-DD HH:mm'),
        itemStyle: { color: 'rgba(245, 108, 108, 0.2)' },
        label: { show: true, formatter: '预警', position: 'top', color: '#F56C6C', fontSize: 10 }
      })
    })
  }

  const option = {
    animation: timeSeriesData.length < 1000,
    tooltip: {
      trigger: 'axis',
      formatter: (params) => {
        const param = params[0]
        const anomalyPoint = anomalies.value.find(a =>
          dayjs(a.item?.timestamp).format('MM-DD HH:mm') === param.name
        )

        let html = `<div style="padding: 8px;">`
        html += `<div style="font-weight: bold; margin-bottom: 4px;">${param.name}</div>`
        html += `<div>${props.yAxisName}: ${param.value} ${props.unit}</div>`

        if (anomalyPoint) {
          html += `<div style="color: #F56C6C; margin-top: 4px;">`
          html += `⚠ 异常点 (Z-Score: ${anomalyPoint.zScore})`
          html += `</div>`
        }

        html += `</div>`
        return html
      }
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
      data: xData,
      boundaryGap: false,
      axisLabel: {
        rotate: 45,
        fontSize: 10,
        color: '#666',
        interval: Math.max(0, Math.floor(xData.length / 20) - 1)
      }
    },
    yAxis: {
      type: 'value',
      name: props.yAxisName,
      nameTextStyle: { color: '#666', fontSize: 12 },
      axisLabel: { color: '#666' },
      splitLine: { lineStyle: { color: '#f0f0f0', type: 'dashed' } }
    },
    series: [
      {
        name: props.yAxisName,
        type: 'line',
        data: yData,
        smooth: true,
        symbol: 'circle',
        symbolSize: 4,
        lineStyle: { width: 2, color: '#409EFF' },
        itemStyle: { color: '#409EFF' },
        markPoint: {
          data: anomalies.value.slice(0, 10).map(a => ({
            name: '异常',
            coord: [
              timeSeriesData.findIndex(
                t => dayjs(t.time).format('MM-DD HH:mm') === dayjs(a.item?.timestamp).format('MM-DD HH:mm')
              ),
              a.value
            ],
            value: '!',
            symbol: 'pin',
            symbolSize: 30,
            itemStyle: { color: a.anomalyType === 'severe' ? '#F56C6C' : '#E6A23C' }
          })),
          label: { show: true, color: '#fff', fontSize: 10 }
        },
        markArea: {
          silent: true,
          data: [...markAreas, ...levelMarkAreas]
        },
        markLine: props.warningLevel ? {
          silent: true,
          symbol: 'none',
          lineStyle: { color: '#E6A23C', type: 'dashed', width: 1 },
          data: [{ yAxis: props.warningLevel, name: '预警线' }],
          label: { formatter: '预警线', position: 'end', color: '#E6A23C', fontSize: 10 }
        } : null,
        sampling: 'lttb',
        progressive: 500,
        large: timeSeriesData.length > 2000,
        largeThreshold: 3000
      }
    ],
    dataZoom: [
      { type: 'inside', start: 0, end: 100 },
      { type: 'slider', start: 0, end: 100, height: 20, bottom: 5 }
    ]
  }

  try {
    chartInstance.value.setOption(option, true)
  } catch (error) {
    console.error('Anomaly chart rendering error:', error)
    chartInstance.value.clear()
  }
}

const handleMethodChange = () => {
  emit('methodChange', detectionMethod.value)
  runDetection()
}

const handleThresholdChange = () => {
  runDetection()
}

const getZoneType = (severity) => {
  const map = { critical: 'danger', warning: 'warning', notice: 'info' }
  return map[severity] || 'info'
}

const getZoneLabel = (severity) => {
  const map = { critical: '严重异常', warning: '异常', notice: '注意' }
  return map[severity] || '异常'
}

const getAnomalyClass = (type) => {
  return type === 'severe' ? 'anomaly-severe' : 'anomaly-mild'
}

const formatTime = (time) => {
  if (!time) return '-'
  return dayjs(time).format('MM-DD HH:mm')
}

watch(
  () => props.data,
  () => {
    runDetection()
  },
  { deep: true, immediate: true }
)

onMounted(() => {
  initChart()
  nextTick(() => runDetection())
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
.anomaly-marker {
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  padding: 16px;
}

.marker-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  flex-wrap: wrap;
  gap: 12px;
}

.marker-title {
  display: flex;
  align-items: center;
  font-size: 16px;
  font-weight: 600;
  color: #333;
  gap: 8px;
}

.marker-title .el-icon {
  color: #E6A23C;
}

.marker-controls {
  display: flex;
  align-items: center;
}

.anomaly-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 16px;
  padding: 12px;
  background: #f9f9f9;
  border-radius: 6px;
}

.summary-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.zone-time {
  color: #666;
}

.zone-value {
  color: #F56C6C;
  font-weight: 600;
}

.chart-container {
  width: 100%;
  height: 350px;
}

.anomaly-list {
  margin-top: 16px;
  border-top: 1px solid #eee;
  padding-top: 16px;
}

.list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  font-size: 14px;
  font-weight: 600;
  color: #333;
}

.list-content {
  max-height: 300px;
  overflow-y: auto;
}

.list-item {
  display: flex;
  align-items: center;
  padding: 10px;
  border-bottom: 1px solid #f0f0f0;
  transition: background 0.2s;
}

.list-item:hover {
  background: #f9f9f9;
}

.item-index {
  width: 50px;
  color: #999;
  font-size: 12px;
}

.item-info {
  flex: 1;
}

.item-time {
  font-size: 13px;
  color: #666;
  margin-bottom: 2px;
}

.item-value {
  display: flex;
  gap: 16px;
  font-size: 13px;
}

.item-value .anomaly-severe {
  color: #F56C6C;
  font-weight: 600;
}

.item-value .anomaly-mild {
  color: #E6A23C;
  font-weight: 600;
}

.zscore {
  color: #999;
}

.item-type {
  margin-left: 12px;
}

.anomaly-severe {
  color: #F56C6C;
}

.anomaly-mild {
  color: #E6A23C;
}
</style>
