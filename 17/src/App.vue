<template>
  <div id="app">
    <el-container class="layout-container">
      <el-header class="header">
        <div class="header-left">
          <el-icon class="logo-icon"><Water /></el-icon>
          <h1 class="title">水文时空序列数据多维度分析可视化系统</h1>
        </div>
        <div class="header-right">
          <el-tag type="success" v-if="connectionStatus === 'connected'" effect="dark">
            <el-icon><Connection /></el-icon>
            已连接
          </el-tag>
          <el-tag type="warning" v-else-if="connectionStatus === 'connecting'" effect="dark">
            <el-icon class="is-loading"><Loading /></el-icon>
            连接中
          </el-tag>
          <el-tag type="danger" v-else effect="dark">
            <el-icon><Connection /></el-icon>
            离线模式
          </el-tag>
          <el-button size="small" @click="toggleMockMode">
            {{ useMockMode ? '切换到实时' : '模拟模式' }}
          </el-button>
        </div>
      </el-header>

      <el-container>
        <el-aside class="aside" width="240px">
          <el-menu
            :default-active="activeMenu"
            class="side-menu"
            @select="handleMenuSelect"
          >
            <el-menu-item index="dashboard">
              <el-icon><Odometer /></el-icon>
              <span>数据概览</span>
            </el-menu-item>
            <el-menu-item index="waterLevel">
              <el-icon><Water /></el-icon>
              <span>水位监测</span>
            </el-menu-item>
            <el-menu-item index="flowVelocity">
              <el-icon><Promotion /></el-icon>
              <span>流速监测</span>
            </el-menu-item>
            <el-menu-item index="rainfall">
              <el-icon><Cloudy /></el-icon>
              <span>雨量监测</span>
            </el-menu-item>
            <el-menu-item index="heatmap">
              <el-icon><Histogram /></el-icon>
              <span>时空热力图</span>
            </el-menu-item>
            <el-menu-item index="statistics">
              <el-icon><DataAnalysis /></el-icon>
              <span>统计分析</span>
            </el-menu-item>
            <el-menu-item index="anomalyDetection">
              <el-icon><Warning /></el-icon>
              <span>异常检测</span>
            </el-menu-item>
            <el-menu-item index="basinComparison">
              <el-icon><Rank /></el-icon>
              <span>流域对比</span>
            </el-menu-item>
            <el-menu-item index="dataManage">
              <el-icon><DataLine /></el-icon>
              <span>数据管理</span>
            </el-menu-item>
          </el-menu>
        </el-aside>

        <el-main class="main-content">
          <div class="control-panel">
            <el-form inline>
              <el-form-item label="监测站点">
                <el-select
                  v-model="selectedStation"
                  placeholder="请选择站点"
                  style="width: 200px"
                  @change="handleStationChange"
                >
                  <el-option
                    v-for="station in stationList"
                    :key="station.id"
                    :label="station.name"
                    :value="station.id"
                  />
                </el-select>
              </el-form-item>
              <el-form-item label="数据类型">
                <el-checkbox-group v-model="selectedDataTypes">
                  <el-checkbox value="waterLevel">水位</el-checkbox>
                  <el-checkbox value="flowVelocity">流速</el-checkbox>
                  <el-checkbox value="rainfall">雨量</el-checkbox>
                </el-checkbox-group>
              </el-form-item>
              <el-form-item label="时间范围">
                <el-date-picker
                  v-model="timeRange"
                  type="datetimerange"
                  range-separator="至"
                  start-placeholder="开始时间"
                  end-placeholder="结束时间"
                  style="width: 360px"
                  @change="handleTimeRangeChange"
                />
              </el-form-item>
              <el-form-item>
                <el-button type="primary" @click="loadData" :loading="loading">
                  <el-icon><Search /></el-icon>
                  查询
                </el-button>
                <el-button @click="resetFilters">
                  <el-icon><RefreshRight /></el-icon>
                  重置
                </el-button>
              </el-form-item>
            </el-form>
          </div>

          <div v-if="activeMenu === 'dashboard'" class="dashboard">
            <el-row :gutter="16" class="stats-row">
              <el-col :span="6">
                <el-card shadow="hover" class="stat-card">
                  <div class="stat-item water-level">
                    <div class="stat-icon"><el-icon><Water /></el-icon></div>
                    <div class="stat-info">
                      <div class="stat-label">当前水位</div>
                      <div class="stat-value">{{ dashboardStats.waterLevel?.toFixed(2) || '-' }} m</div>
                    </div>
                  </div>
                </el-card>
              </el-col>
              <el-col :span="6">
                <el-card shadow="hover" class="stat-card">
                  <div class="stat-item flow-velocity">
                    <div class="stat-icon"><el-icon><Promotion /></el-icon></div>
                    <div class="stat-info">
                      <div class="stat-label">当前流速</div>
                      <div class="stat-value">{{ dashboardStats.flowVelocity?.toFixed(2) || '-' }} m/s</div>
                    </div>
                  </div>
                </el-card>
              </el-col>
              <el-col :span="6">
                <el-card shadow="hover" class="stat-card">
                  <div class="stat-item rainfall">
                    <div class="stat-icon"><el-icon><Cloudy /></el-icon></div>
                    <div class="stat-info">
                      <div class="stat-label">累计雨量</div>
                      <div class="stat-value">{{ dashboardStats.rainfallSum?.toFixed(2) || '-' }} mm</div>
                    </div>
                  </div>
                </el-card>
              </el-col>
              <el-col :span="6">
                <el-card shadow="hover" class="stat-card">
                  <div class="stat-item data-count">
                    <div class="stat-icon"><el-icon><DataLine /></el-icon></div>
                    <div class="stat-info">
                      <div class="stat-label">数据总量</div>
                      <div class="stat-value">{{ dashboardStats.totalCount || 0 }} 条</div>
                    </div>
                  </div>
                </el-card>
              </el-col>
            </el-row>

            <el-row :gutter="16" class="chart-row">
              <el-col :span="12">
                <el-card shadow="hover">
                  <template #header>水位趋势</template>
                  <TrendChart
                    :data="waterLevelData"
                    title="水位趋势分析"
                    y-field="waterLevel"
                    y-axis-name="水位 (m)"
                    unit="m"
                    :threshold="7.5"
                    @refresh="refreshWaterLevel"
                  />
                </el-card>
              </el-col>
              <el-col :span="12">
                <el-card shadow="hover">
                  <template #header>流速趋势</template>
                  <TrendChart
                    :data="flowVelocityData"
                    title="流速趋势分析"
                    y-field="flowVelocity"
                    y-axis-name="流速 (m/s)"
                    unit="m/s"
                    @refresh="refreshFlowVelocity"
                  />
                </el-card>
              </el-col>
            </el-row>

            <el-row :gutter="16" class="chart-row">
              <el-col :span="24">
                <el-card shadow="hover">
                  <template #header>统计分析面板</template>
                  <StatsPanel :stats="analysisStats" />
                </el-card>
              </el-col>
            </el-row>
          </div>

          <div v-else-if="activeMenu === 'waterLevel'" class="monitor-panel">
            <el-card shadow="hover">
              <template #header>水位监测数据</template>
              <TrendChart
                :data="waterLevelData"
                title="水位变化趋势"
                y-field="waterLevel"
                y-axis-name="水位 (m)"
                unit="m"
                :threshold="7.5"
                @refresh="refreshWaterLevel"
              />
            </el-card>
            <el-card shadow="hover" style="margin-top: 16px">
              <template #header>水位数据列表</template>
              <DataTable
                :data="waterLevelData"
                :columns="waterLevelColumns"
                title="水位数据"
                :loading="loading"
                export-filename="水位数据.xlsx"
                @refresh="refreshWaterLevel"
              />
            </el-card>
          </div>

          <div v-else-if="activeMenu === 'flowVelocity'" class="monitor-panel">
            <el-card shadow="hover">
              <template #header>流速监测数据</template>
              <TrendChart
                :data="flowVelocityData"
                title="流速变化趋势"
                y-field="flowVelocity"
                y-axis-name="流速 (m/s)"
                unit="m/s"
                @refresh="refreshFlowVelocity"
              />
            </el-card>
            <el-card shadow="hover" style="margin-top: 16px">
              <template #header>流速数据列表</template>
              <DataTable
                :data="flowVelocityData"
                :columns="flowVelocityColumns"
                title="流速数据"
                :loading="loading"
                export-filename="流速数据.xlsx"
                @refresh="refreshFlowVelocity"
              />
            </el-card>
          </div>

          <div v-else-if="activeMenu === 'rainfall'" class="monitor-panel">
            <el-card shadow="hover">
              <template #header>雨量监测数据</template>
              <TrendChart
                :data="rainfallData"
                title="雨量变化趋势"
                y-field="rainfall"
                y-axis-name="雨量 (mm)"
                unit="mm"
                @refresh="refreshRainfall"
              />
            </el-card>
            <el-card shadow="hover" style="margin-top: 16px">
              <template #header>雨量数据列表</template>
              <DataTable
                :data="rainfallData"
                :columns="rainfallColumns"
                title="雨量数据"
                :loading="loading"
                export-filename="雨量数据.xlsx"
                @refresh="refreshRainfall"
              />
            </el-card>
          </div>

          <div v-else-if="activeMenu === 'heatmap'" class="monitor-panel">
            <el-card shadow="hover">
              <template #header>时空热力图</template>
              <Heatmap
                :data="heatmapData"
                title="时空分布热力图"
                @data-type-change="handleHeatmapDataTypeChange"
                @refresh="refreshHeatmap"
              />
            </el-card>
          </div>

          <div v-else-if="activeMenu === 'statistics'" class="monitor-panel">
            <el-card shadow="hover">
              <template #header>多维度统计分析</template>
              <StatsPanel :stats="fullAnalysisStats" :show-detail="true" />
            </el-card>

            <el-row :gutter="16" style="margin-top: 16px">
              <el-col :span="12">
                <el-card shadow="hover">
                  <template #header>水位统计分析</template>
                  <TrendChart
                    :data="waterLevelData"
                    title="水位趋势分析"
                    y-field="waterLevel"
                    y-axis-name="水位 (m)"
                    unit="m"
                    :show-stats="true"
                  />
                </el-card>
              </el-col>
              <el-col :span="12">
                <el-card shadow="hover">
                  <template #header>流速统计分析</template>
                  <TrendChart
                    :data="flowVelocityData"
                    title="流速趋势分析"
                    y-field="flowVelocity"
                    y-axis-name="流速 (m/s)"
                    unit="m/s"
                    :show-stats="true"
                  />
                </el-card>
              </el-col>
            </el-row>
          </div>

          <div v-else-if="activeMenu === 'anomalyDetection'" class="monitor-panel">
            <el-card shadow="hover">
              <template #header>
                异常区间检测
                <el-tag size="small" type="info" style="margin-left: 12px">
                  支持 Z-Score / IQR / 滚动检测
                </el-tag>
              </template>
              <el-tabs v-model="anomalyActiveTab">
                <el-tab-pane label="水位异常" name="waterLevel">
                  <AnomalyMarker
                    :data="waterLevelData"
                    value-field="waterLevel"
                    y-axis-name="水位 (m)"
                    unit="m"
                    :warning-level="7.5"
                    :alert-level="8.5"
                  />
                </el-tab-pane>
                <el-tab-pane label="流速异常" name="flowVelocity">
                  <AnomalyMarker
                    :data="flowVelocityData"
                    value-field="flowVelocity"
                    y-axis-name="流速 (m/s)"
                    unit="m/s"
                    :warning-level="3.5"
                    :alert-level="5.0"
                  />
                </el-tab-pane>
                <el-tab-pane label="雨量异常" name="rainfall">
                  <AnomalyMarker
                    :data="rainfallData"
                    value-field="rainfall"
                    y-axis-name="雨量 (mm)"
                    unit="mm"
                    :warning-level="50"
                    :alert-level="100"
                  />
                </el-tab-pane>
              </el-tabs>
            </el-card>
          </div>

          <div v-else-if="activeMenu === 'basinComparison'" class="monitor-panel">
            <el-card shadow="hover">
              <template #header>
                多流域数据对比分析
                <el-tag size="small" type="info" style="margin-left: 12px">
                  支持趋势/统计/相关性对比
                </el-tag>
              </template>
              <div class="basin-selector">
                <el-form inline>
                  <el-form-item label="对比流域">
                    <el-checkbox-group v-model="selectedBasins">
                      <el-checkbox
                        v-for="basin in basins"
                        :key="basin.id"
                        :value="basin.id"
                      >
                        {{ basin.name }}
                      </el-checkbox>
                    </el-checkbox-group>
                  </el-form-item>
                </el-form>
              </div>
              <BasinComparison
                :basin-data-list="basinComparisonData"
                :default-value-field="comparisonField"
                @field-change="handleComparisonFieldChange"
                @refresh="refreshComparisonData"
              />
            </el-card>
          </div>

          <div v-else-if="activeMenu === 'dataManage'" class="monitor-panel">
            <el-card shadow="hover">
              <template #header>
                数据清洗与管理
                <el-button type="primary" size="small" style="margin-left: 16px" @click="runDataCleaning">
                  <el-icon><MagicStick /></el-icon>
                  执行数据清洗
                </el-button>
                <el-button type="success" size="small" @click="exportAllData">
                  <el-icon><Download /></el-icon>
                  导出全部数据
                </el-button>
              </template>

              <el-tabs v-model="activeDataTab">
                <el-tab-pane label="原始数据" name="raw">
                  <DataTable
                    :data="rawData"
                    :columns="rawDataColumns"
                    title="原始数据"
                    :loading="loading"
                  />
                </el-tab-pane>
                <el-tab-pane label="清洗后数据" name="cleaned">
                  <DataTable
                    :data="cleanedData"
                    :columns="cleanedDataColumns"
                    title="清洗后数据"
                    :loading="cleaningLoading"
                  />
                </el-tab-pane>
                <el-tab-pane label="清洗报告" name="report">
                  <div class="cleaning-report" v-if="cleaningReport">
                    <el-descriptions :column="2" border>
                      <el-descriptions-item label="数据总量">{{ cleaningReport.total }}</el-descriptions-item>
                      <el-descriptions-item label="清洗后数量">{{ cleaningReport.cleaned }}</el-descriptions-item>
                      <el-descriptions-item label="移除数量">{{ cleaningReport.removed }}</el-descriptions-item>
                      <el-descriptions-item label="清洗率">{{ ((cleaningReport.cleaned / cleaningReport.total) * 100).toFixed(2) }}%</el-descriptions-item>
                    </el-descriptions>

                    <el-divider>清洗步骤</el-divider>

                    <el-timeline>
                      <el-timeline-item
                        v-for="(step, index) in cleaningReport.steps"
                        :key="index"
                        :timestamp="step.time"
                        placement="top"
                      >
                        <el-card>
                          <h4>{{ step.name }}</h4>
                          <p v-if="step.before !== undefined">处理前: {{ step.before }} 条</p>
                          <p v-if="step.after !== undefined">处理后: {{ step.after }} 条</p>
                          <p v-if="step.details">{{ step.details }}</p>
                        </el-card>
                      </el-timeline-item>
                    </el-timeline>
                  </div>
                  <el-empty v-else description="暂无清洗报告，请先执行数据清洗" />
                </el-tab-pane>
              </el-tabs>
            </el-card>
          </div>
        </el-main>
      </el-container>

      <el-footer class="footer">
        <span>水文时空序列数据多维度分析可视化系统 v1.0.0</span>
        <span>{{ currentTime }}</span>
      </el-footer>
    </el-container>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { ElMessage } from 'element-plus'
