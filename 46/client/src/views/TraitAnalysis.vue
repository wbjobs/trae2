<template>
  <div class="page-container">
    <div class="page-header">
      <h1 class="page-title">种质性状年度对比分析</h1>
    </div>

    <el-card shadow="never" class="filter-card">
      <el-form :inline="true" :model="filters">
        <el-form-item label="种质资源">
          <el-select
            v-model="filters.germplasm_id"
            filterable
            placeholder="请选择种质资源"
            style="width: 280px"
            @change="loadAnalysis"
          >
            <el-option
              v-for="g in germplasmOptions"
              :key="g.id"
              :label="`${g.resource_no} - ${g.name}`"
              :value="g.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="性状名称">
          <el-select
            v-model="filters.trait_name"
            filterable
            clearable
            placeholder="全部性状"
            style="width: 200px"
            @change="loadAnalysis"
          >
            <el-option
              v-for="t in traitOptions"
              :key="t"
              :label="t"
              :value="t"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="对比年份">
          <el-select
            v-model="selectedYears"
            multiple
            placeholder="选择年份"
            style="width: 280px"
            @change="loadAnalysis"
          >
            <el-option
              v-for="y in availableYears"
              :key="y"
              :label="`${y}年`"
              :value="y"
            />
          </el-select>
        </el-form-item>
      </el-form>
    </el-card>

    <div v-if="loading" class="loading-container">
      <el-icon class="is-loading" :size="32"><Loading /></el-icon>
      <p>加载分析数据...</p>
    </div>

    <div v-else-if="!analysisData.traits || analysisData.traits.length === 0" class="empty-container">
      <el-empty description="请选择种质资源查看性状对比分析" />
    </div>

    <template v-else>
      <el-card v-for="trait in analysisData.traits" :key="trait.trait_name" class="trait-card">
        <template #header>
          <div class="trait-header">
            <span class="trait-name">{{ trait.trait_name }}</span>
            <el-tag size="small">性状对比</el-tag>
          </div>
        </template>

        <div class="chart-container">
          <v-chart class="chart" :option="getYearlyChartOption(trait)" autoresize />
        </div>

        <el-table :data="trait.yearly_data" border size="small" style="margin-top: 16px">
          <el-table-column prop="year" label="年份" width="100" align="center">
            <template #default="{ row }">
              <span class="year-badge">{{ row.year }}年</span>
            </template>
          </el-table-column>
          <el-table-column prop="count" label="记录数" width="100" align="center" />
          <el-table-column prop="avg_value" label="平均值" width="120" align="center">
            <template #default="{ row }">
              <span v-if="row.avg_value !== null" class="value-cell">{{ row.avg_value }}</span>
              <span v-else style="color: #c0c4cc">-</span>
            </template>
          </el-table-column>
          <el-table-column prop="min_value" label="最小值" width="120" align="center">
            <template #default="{ row }">
              <span v-if="row.min_value !== null" class="value-cell min">{{ row.min_value }}</span>
              <span v-else style="color: #c0c4cc">-</span>
            </template>
          </el-table-column>
          <el-table-column prop="max_value" label="最大值" width="120" align="center">
            <template #default="{ row }">
              <span v-if="row.max_value !== null" class="value-cell max">{{ row.max_value }}</span>
              <span v-else style="color: #c0c4cc">-</span>
            </template>
          </el-table-column>
          <el-table-column label="变化率" width="120" align="center">
            <template #default="{ row, $index }">
              <span v-if="$index > 0 && trait.yearly_data[$index - 1].avg_value !== null && row.avg_value !== null">
                <el-tag
                  :type="getChangeType(trait.yearly_data[$index - 1].avg_value, row.avg_value)"
                  size="small"
                >
                  {{ getChangeRate(trait.yearly_data[$index - 1].avg_value, row.avg_value) }}%
                </el-tag>
              </span>
              <span v-else style="color: #c0c4cc">-</span>
            </template>
          </el-table-column>
        </el-table>
      </el-card>
    </template>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { api } from '@/api'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart, LineChart } from 'echarts/charts'
import {
  TitleComponent, TooltipComponent, LegendComponent,
  GridComponent, DataZoomComponent
} from 'echarts/components'

