<template>
  <div class="dashboard">
    <header class="dashboard-header">
      <div class="header-left">
        <h1 class="title">
          <span class="icon">☀️</span>
          光伏电站运维分析可视化平台
        </h1>
      </div>
      <div class="header-center">
        <div class="time-display">
          <span class="label">当前时间:</span>
          <span class="value">{{ currentTime }}</span>
        </div>
      </div>
      <div class="header-right">
        <div class="query-panel">
          <el-date-picker
            v-model="dateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            format="YYYY-MM-DD"
            value-format="YYYY-MM-DD"
            @change="handleDateChange"
          />
          <el-select v-model="selectedStation" @change="handleStationChange" style="width: 150px; margin-left: 12px;">
            <el-option label="全部电站" value="all" />
            <el-option label="光伏电站A" value="station_a" />
            <el-option label="光伏电站B" value="station_b" />
            <el-option label="光伏电站C" value="station_c" />
          </el-select>
          <el-button type="primary" @click="fetchData" style="margin-left: 12px;">
            查询
          </el-button>
          <el-button type="success" @click="handleExport" style="margin-left: 8px;">
            导出报表
          </el-button>
          <el-button
            type="warning"
            @click="clearLinkedFilters"
            style="margin-left: 8px;"
            :disabled="!hasActiveFilters"
          >
            清除联动
          </el-button>
          <el-dropdown style="margin-left: 12px;" @command="handleLayoutCommand">
            <el-button type="info">
              布局切换 ▾
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item
                  v-for="layout in savedLayouts"
                  :key="layout.id"
                  :command="{ action: 'switch', id: layout.id }"
                >
                  {{ layout.name }}{{ layout.isDefault ? ' (默认)' : '' }}
                </el-dropdown-item>
                <el-dropdown-item divided :command="{ action: 'save' }">
                  保存当前布局
                </el-dropdown-item>
                <el-dropdown-item :command="{ action: 'manage' }">
                  管理布局
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </div>
    </header>

    <div class="stats-row">
      <StatCard
        v-for="stat in statCards"
        :key="stat.key"
        :title="stat.title"
        :value="stats[stat.key]"
        :unit="stat.unit"
        :icon="stat.icon"
        :color="stat.color"
        :trend="stat.trend"
      />
    </div>

    <div class="yoy-mom-section">
      <div class="yoy-mom-chart-area">
        <div class="chart-card large">
          <div class="card-header">
            <span class="card-title">同比环比分析</span>
            <el-radio-group v-model="yoyMomType" size="small" @change="updateYoYMoMChart">
              <el-radio-button value="yoy">同比</el-radio-button>
              <el-radio-button value="mom">环比</el-radio-button>
              <el-radio-button value="all">全部</el-radio-button>
            </el-radio-group>
          </div>
          <div ref="yoyMomChart" class="chart-body"></div>
        </div>
      </div>
      <div class="yoy-mom-stats-area">
        <div class="change-card" :class="store.yoyMomData.yoy.changeRate >= 0 ? 'positive' : 'negative'">
          <div class="change-label">同比变化率</div>
          <div class="change-value">
            <span class="arrow">{{ store.yoyMomData.yoy.changeRate >= 0 ? '↑' : '↓' }}</span>
            {{ Math.abs(store.yoyMomData.yoy.changeRate) }}%
          </div>
          <div class="change-detail">
            较上年 {{ store.yoyMomData.yoy.changeValue > 0 ? '+' : '' }}{{ store.yoyMomData.yoy.changeValue }} kWh
          </div>
        </div>
        <div class="change-card" :class="store.yoyMomData.mom.changeRate >= 0 ? 'positive' : 'negative'">
          <div class="change-label">环比变化率</div>
          <div class="change-value">
            <span class="arrow">{{ store.yoyMomData.mom.changeRate >= 0 ? '↑' : '↓' }}</span>
            {{ Math.abs(store.yoyMomData.mom.changeRate) }}%
          </div>
          <div class="change-detail">
            较上期 {{ store.yoyMomData.mom.changeValue > 0 ? '+' : '' }}{{ store.yoyMomData.mom.changeValue }} kWh
          </div>
        </div>
      </div>
    </div>

    <div class="charts-container">
      <div class="charts-row">
        <div class="chart-card large">
          <div class="card-header">
            <span class="card-title">发电量趋势</span>
            <el-radio-group v-model="powerTrendType" size="small" @change="updatePowerTrend">
              <el-radio-button value="day">日</el-radio-button>
              <el-radio-button value="week">周</el-radio-button>
              <el-radio-button value="month">月</el-radio-button>
            </el-radio-group>
          </div>
          <div ref="powerTrendChart" class="chart-body"></div>
        </div>
      </div>

      <div class="charts-row">
        <div class="chart-card">
          <div class="card-header">
            <span class="card-title">故障类型分布</span>
          </div>
          <div ref="faultPieChart" class="chart-body"></div>
        </div>

        <div class="chart-card">
          <div class="card-header">
            <span class="card-title">设备状态</span>
          </div>
          <div class="gauge-container">
            <div ref="efficiencyGauge" class="gauge-chart"></div>
            <div ref="onlineGauge" class="gauge-chart"></div>
          </div>
        </div>

        <div class="chart-card">
          <div class="card-header">
            <span class="card-title">损耗分析</span>
          </div>
          <div ref="lossBarChart" class="chart-body"></div>
        </div>
      </div>

      <div class="charts-row">
        <div class="chart-card">
          <div class="card-header">
            <span class="card-title">逆变器运行数据</span>
          </div>
          <div class="table-container">
            <div v-if="activeFilterTags.length > 0" class="filter-tags" style="margin-bottom: 12px;">
              <el-tag
                v-for="tag in activeFilterTags"
                :key="tag.type"
                :type="getFilterTagType(tag.type)"
                closable
                @close="removeFilter(tag.type)"
                size="small"
                style="margin-right: 8px;"
              >
                {{ tag.label }}
              </el-tag>
            </div>
            <el-table :data="linkedInverterData" size="small" stripe style="width: 100%">
              <el-table-column prop="name" label="逆变器" width="100" />
              <el-table-column prop="power" label="功率(kW)" width="90" />
              <el-table-column prop="efficiency" label="效率(%)" width="80">
                <template #default="{ row }">
                  <span :class="row.efficiency >= 95 ? 'text-success' : row.efficiency >= 90 ? 'text-warning' : 'text-danger'">
                    {{ row.efficiency }}
                  </span>
                </template>
              </el-table-column>
              <el-table-column prop="temperature" label="温度(°C)" width="90" />
              <el-table-column prop="status" label="状态">
                <template #default="{ row }">
                  <el-tag :type="row.status === '正常' ? 'success' : row.status === '告警' ? 'warning' : 'danger'" size="small">
                    {{ row.status }}
                  </el-tag>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </div>

        <div class="chart-card">
          <div class="card-header">
            <span class="card-title">故障点位地理分布</span>
          </div>
          <div ref="faultGeoMap" class="chart-body"></div>
        </div>
      </div>
    </div>

    <el-dialog v-model="layoutDialogVisible" title="保存布局" width="420px" :close-on-click-modal="false">
      <el-form :model="layoutForm" label-width="90px">
        <el-form-item label="布局名称">
          <el-input v-model="layoutForm.name" placeholder="请输入布局名称" />
        </el-form-item>
        <el-form-item label="设为默认">
          <el-switch v-model="layoutForm.isDefault" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="layoutDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveCurrentLayout">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="layoutManageVisible" title="管理布局" width="500px">
      <el-table :data="savedLayouts" size="small">
        <el-table-column prop="name" label="布局名称" />
        <el-table-column prop="isDefault" label="默认" width="60">
          <template #default="{ row }">
            {{ row.isDefault ? '✓' : '' }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120">
          <template #default="{ row }">
            <el-button type="danger" size="small" link @click="deleteLayoutById(row.id)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, reactive, computed } from 'vue'
import dayjs from 'dayjs'
import { ElMessage } from 'element-plus'
import { useDashboardStore } from '@/store/dashboard'
import { getPowerTrend, getFaultDistribution, getDeviceStatus, getLossAnalysis, getInverterData, exportReport, getPowerYoYMoM, getFaultGeoDistribution, getLayouts, saveLayout as saveLayoutApi, updateLayout as updateLayoutApi, deleteLayout as deleteLayoutApi } from '@/api'
import { createChart, resizeChart, getLineChartOption, getPieChartOption, getBarChartOption, getGaugeOption, getYoYMoMChartOption, getGeoMapOption } from '@/utils/chart'
import StatCard from '@/components/StatCard.vue'

const store = useDashboardStore()

const currentTime = ref('')
const dateRange = ref([store.timeRange.start, store.timeRange.end])
const selectedStation = ref(store.selectedStation)
const powerTrendType = ref('day')
const yoyMomType = ref('all')

const stats = store.stats
const inverterData = store.inverterData
const savedLayouts = store.savedLayouts

const powerTrendChart = ref(null)
const faultPieChart = ref(null)
const lossBarChart = ref(null)
const efficiencyGauge = ref(null)
const onlineGauge = ref(null)
const yoyMomChart = ref(null)
const faultGeoMap = ref(null)

const layoutDialogVisible = ref(false)
const layoutManageVisible = ref(false)
const layoutForm = reactive({ name: '', isDefault: false })

const charts = reactive({
  powerTrend: null,
  faultPie: null,
  lossBar: null,
  efficiency: null,
  online: null,
  yoyMom: null,
  faultGeo: null
})

const linkedFilters = reactive({
  selectedDate: null,
  selectedFaultType: null,
  selectedLossType: null,
  selectedInverter: null,
  selectedTimeSlot: null
})

const linkedInverterData = computed(() => {
  if (!linkedFilters.selectedFaultType) {
    return inverterData.value
  }
  const faultStatusMap = {
    '逆变器故障': '故障',
    '组件异常': '告警',
    '汇流箱故障': '故障',
    '电网故障': '告警',
    '通信中断': '故障'
  }
  const targetStatus = faultStatusMap[linkedFilters.selectedFaultType]
  if (targetStatus) {
    return inverterData.value.filter(d => d.status === targetStatus)
  }
  return inverterData.value
})

let timer = null
let chartEventHandlers = []

const hasActiveFilters = computed(() => {
  return linkedFilters.selectedDate || 
         linkedFilters.selectedFaultType || 
         linkedFilters.selectedLossType || 
         linkedFilters.selectedTimeSlot
})

const activeFilterTags = computed(() => {
  const tags = []
  if (linkedFilters.selectedDate) tags.push({ type: 'date', label: `日期: ${linkedFilters.selectedDate}` })
  if (linkedFilters.selectedFaultType) tags.push({ type: 'fault', label: `故障: ${linkedFilters.selectedFaultType}` })
  if (linkedFilters.selectedLossType) tags.push({ type: 'loss', label: `损耗: ${linkedFilters.selectedLossType}` })
  if (linkedFilters.selectedTimeSlot) tags.push({ type: 'time', label: `时段: ${linkedFilters.selectedTimeSlot}` })
  return tags
})

const removeFilter = (type) => {
  if (type === 'date') linkedFilters.selectedDate = null
  if (type === 'fault') linkedFilters.selectedFaultType = null
  if (type === 'loss') linkedFilters.selectedLossType = null
  if (type === 'time') linkedFilters.selectedTimeSlot = null
  updateLinkedCharts()
}

const statCards = [
  { key: 'totalPower', title: '累计发电量', unit: 'MWh', icon: '⚡', color: '#409eff', trend: '+5.2%' },
  { key: 'todayPower', title: '今日发电量', unit: 'MWh', icon: '☀️', color: '#67c23a', trend: '+3.8%' },
  { key: 'efficiency', title: '发电效率', unit: '%', icon: '📈', color: '#e6a23c', trend: '+1.2%' },
  { key: 'lossRate', title: '损耗率', unit: '%', icon: '📉', color: '#f56c6c', trend: '-0.5%' },
  { key: 'onlineRate', title: '设备在线率', unit: '%', icon: '🔌', color: '#909399', trend: '+0.3%' },
  { key: 'faultCount', title: '故障数量', unit: '个', icon: '⚠️', color: '#ff6b6b', trend: '-2' }
]

const updateTime = () => {
  currentTime.value = dayjs().format('YYYY-MM-DD HH:mm:ss')
}

const handleDateChange = (val) => {
  if (val && val.length === 2) {
    store.setTimeRange(val[0], val[1])
  }
}

const handleStationChange = (val) => {
  store.setSelectedStation(val)
}

const initCharts = () => {
  disposeAllCharts()
  chartEventHandlers = []
  
  if (powerTrendChart.value) {
    charts.powerTrend = createChart(powerTrendChart.value, getLineChartOption(store.powerTrend))
    setupPowerTrendEvents(charts.powerTrend)
  }
  if (faultPieChart.value) {
    charts.faultPie = createChart(faultPieChart.value, getPieChartOption(store.faultDistribution, '故障类型'))
    setupFaultPieEvents(charts.faultPie)
  }
  if (lossBarChart.value) {
    charts.lossBar = createChart(lossBarChart.value, getBarChartOption(store.lossAnalysis, '损耗(kWh)'))
    setupLossBarEvents(charts.lossBar)
  }
  if (efficiencyGauge.value) {
    charts.efficiency = createChart(efficiencyGauge.value, getGaugeOption(stats.efficiency, '发电效率'))
  }
  if (onlineGauge.value) {
    charts.online = createChart(onlineGauge.value, getGaugeOption(stats.onlineRate, '设备在线率'))
  }
  if (faultGeoMap.value) {
    charts.faultGeo = createChart(faultGeoMap.value, getGeoMapOption(store.faultGeoData))
  }
  if (yoyMomChart.value) {
    charts.yoyMom = createChart(yoyMomChart.value, getYoYMoMChartOption(store.yoyMomData, yoyMomType.value))
    setupYoYMoMEvents(charts.yoyMom)
  }
  if (faultGeoMap.value) {
    charts.faultGeo = createChart(faultGeoMap.value, getGeoMapOption(store.faultGeoData))
  }
}

const disposeAllCharts = () => {
  Object.values(charts).forEach(chart => {
    if (chart) {
      chart.dispose()
    }
  })
  Object.keys(charts).forEach(key => {
    charts[key] = null
  })
}

const setupPowerTrendEvents = (chart) => {
  const handler = (params) => {
    if (params.componentType === 'series') {
      linkedFilters.selectedDate = params.name
      ElMessage.info(`已选择日期: ${params.name}，联动筛选其他图表`)
      updateLinkedCharts()
    }
  }
  chart.on('click', handler)
  chartEventHandlers.push({ chart, event: 'click', handler })
}

const setupFaultPieEvents = (chart) => {
  const clickHandler = (params) => {
    if (params.componentType === 'series') {
      linkedFilters.selectedFaultType = linkedFilters.selectedFaultType === params.name ? null : params.name
      ElMessage.info(linkedFilters.selectedFaultType 
        ? `已选择故障类型: ${params.name}，联动筛选逆变器数据` 
        : '已清除故障类型筛选')
      updateLinkedCharts()
    }
  }
  const highlightHandler = (params) => {
    highlightLinkedCharts(params.name, 'faultType')
  }
  const downplayHandler = () => {
    downplayLinkedCharts()
  }
  chart.on('click', clickHandler)
  chart.on('mouseover', highlightHandler)
  chart.on('mouseout', downplayHandler)
  chartEventHandlers.push({ chart, event: 'click', handler: clickHandler })
}

const setupLossBarEvents = (chart) => {
  const handler = (params) => {
    if (params.componentType === 'series') {
      linkedFilters.selectedLossType = linkedFilters.selectedLossType === params.name ? null : params.name
      ElMessage.info(linkedFilters.selectedLossType 
        ? `已选择损耗类型: ${params.name}` 
        : '已清除损耗类型筛选')
      updateLinkedCharts()
    }
  }
  chart.on('click', handler)
  chartEventHandlers.push({ chart, event: 'click', handler })
}

const setupYoYMoMEvents = (chart) => {
  const handler = (params) => {
    if (params.componentType === 'series') {
      linkedFilters.selectedDate = params.name
      ElMessage.info(`同比环比分析 - 已选择时间点: ${params.name}`)
      updateLinkedCharts()
    }
  }
  chart.on('click', handler)
  chartEventHandlers.push({ chart, event: 'click', handler })
}

const highlightLinkedCharts = (value, type) => {
  if (charts.lossBar && type === 'faultType') {
    const lossTypeMap = {
      '设备故障': '设备故障',
      '组件异常': '温度损耗',
      '逆变器故障': '其他损耗'
    }
    const targetLoss = lossTypeMap[value]
    if (targetLoss) {
      charts.lossBar.dispatchAction({
        type: 'highlight',
        name: targetLoss
      })
    }
  }
}

const downplayLinkedCharts = () => {
  Object.values(charts).forEach(chart => {
    if (chart) {
      chart.dispatchAction({ type: 'downplay' })
    }
  })
}

const updateLinkedCharts = () => {
  updatePowerTrendHighlight()
  updateFaultPieHighlight()
  updateLossBarHighlight()
}

const updatePowerTrendHighlight = () => {
  if (!charts.powerTrend) return
  charts.powerTrend.dispatchAction({ type: 'downplay' })
  if (linkedFilters.selectedDate) {
    charts.powerTrend.dispatchAction({
      type: 'highlight',
      name: linkedFilters.selectedDate
    })
  }
}

const updateFaultPieHighlight = () => {
  if (!charts.faultPie) return
  charts.faultPie.dispatchAction({ type: 'downplay' })
  if (linkedFilters.selectedFaultType) {
    charts.faultPie.dispatchAction({
      type: 'highlight',
      name: linkedFilters.selectedFaultType
    })
  }
}

const updateLossBarHighlight = () => {
  if (!charts.lossBar) return
  charts.lossBar.dispatchAction({ type: 'downplay' })
  if (linkedFilters.selectedLossType) {
    charts.lossBar.dispatchAction({
      type: 'highlight',
      name: linkedFilters.selectedLossType
    })
  }
}

const clearLinkedFilters = () => {
  linkedFilters.selectedDate = null
  linkedFilters.selectedFaultType = null
  linkedFilters.selectedLossType = null
  linkedFilters.selectedInverter = null
  linkedFilters.selectedTimeSlot = null
  downplayLinkedCharts()
  ElMessage.info('已清除所有联动筛选条件')
}

const getFilterTagType = (type) => {
  const types = {
    date: 'primary',
    fault: 'danger',
    loss: 'warning',
    time: 'success'
  }
  return types[type] || 'info'
}

const updatePowerTrend = () => {
  if (charts.powerTrend && powerTrendChart.value) {
    const data = generateMockPowerTrend(powerTrendType.value)
    charts.powerTrend.setOption(getLineChartOption(data))
  }
}

const updateYoYMoMChart = () => {
  if (charts.yoyMom && yoyMomChart.value) {
    charts.yoyMom.setOption(getYoYMoMChartOption(store.yoyMomData, yoyMomType.value))
  }
}

const generateMockPowerTrend = (type) => {
  const data = []
  let count = type === 'day' ? 24 : type === 'week' ? 7 : 30
  
  for (let i = 0; i < count; i++) {
    data.push({
      time: type === 'day' ? `${i}:00` : type === 'week' ? `周${['一','二','三','四','五','六','日'][i]}` : `${i+1}日`,
      value: Math.floor(Math.random() * 500 + 100)
    })
  }
  return data
}

const fetchData = async () => {
  try {
    store.loading = true
    
    store.updateStats({
      totalPower: Math.floor(Math.random() * 5000 + 10000),
      todayPower: Math.floor(Math.random() * 500 + 100),
      efficiency: Math.floor(Math.random() * 5 + 92),
      lossRate: Math.floor(Math.random() * 3 + 2),
      onlineRate: Math.floor(Math.random() * 3 + 95),
      faultCount: Math.floor(Math.random() * 10 + 5)
    })
    
    store.powerTrend = generateMockPowerTrend(powerTrendType.value)
    
    store.faultDistribution = [
      { name: '逆变器故障', value: Math.floor(Math.random() * 20 + 10) },
      { name: '组件异常', value: Math.floor(Math.random() * 15 + 5) },
      { name: '汇流箱故障', value: Math.floor(Math.random() * 10 + 3) },
      { name: '电网故障', value: Math.floor(Math.random() * 8 + 2) },
      { name: '通信中断', value: Math.floor(Math.random() * 6 + 1) }
    ]
    
    store.lossAnalysis = [
      { name: '遮挡损耗', value: Math.floor(Math.random() * 100 + 50) },
      { name: '温度损耗', value: Math.floor(Math.random() * 80 + 40) },
      { name: '线损', value: Math.floor(Math.random() * 60 + 30) },
      { name: '设备故障', value: Math.floor(Math.random() * 40 + 20) },
      { name: '其他损耗', value: Math.floor(Math.random() * 30 + 10) }
    ]
    
    store.inverterData = [
      { name: 'INV-001', power: 52.3, efficiency: 96.5, temperature: 42, status: '正常' },
      { name: 'INV-002', power: 48.7, efficiency: 95.8, temperature: 45, status: '正常' },
      { name: 'INV-003', power: 45.2, efficiency: 92.3, temperature: 58, status: '告警' },
      { name: 'INV-004', power: 51.8, efficiency: 97.2, temperature: 40, status: '正常' },
      { name: 'INV-005', power: 0, efficiency: 0, temperature: 25, status: '故障' }
    ]

    const yoyCurrent = Math.floor(Math.random() * 5000 + 10000)
    const yoyPrevious = Math.floor(Math.random() * 5000 + 8000)
    const momCurrent = Math.floor(Math.random() * 500 + 500)
    const momPrevious = Math.floor(Math.random() * 500 + 400)
    store.updateYoYMoM({
      yoy: {
        current: yoyCurrent,
        previous: yoyPrevious,
        changeValue: yoyCurrent - yoyPrevious,
        changeRate: +((yoyCurrent - yoyPrevious) / yoyPrevious * 100).toFixed(1),
        details: Array.from({ length: 12 }, (_, i) => ({
          time: `${i + 1}月`,
          current: Math.floor(Math.random() * 800 + 200),
          previous: Math.floor(Math.random() * 700 + 200)
        }))
      },
      mom: {
        current: momCurrent,
        previous: momPrevious,
        changeValue: momCurrent - momPrevious,
        changeRate: +((momCurrent - momPrevious) / momPrevious * 100).toFixed(1),
        details: Array.from({ length: 30 }, (_, i) => ({
          time: `${i + 1}日`,
          current: Math.floor(Math.random() * 100 + 20),
          previous: Math.floor(Math.random() * 90 + 20)
        }))
      }
    })

    store.updateFaultGeo([
      { name: '北京', coord: [116.46, 39.92], count: 12, severity: 'high' },
      { name: '上海', coord: [121.48, 31.22], count: 8, severity: 'medium' },
      { name: '广州', coord: [113.23, 23.16], count: 6, severity: 'low' },
      { name: '成都', coord: [104.06, 30.67], count: 15, severity: 'high' },
      { name: '西安', coord: [108.95, 34.27], count: 4, severity: 'low' },
      { name: '乌鲁木齐', coord: [87.68, 43.77], count: 20, severity: 'high' },
      { name: '兰州', coord: [103.73, 36.03], count: 9, severity: 'medium' },
      { name: '昆明', coord: [102.73, 25.04], count: 3, severity: 'low' }
    ])

    try {
      const [yoyRes, geoRes, layoutsRes] = await Promise.allSettled([
        getPowerYoYMoM({ start: store.timeRange.start, end: store.timeRange.end, station: store.selectedStation }),
        getFaultGeoDistribution({ start: store.timeRange.start, end: store.timeRange.end, station: store.selectedStation }),
        getLayouts()
      ])
      if (yoyRes.status === 'fulfilled' && yoyRes.value) store.updateYoYMoM(yoyRes.value)
      if (geoRes.status === 'fulfilled' && geoRes.value) store.updateFaultGeo(geoRes.value)
      if (layoutsRes.status === 'fulfilled' && layoutsRes.value) store.setSavedLayouts(layoutsRes.value)
    } catch (e) {
      // fallback to mock data already set above
    }

    initCharts()
    ElMessage.success('数据加载成功')
  } catch (error) {
    ElMessage.error('数据加载失败')
  } finally {
    store.loading = false
  }
}

const handleExport = async () => {
  try {
    ElMessage.info('正在生成报表...')
    const blob = new Blob(['报表导出测试内容'], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `光伏电站运维报表_${dayjs().format('YYYYMMDD')}.xlsx`
    link.click()
    URL.revokeObjectURL(url)
    ElMessage.success('报表导出成功')
  } catch (error) {
    ElMessage.error('报表导出失败')
  }
}

const handleResize = () => {
  Object.values(charts).forEach(chart => resizeChart(chart))
}

const handleLayoutCommand = (command) => {
  if (command.action === 'switch') {
    switchLayout(command.id)
  } else if (command.action === 'save') {
    layoutForm.name = ''
    layoutForm.isDefault = false
    layoutDialogVisible.value = true
  } else if (command.action === 'manage') {
    layoutManageVisible.value = true
  }
}

const saveCurrentLayout = async () => {
  if (!layoutForm.name.trim()) {
    ElMessage.warning('请输入布局名称')
    return
  }
  const layoutData = {
    name: layoutForm.name,
    isDefault: layoutForm.isDefault,
    config: {
      powerTrendType: powerTrendType.value,
      yoyMomType: yoyMomType.value,
      selectedStation: selectedStation.value
    }
  }
  try {
    const res = await saveLayoutApi(layoutData)
    if (res) {
      store.setSavedLayouts([...savedLayouts.value, res])
    }
    ElMessage.success('布局保存成功')
  } catch (e) {
    store.setSavedLayouts([...savedLayouts.value, { id: Date.now(), ...layoutData }])
    ElMessage.success('布局保存成功（本地）')
  }
  layoutDialogVisible.value = false
}

const switchLayout = (id) => {
  const layout = savedLayouts.value.find(l => l.id === id)
  if (layout && layout.config) {
    store.setCurrentLayout(layout)
    if (layout.config.powerTrendType) powerTrendType.value = layout.config.powerTrendType
    if (layout.config.yoyMomType) yoyMomType.value = layout.config.yoyMomType
    if (layout.config.selectedStation) {
      selectedStation.value = layout.config.selectedStation
      store.setSelectedStation(layout.config.selectedStation)
    }
    fetchData()
    ElMessage.success(`已切换到布局: ${layout.name}`)
  }
}

const deleteLayoutById = async (id) => {
  try {
    await deleteLayoutApi(id)
    store.setSavedLayouts(savedLayouts.value.filter(l => l.id !== id))
    ElMessage.success('布局已删除')
  } catch (e) {
    store.setSavedLayouts(savedLayouts.value.filter(l => l.id !== id))
    ElMessage.success('布局已删除（本地）')
  }
}

onMounted(() => {
  updateTime()
  timer = setInterval(updateTime, 1000)
  fetchData()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
  window.removeEventListener('resize', handleResize)
  
  chartEventHandlers.forEach(({ chart, event, handler }) => {
    if (chart && chart.off) {
      chart.off(event, handler)
    }
  })
  
  disposeAllCharts()
})

watch(() => store.timeRange, () => {
  fetchData()
}, { deep: true })
</script>

<style scoped lang="scss">
.dashboard {
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, #0a1628 0%, #0f2644 100%);
  padding: 0 20px 20px;
  overflow: hidden;
}

.dashboard-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 0;
  border-bottom: 1px solid rgba(64, 158, 255, 0.2);

  .title {
    font-size: 24px;
    font-weight: 700;
    background: linear-gradient(90deg, #409eff 0%, #00d4ff 50%, #409eff 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    display: flex;
    align-items: center;
    gap: 12px;

    .icon {
      font-size: 28px;
    }
  }

  .time-display {
    display: flex;
    align-items: center;
    gap: 8px;
    color: rgba(255, 255, 255, 0.7);

    .label {
      font-size: 14px;
    }

    .value {
      font-size: 18px;
      font-weight: 600;
      color: #00d4ff;
      font-family: 'Courier New', monospace;
    }
  }

  .query-panel {
    display: flex;
    align-items: center;
  }
}

.stats-row {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 16px;
  padding: 16px 0;
}

.charts-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
}

.charts-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  min-height: 300px;

  &:first-child {
    grid-template-columns: 1fr;
  }

  &:last-child {
    grid-template-columns: 1fr 1fr;
  }
}