import {
  Water,
  Odometer,
  Promotion,
  Cloudy,
  Histogram,
  DataAnalysis,
  DataLine,
  Search,
  RefreshRight,
  Connection,
  Loading,
  Download,
  MagicStick
} from '@element-plus/icons-vue'
import dayjs from 'dayjs'
import TrendChart from '@/components/TrendChart.vue'
import Heatmap from '@/components/Heatmap.vue'
import DataTable from '@/components/DataTable.vue'
import StatsPanel from '@/components/StatsPanel.vue'
import AnomalyMarker from '@/components/AnomalyMarker.vue'
import BasinComparison from '@/components/BasinComparison.vue'
import { hydrologyApi } from '@/api/hydrology'
import { dataCleaning } from '@/services/dataCleaning'
import { statisticsService } from '@/services/statistics'
import { exportService } from '@/services/export'
import { mockDataGenerator } from '@/utils/mockData'
import { performanceUtils } from '@/utils/performance'

const activeMenu = ref('dashboard')
const loading = ref(false)
const cleaningLoading = ref(false)
const useMockMode = ref(true)
const connectionStatus = ref('connected')
const currentTime = ref('')
let timer = null

const stationList = ref([])
const selectedStation = ref('')
const selectedDataTypes = ref(['waterLevel', 'flowVelocity', 'rainfall'])
const timeRange = ref([
  dayjs().subtract(7, 'day').toDate(),
  dayjs().toDate()
])

