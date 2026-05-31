<template>
  <div class="page-container">
    <div class="page-header">
      <h1 class="page-title">数据总览</h1>
    </div>

    <div class="stat-cards">
      <div class="stat-card">
        <div class="label">种质资源总数</div>
        <div class="value">{{ stats.total || 0 }}</div>
      </div>
      <div class="stat-card success">
        <div class="label">性状观测记录</div>
        <div class="value">{{ traitCount }}</div>
      </div>
      <div class="stat-card warning">
        <div class="label">田间影像数量</div>
        <div class="value">{{ imageStats.total || 0 }}</div>
      </div>
      <div class="stat-card info">
        <div class="label">资源分类数</div>
        <div class="value">{{ classificationCount }}</div>
      </div>
    </div>

    <div class="charts-grid">
      <div class="chart-card">
        <div class="chart-title">种质资源分类分布</div>
        <v-chart class="chart" :option="classificationChartOption" autoresize />
      </div>
      <div class="chart-card">
        <div class="chart-title">性状观测类别分布</div>
        <v-chart class="chart" :option="traitChartOption" autoresize />
      </div>
    </div>

    <div class="charts-grid">
      <div class="chart-card">
        <div class="chart-title">影像上传趋势</div>
        <v-chart class="chart" :option="imageChartOption" autoresize />
      </div>
      <div class="chart-card">
        <div class="chart-title">最近登记的种质资源</div>
        <el-table :data="recentList" stripe style="width: 100%">
          <el-table-column prop="resource_no" label="资源编号" width="180" />
          <el-table-column prop="name" label="种质名称" />
          <el-table-column prop="created_at" label="登记时间" width="180" />
        </el-table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { api } from '@/api'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { PieChart, BarChart, LineChart } from 'echarts/charts'
import {
  TitleComponent, TooltipComponent, LegendComponent,
  GridComponent, DatasetComponent, DataZoomComponent
} from 'echarts/components'

use([
  CanvasRenderer,
  PieChart, BarChart, LineChart,
  TitleComponent, TooltipComponent, LegendComponent,
  GridComponent, DatasetComponent, DataZoomComponent
])

const stats = ref({})
const imageStats = ref({})
const traitCount = ref(0)
const classificationCount = ref(0)
const recentList = ref([])

const classificationChartOption = computed(() => ({
  tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
  legend: { orient: 'vertical', left: 'left', top: 'middle' },
  series: [{
    type: 'pie',
    radius: ['40%', '70%'],
    avoidLabelOverlap: false,
    itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
    label: { show: true, formatter: '{b}\n{c}' },
    data: (stats.value.byClassification || []).map(item => ({
      name: item.name || '未分类',
      value: item.count
    }))
  }]
}))

const traitChartOption = computed(() => ({
  tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
  grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
  xAxis: { type: 'category', data: (traitCategoryData.value || []).map(i => i.trait_category || '其他') },
  yAxis: { type: 'value' },
  series: [{
    type: 'bar',
    data: traitCategoryData.value.map(i => i.count),
    itemStyle: {
      color: {
        type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
        colorStops: [
          { offset: 0, color: '#409eff' },
          { offset: 1, color: '#67c23a' }
        ]
      },
      borderRadius: [4, 4, 0, 0]
    }
  }]
}))

const traitCategoryData = ref([])

const imageChartOption = computed(() => ({
  tooltip: { trigger: 'axis' },
  grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
  xAxis: {
    type: 'category',
    boundaryGap: false,
    data: (imageStats.value.byDate || []).map(i => i.date)
  },
  yAxis: { type: 'value' },
  series: [{
    type: 'line',
    smooth: true,
    data: (imageStats.value.byDate || []).map(i => i.count),
    areaStyle: {
      color: {
        type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
        colorStops: [
          { offset: 0, color: 'rgba(64, 158, 255, 0.3)' },
          { offset: 1, color: 'rgba(64, 158, 255, 0.05)' }
        ]
      }
    },
    lineStyle: { color: '#409eff', width: 2 },
    itemStyle: { color: '#409eff' }
  }]
}))

onMounted(async () => {
  try {
    const [germplasmRes, traitStatsRes, imageRes, traitRes, classRes] = await Promise.all([
      api.germplasm.stats(),
      api.trait.statsByCategory(),
      api.image.stats(),
      api.trait.list({ pageSize: 1 }),
      api.classification.flat()
    ])
    stats.value = germplasmRes.data || {}
    imageStats.value = imageRes.data || {}
    traitCount.value = traitRes.data?.total || 0
    classificationCount.value = classRes.data?.length || 0
    traitCategoryData.value = traitStatsRes.data || []
    recentList.value = stats.value.recent || []
  } catch (e) {
    console.error(e)
  }
})
</script>

<style scoped>
.charts-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-bottom: 16px;
}

.chart-card {
  background: #fff;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.05);
}

.chart-title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 12px;
  color: #303133;
}

.chart {
  height: 300px;
}
</style>