.chart-card {
  background: linear-gradient(180deg, rgba(15, 38, 68, 0.8) 0%, rgba(15, 38, 68, 0.4) 100%);
  border: 1px solid rgba(64, 158, 255, 0.3);
  border-radius: 8px;
  padding: 16px;
  display: flex;
  flex-direction: column;

  &.large {
    height: 320px;
  }
}

.chart-body {
  flex: 1;
  min-height: 200px;
}

.gauge-container {
  flex: 1;
  display: flex;
  gap: 16px;

  .gauge-chart {
    flex: 1;
    min-height: 180px;
  }
}

.table-container {
  flex: 1;
  overflow: auto;

  :deep(.el-table) {
    background: transparent;

    th {
      background: rgba(64, 158, 255, 0.1) !important;
      color: #409eff;
      border-bottom: 1px solid rgba(64, 158, 255, 0.3);
    }

    td {
      border-bottom: 1px solid rgba(64, 158, 255, 0.1);
      color: rgba(255, 255, 255, 0.8);
    }

    .el-table__row:hover > td {
      background: rgba(64, 158, 255, 0.1) !important;
    }

    .el-table__row--striped td {
      background: rgba(64, 158, 255, 0.05);
    }
  }
}

.text-success {
  color: #67c23a;
}

.text-warning {
  color: #e6a23c;
}