const waterLevelData = ref([])
const flowVelocityData = ref([])
const rainfallData = ref([])
const heatmapData = ref({ heatmapData: [], xAxis: [], yAxis: [] })
const rawData = ref([])
const cleanedData = ref([])
const cleaningReport = ref(null)
const activeDataTab = ref('raw')

const dashboardStats = ref({
  waterLevel: 0,
  flowVelocity: 0,
  rainfallSum: 0,
  totalCount: 0
})

const analysisStats = ref({
  waterLevel: { mean: 0, max: 0, min: 0, trend: 'stable' },
  flowVelocity: { mean: 0, max: 0, min: 0, trend: 'stable' },
  rainfall: { sum: 0, mean: 0, max: 0, trend: 'stable' },
  anomalyCount: 0,
  quality: '正常',
  timeRange: '最近7天'
})

const fullAnalysisStats = ref({})

const anomalyActiveTab = ref('waterLevel')
const basins = ref([])
const selectedBasins = ref([])
const basinComparisonData = ref([])
const comparisonField = ref('waterLevel')

const waterLevelColumns = [
  { key: 'timestamp', label: '时间', width: 180 },
  { key: 'stationName', label: '站点', width: 120 },
  { key: 'waterLevel', label: '水位 (m)', width: 100 },
  { key: 'warningLevel', label: '预警水位 (m)', width: 120 },
  { key: 'status', label: '状态', width: 80 },
  { key: 'quality', label: '数据质量', width: 100 }
]