use([
  CanvasRenderer,
  BarChart, LineChart,
  TitleComponent, TooltipComponent, LegendComponent,
  GridComponent, DataZoomComponent
])

const loading = ref(false)
const germplasmOptions = ref([])
const traitOptions = ref([])
const availableYears = ref([])
const analysisData = ref({ traits: [] })

const filters = ref({
  germplasm_id: null,
  trait_name: ''
})

const selectedYears = ref([])

const colors = ['#409eff', '#67c23a', '#e6a23c', '#f56c6c', '#909399', '#9c27b0']

function getYearlyChartOption(trait) {
  const years = trait.yearly_data.map(d => `${d.year}年`)
  const avgValues = trait.yearly_data.map(d => d.avg_value)
  const minValues = trait.yearly_data.map(d => d.min_value)
  const maxValues = trait.yearly_data.map(d => d.max_value)

  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' }
    },
    legend: {
      data: ['平均值', '最小值', '最大值'],
      top: 0
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: years
    },
    yAxis: {
      type: 'value',
      name: '性状值'
    },
    series: [
      {
        name: '平均值',
        type: 'bar',
        data: avgValues,
        itemStyle: {
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: '#409eff' },
              { offset: 1, color: '#79bbff' }
            ]
          },
          borderRadius: [4, 4, 0, 0]
        }
      },
      {
        name: '最小值',
        type: 'line',
        data: minValues,
        smooth: true,
        lineStyle: { color: '#67c23a', width: 2 },
        itemStyle: { color: '#67c23a' }
      },
      {
        name: '最大值',
        type: 'line',
        data: maxValues,
        smooth: true,
        lineStyle: { color: '#f56c6c', width: 2 },
        itemStyle: { color: '#f56c6c' }
      }
    ]
  }
}

function getChangeType(prev, curr) {
  const diff = curr - prev
  if (diff > 0) return 'success'
  if (diff < 0) return 'danger'
  return 'info'
}

function getChangeRate(prev, curr) {
  if (prev === 0) return curr > 0 ? 100 : -100
  return ((curr - prev) / Math.abs(prev) * 100).toFixed(1)
}

async function loadGermplasmOptions() {
  try {
    const res = await api.germplasm.list({ pageSize: 100 })
    germplasmOptions.value = res.data.list || []
  } catch (e) {
    console.error(e)
  }
}

async function loadTraitOptions() {
  if (!filters.value.germplasm_id) {
    traitOptions.value = []
    return
  }
  try {
    const res = await api.trait.list({ germplasm_id: filters.value.germplasm_id, pageSize: 1 })
    const total = res.data.total
    const allRes = await api.trait.list({ germplasm_id: filters.value.germplasm_id, pageSize: total })
    const traitNames = [...new Set((allRes.data.list || []).map(t => t.trait_name))]
    traitOptions.value = traitNames
  } catch (e) {
    console.error(e)
  }
}

function initYears() {
  const currentYear = new Date().getFullYear()
  availableYears.value = []
  for (let i = 0; i < 5; i++) {
    availableYears.value.push(currentYear - i)
  }
  selectedYears.value = [currentYear - 1, currentYear]
}

async function loadAnalysis() {
  if (!filters.value.germplasm_id) return

  loading.value = true
  try {
    await loadTraitOptions()

    const params = {
      germplasm_id: filters.value.germplasm_id
    }
    if (filters.value.trait_name) {
      params.trait_name = filters.value.trait_name
    }
    if (selectedYears.value.length > 0) {
      params.years = selectedYears.value.join(',')
    }

    const res = await api.analytics.traitYearlyComparison(params)
    analysisData.value = res.data || { traits: [] }
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  initYears()
  loadGermplasmOptions()
})
</script>

<style scoped>
.filter-card {
  margin-bottom: 16px;
}

.trait-card {
  margin-bottom: 20px;
}

.trait-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.trait-name {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.chart-container {
  width: 100%;
}

.chart {
  height: 300px;
}

.year-badge {
  background: #ecf5ff;
  color: #409eff;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
}

.value-cell {
  font-weight: 500;
  font-family: 'Consolas', monospace;
}

.value-cell.min {
  color: #67c23a;
}

.value-cell.max {
  color: #f56c6c;
}

.loading-container,
.empty-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  color: #909399;
}

.loading-container p {
  margin-top: 12px;
}
</style>