.text-danger {
  color: #f56c6c;
}

.yoy-mom-section {
  display: flex;
  gap: 16px;
  padding: 0 0 0 0;

  .yoy-mom-chart-area {
    flex: 2;

    .chart-card {
      height: 320px;
    }
  }

  .yoy-mom-stats-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
}

.change-card {
  background: linear-gradient(180deg, rgba(15, 38, 68, 0.8) 0%, rgba(15, 38, 68, 0.4) 100%);
  border: 1px solid rgba(64, 158, 255, 0.3);
  border-radius: 8px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  flex: 1;

  .change-label {
    font-size: 14px;
    color: rgba(255, 255, 255, 0.7);
    margin-bottom: 10px;
  }

  .change-value {
    font-size: 32px;
    font-weight: 700;
    font-family: 'Courier New', monospace;
    display: flex;
    align-items: center;
    gap: 8px;

    .arrow {
      font-size: 28px;
    }
  }

  .change-detail {
    font-size: 13px;
    color: rgba(255, 255, 255, 0.5);
    margin-top: 8px;
  }

  &.positive {
    .change-value {
      color: #67c23a;
    }
    .arrow {
      color: #67c23a;
    }
    border-color: rgba(103, 194, 58, 0.3);
  }

  &.negative {
    .change-value {
      color: #f56c6c;
    }
    .arrow {
      color: #f56c6c;
    }
    border-color: rgba(245, 108, 108, 0.3);
  }
}
</style>