const flowVelocityColumns = [
  { key: 'timestamp', label: '时间', width: 180 },
  { key: 'stationName', label: '站点', width: 120 },
  { key: 'flowVelocity', label: '流速 (m/s)', width: 120 },
  { key: 'direction', label: '流向', width: 80 },
  { key: 'status', label: '状态', width: 80 },
  { key: 'quality', label: '数据质量', width: 100 }
]

const rainfallColumns = [
  { key: 'timestamp', label: '时间', width: 180 },
  { key: 'stationName', label: '站点', width: 120 },
  { key: 'rainfall', label: '雨量 (mm)', width: 100 },
  { key: 'rainfallType', label: '降雨类型', width: 100 },
  { key: 'status', label: '状态', width: 80 },
  { key: 'quality', label: '数据质量', width: 100 }
]

const rawDataColumns = [
  { key: 'timestamp', label: '时间', width: 180 },
  { key: 'stationName', label: '站点', width: 120 },
  { key: 'waterLevel', label: '水位 (m)', width: 100 },
  { key: 'flowVelocity', label: '流速 (m/s)', width: 120 },
  { key: 'rainfall', label: '雨量 (mm)', width: 100 }
]

const cleanedDataColumns = [
  { key: 'timestamp', label: '时间', width: 180 },
  { key: 'stationName', label: '站点', width: 120 },
  { key: 'waterLevel', label: '水位 (m)', width: 100 },
  { key: 'flowVelocity', label: '流速 (m/s)', width: 120 },
  { key: 'rainfall', label: '雨量 (mm)', width: 100 },
  { key: 'waterLevel_smoothed', label: '水位平滑', width: 120 }
]

const handleMenuSelect = (index) => {
  activeMenu.value = index
}

const handleStationChange = () => {
  loadData()
}

const handleTimeRangeChange = () => {
  loadData()
}

const handleHeatmapDataTypeChange = (dataType) => {
  loadHeatmapData(dataType)
}

const getTimeParams = () => {
  const [start, end] = timeRange.value || []
  return {
    startTime: start ? dayjs(start).toISOString() : dayjs().subtract(7, 'day').toISOString(),
    endTime: end ? dayjs(end).toISOString() : dayjs().toISOString()
  }
}

const loadData = async () => {
  loading.value = true
  try {
    const timeParams = getTimeParams()
    const stationId = selectedStation.value || stationList.value[0]?.id || 'ST001'

    if (useMockMode.value) {
      await loadMockData(stationId, timeParams)
    } else {
      await loadApiData(stationId, timeParams)
    }

    updateDashboardStats()
    updateAnalysisStats()
    loadBasinComparisonData()

    ElMessage.success('数据加载成功')
  } catch (error) {
    console.error('数据加载失败:', error)
    ElMessage.error('数据加载失败，已切换到模拟数据模式')
    useMockMode.value = true
    const timeParams = getTimeParams()
    const stationId = selectedStation.value || 'ST001'
    await loadMockData(stationId, timeParams)
    updateDashboardStats()
    updateAnalysisStats()
    loadBasinComparisonData()
  } finally {
    loading.value = false
  }
}

const loadMockData = async (stationId, timeParams) => {
  if (selectedDataTypes.value.includes('waterLevel')) {
    const result = mockDataGenerator.generateWaterLevelData({
      stationId,
      ...timeParams,
      page: 1,
      pageSize: 500
    })
    waterLevelData.value = result.data || []
  }

  if (selectedDataTypes.value.includes('flowVelocity')) {
    const result = mockDataGenerator.generateFlowVelocityData({
      stationId,
      ...timeParams,
      page: 1,
      pageSize: 500
    })
    flowVelocityData.value = result.data || []
  }

  if (selectedDataTypes.value.includes('rainfall')) {
    const result = mockDataGenerator.generateRainfallData({
      stationId,
      ...timeParams,
      page: 1,
      pageSize: 500
    })
    rainfallData.value = result.data || []
  }

  const heatmapResult = mockDataGenerator.generateHeatmapData({ stationId })
  heatmapData.value = heatmapResult.data || { heatmapData: [], xAxis: [], yAxis: [] }

  rawData.value = [
    ...waterLevelData.value,
    ...flowVelocityData.value,
    ...rainfallData.value
  ]
}

const loadApiData = async (stationId, timeParams) => {
  const promises = []

  if (selectedDataTypes.value.includes('waterLevel')) {
    promises.push(
      hydrologyApi.getWaterLevelData({ stationId, ...timeParams })
        .then((res) => { waterLevelData.value = res.data || res.rows || [] })
    )
  }

  if (selectedDataTypes.value.includes('flowVelocity')) {
    promises.push(
      hydrologyApi.getFlowVelocityData({ stationId, ...timeParams })
        .then((res) => { flowVelocityData.value = res.data || res.rows || [] })
    )
  }

  if (selectedDataTypes.value.includes('rainfall')) {
    promises.push(
      hydrologyApi.getRainfallData({ stationId, ...timeParams })
        .then((res) => { rainfallData.value = res.data || res.rows || [] })
    )
  }

  await Promise.all(promises)

  rawData.value = [
    ...waterLevelData.value,
    ...flowVelocityData.value,
    ...rainfallData.value
  ]
}

const loadHeatmapData = async (dataType) => {
  const stationId = selectedStation.value || 'ST001'
  if (useMockMode.value) {
    const result = mockDataGenerator.generateHeatmapData({ stationId, dataType })
    heatmapData.value = result.data || { heatmapData: [], xAxis: [], yAxis: [] }
  }
}

const updateDashboardStats = () => {
  const waterLevels = waterLevelData.value.map((item) => item.waterLevel).filter((v) => v !== undefined)
  const flowVelocities = flowVelocityData.value.map((item) => item.flowVelocity).filter((v) => v !== undefined)
  const rainfalls = rainfallData.value.map((item) => item.rainfall).filter((v) => v !== undefined)

  dashboardStats.value = {
    waterLevel: waterLevels.length > 0 ? waterLevels[waterLevels.length - 1] : 0,
    flowVelocity: flowVelocities.length > 0 ? flowVelocities[flowVelocities.length - 1] : 0,
    rainfallSum: rainfalls.reduce((a, b) => a + b, 0),
    totalCount: rawData.value.length
  }
}

const updateAnalysisStats = () => {
  const waterLevelStats = waterLevelData.value.length > 0
    ? statisticsService.calculateBasicStats(waterLevelData.value, 'waterLevel')
    : null
  const flowVelocityStats = flowVelocityData.value.length > 0
    ? statisticsService.calculateBasicStats(flowVelocityData.value, 'flowVelocity')
    : null
  const rainfallStats = rainfallData.value.length > 0
    ? statisticsService.calculateBasicStats(rainfallData.value, 'rainfall')
    : null

  const waterLevelTrend = waterLevelData.value.length > 10
    ? statisticsService.calculateTrend(waterLevelData.value, 'timestamp', 'waterLevel')
    : null
  const flowVelocityTrend = flowVelocityData.value.length > 10
    ? statisticsService.calculateTrend(flowVelocityData.value, 'timestamp', 'flowVelocity')
    : null
  const rainfallTrend = rainfallData.value.length > 10
    ? statisticsService.calculateTrend(rainfallData.value, 'timestamp', 'rainfall')
    : null

  analysisStats.value = {
    waterLevel: {
      ...waterLevelStats,
      trend: waterLevelTrend?.trend || 'stable'
    },
    flowVelocity: {
      ...flowVelocityStats,
      trend: flowVelocityTrend?.trend || 'stable'
    },
    rainfall: {
      sum: rainfallStats ? rainfalls.reduce((a, b) => a + b, 0) : 0,
      ...rainfallStats,
      trend: rainfallTrend?.trend || 'stable'
    },
    anomalyCount: rawData.value.filter((item) => item.quality === '异常').length,
    quality: rawData.value.filter((item) => item.quality === '异常').length > 0 ? '存在异常' : '正常',
    timeRange: `${dayjs(timeRange.value[0]).format('YYYY-MM-DD')} 至 ${dayjs(timeRange.value[1]).format('YYYY-MM-DD')}`
  }

  fullAnalysisStats.value = statisticsService.getFullAnalysisReport(waterLevelData.value, {
    timeField: 'timestamp',
    valueField: 'waterLevel',
    locationField: 'stationName',
    interval: 'hour'
  })
}

const refreshWaterLevel = () => {
  loadData()
}

const refreshFlowVelocity = () => {
  loadData()
}

const refreshRainfall = () => {
  loadData()
}

const refreshHeatmap = () => {
  const dataType = selectedDataTypes.value[0] || 'waterLevel'
  loadHeatmapData(dataType)
}

const resetFilters = () => {
  selectedStation.value = stationList.value[0]?.id || ''
  selectedDataTypes.value = ['waterLevel', 'flowVelocity', 'rainfall']
  timeRange.value = [
    dayjs().subtract(7, 'day').toDate(),
    dayjs().toDate()
  ]
  loadData()
}

const runDataCleaning = async () => {
  if (rawData.value.length === 0) {
    ElMessage.warning('请先加载数据')
    return
  }

  cleaningLoading.value = true
  try {
    const steps = []
    let currentData = [...rawData.value]

    const dedupResult = dataCleaning.removeDuplicates(currentData, 'timestamp')
    steps.push({
      name: '数据去重',
      before: currentData.length,
      after: dedupResult.length,
      time: dayjs().format('HH:mm:ss'),
      details: `移除重复数据 ${currentData.length - dedupResult.length} 条`
    })
    currentData = dedupResult

    const cleanWLResult = dataCleaning.cleanWaterLevelData(currentData)
    steps.push({
      name: '水位数据清洗',
      before: currentData.length,
      after: cleanWLResult.cleanedData.length,
      time: dayjs().format('HH:mm:ss'),
      details: `移除异常数据 ${cleanWLResult.stats.removed} 条`
    })

    currentData = dataCleaning.fillMissingValues(currentData, 'waterLevel', 'linear')
    steps.push({
      name: '缺失值填充',
      time: dayjs().format('HH:mm:ss'),
      details: '使用线性插值填充缺失值'
    })

    currentData = dataCleaning.smoothData(currentData, 'waterLevel', 3)
    steps.push({
      name: '数据平滑',
      time: dayjs().format('HH:mm:ss'),
      details: '使用3点移动平均进行平滑处理'
    })

    const outlierResult = dataCleaning.detectOutliers(currentData, 'waterLevel', 3)
    currentData = outlierResult.cleanData
    steps.push({
      name: '异常值检测',
      time: dayjs().format('HH:mm:ss'),
      details: `检测到异常值 ${outlierResult.outliers.length} 个`
    })

    cleanedData.value = currentData
    cleaningReport.value = {
      total: rawData.value.length,
      cleaned: currentData.length,
      removed: rawData.value.length - currentData.length,
      steps
    }

    activeDataTab.value = 'cleaned'
    ElMessage.success('数据清洗完成')
  } catch (error) {
    console.error('数据清洗失败:', error)
    ElMessage.error('数据清洗失败')
  } finally {
    cleaningLoading.value = false
  }
}

const exportAllData = () => {
  if (rawData.value.length === 0) {
    ElMessage.warning('暂无数据可导出')
    return
  }

  exportService.exportMultiSheetExcel(
    [
      { name: '水位数据', data: waterLevelData.value, headers: waterLevelColumns },
      { name: '流速数据', data: flowVelocityData.value, headers: flowVelocityColumns },
      { name: '雨量数据', data: rainfallData.value, headers: rainfallColumns }
    ],
    '水文监测数据.xlsx'
  )
  ElMessage.success('数据导出成功')
}

const toggleMockMode = () => {
  useMockMode.value = !useMockMode.value
  connectionStatus.value = useMockMode.value ? 'connected' : 'connecting'

  if (!useMockMode.value) {
    setTimeout(() => {
      connectionStatus.value = 'connected'
    }, 1500)
  }

  loadData()
}

const loadStationList = () => {
  if (useMockMode.value) {
    stationList.value = mockDataGenerator.generateStations()
    selectedStation.value = stationList.value[0]?.id || ''
    basins.value = mockDataGenerator.generateBasins()
    selectedBasins.value = basins.value.slice(0, 3).map(b => b.id)
  }
}

const loadBasinComparisonData = performanceUtils.debounce(async () => {
  if (selectedBasins.value.length === 0) {
    basinComparisonData.value = []
    return
  }

  const timeParams = getTimeParams()
  const comparisonData = []

  for (const basinId of selectedBasins.value) {
    const basin = basins.value.find(b => b.id === basinId)
    const basinStations = stationList.value.filter(s => s.basin === basin?.name)

    if (basinStations.length === 0) continue

    const stationId = basinStations[0].id

    if (useMockMode.value) {
      let dataSource = []
      if (comparisonField.value === 'waterLevel') {
        const result = mockDataGenerator.generateWaterLevelData({
          stationId,
          ...timeParams,
          page: 1,
          pageSize: 500
        })
        dataSource = result.data || []
      } else if (comparisonField.value === 'flowVelocity') {
        const result = mockDataGenerator.generateFlowVelocityData({
          stationId,
          ...timeParams,
          page: 1,
          pageSize: 500
        })
        dataSource = result.data || []
      } else {
        const result = mockDataGenerator.generateRainfallData({
          stationId,
          ...timeParams,
          page: 1,
          pageSize: 500
        })
        dataSource = result.data || []
      }

      comparisonData.push({
        basinName: basin?.name || basinId,
        basinId,
        data: dataSource
      })
    }
  }

  basinComparisonData.value = comparisonData
}, 300)

const handleComparisonFieldChange = (field) => {
  comparisonField.value = field
  loadBasinComparisonData()
}

const refreshComparisonData = () => {
  loadBasinComparisonData()
}

watch(
  () => selectedBasins.value,
  () => {
    if (activeMenu.value === 'basinComparison') {
      loadBasinComparisonData()
    }
  },
  { deep: true }
)

const updateTime = () => {
  currentTime.value = dayjs().format('YYYY-MM-DD HH:mm:ss')
}

onMounted(() => {
  loadStationList()
  loadData()
  updateTime()
  timer = setInterval(updateTime, 1000)
})

onUnmounted(() => {
  if (timer) {
    clearInterval(timer)
  }
})
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body, #app {
  height: 100%;
  margin: 0;
  padding: 0;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  background: #f0f2f5;
}
</style>

<style scoped>
.layout-container {
  height: 100vh;
}

.header {
  background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
  color: #fff;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.header-left {
  display: flex;
  align-items: center;
}

.logo-icon {
  font-size: 28px;
  margin-right: 12px;
}

.title {
  font-size: 20px;
  font-weight: 600;
  margin: 0;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.aside {
  background: #fff;
  box-shadow: 2px 0 8px rgba(0, 0, 0, 0.06);
}

.side-menu {
  border-right: none;
}

.side-menu .el-menu-item {
  height: 56px;
  line-height: 56px;
}

.side-menu .el-menu-item.is-active {
  background: #ecf5ff;
  color: #409EFF;
  border-right: 3px solid #409EFF;
}

.main-content {
  background: #f0f2f5;
  padding: 16px;
  overflow-y: auto;
}

.control-panel {
  background: #fff;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.dashboard {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.stats-row {
  margin-bottom: 0;
}

.stat-card {
  border-radius: 8px;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 12px;
}

.stat-icon {
  width: 48px;
  height: 48px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  color: #fff;
}

.stat-icon.water-level {
  background: linear-gradient(135deg, #409EFF 0%, #66b1ff 100%);
}

.stat-icon.flow-velocity {
  background: linear-gradient(135deg, #67C23A 0%, #85ce61 100%);
}

.stat-icon.rainfall {
  background: linear-gradient(135deg, #E6A23C 0%, #ebb563 100%);
}

.stat-icon.data-count {
  background: linear-gradient(135deg, #909399 0%, #a6a9ad 100%);
}

.stat-label {
  font-size: 13px;
  color: #666;
  margin-bottom: 4px;
}

.stat-value {
  font-size: 22px;
  font-weight: 600;
  color: #333;
}

.chart-row {
  margin-bottom: 0;
}

.monitor-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.footer {
  background: #fff;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 24px;
  color: #666;
  font-size: 13px;
  border-top: 1px solid #e4e7ed;
}

.cleaning-report {
  padding: 16px;
}

.cleaning-report h4 {
  margin: 0 0 8px 0;
  color: #333;
}

.cleaning-report p {
  margin: 4px 0;
  color: #666;
  font-size: 13px;
}

.basin-selector {
  margin-bottom: 16px;
  padding: 12px;
  background: #f9f9f9;
  border-radius: 6px;
}

:deep(.el-card__header) {
  padding: 12px 16px;
  background: #fafafa;
  border-bottom: 1px solid #ebeef5;
}

:deep(.el-card__body) {
  padding: 16px;
}
</style>
