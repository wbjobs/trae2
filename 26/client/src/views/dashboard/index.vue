<template>
  <div class="page-container">
    <el-row :gutter="20" class="stats-row">
      <el-col :span="6" v-for="stat in statsCards" :key="stat.label">
        <div class="stat-card" :style="{ background: stat.gradient }">
          <div class="stat-icon">
            <el-icon :size="32"><component :is="stat.icon" /></el-icon>
          </div>
          <div class="stat-content">
            <div class="stat-value">{{ stat.value }}</div>
            <div class="stat-label">{{ stat.label }}</div>
          </div>
        </div>
      </el-col>
    </el-row>

    <el-row :gutter="20">
      <el-col :span="12">
        <div class="card">
          <div class="card-header">
            <span class="title">档案分类统计</span>
          </div>
          <div ref="archiveChartRef" class="chart"></div>
        </div>
      </el-col>
      <el-col :span="12">
        <div class="card">
          <div class="card-header">
            <span class="title">物料分类统计</span>
          </div>
          <div ref="materialChartRef" class="chart"></div>
        </div>
      </el-col>
    </el-row>

    <el-row :gutter="20">
      <el-col :span="12">
        <div class="card">
          <div class="card-header">
            <span class="title">最新档案</span>
            <el-button type="primary" text @click="$router.push('/archives')">查看全部</el-button>
          </div>
          <el-table :data="recentArchives" style="width: 100%">
            <el-table-column prop="archiveNo" label="档案编号" width="140" />
            <el-table-column prop="name" label="作品名称" />
            <el-table-column prop="category" label="分类" width="100" />
            <el-table-column label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="statusType[row.status]">{{ statusText[row.status] }}</el-tag>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-col>
      <el-col :span="12">
        <div class="card">
          <div class="card-header">
            <span class="title">最新流转</span>
            <el-button type="primary" text @click="$router.push('/transfers')">查看全部</el-button>
          </div>
          <el-table :data="recentTransfers" style="width: 100%">
            <el-table-column prop="transferNo" label="流转单号" width="140" />
            <el-table-column prop="archiveName" label="作品名称" />
            <el-table-column label="流转" min-width="180">
              <template #default="{ row }">
                <span>{{ row.fromParty }}</span>
                <el-icon style="margin: 0 8px"><Right /></el-icon>
                <span>{{ row.toParty }}</span>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="transferStatusType[row.status]">{{ transferStatusText[row.status] }}</el-tag>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, nextTick } from 'vue'
import * as echarts from 'echarts'
import { getDashboard } from '@/api/dashboard'
import {
  Files, Goods, Van, User, EditPen, DataAnalysis, Right
} from '@element-plus/icons-vue'

const archiveChartRef = ref()
const materialChartRef = ref()
let archiveChart = null
let materialChart = null

const data = ref({})

const statusType = { draft: 'info', reviewing: 'warning', approved: 'success', rejected: 'danger' }
const statusText = { draft: '草稿', reviewing: '审核中', approved: '已通过', rejected: '已拒绝' }
const transferStatusType = { pending: 'warning', in_transit: 'primary', delivered: 'success', confirmed: 'success', cancelled: 'info' }
const transferStatusText = { pending: '待发货', in_transit: '运输中', delivered: '已送达', confirmed: '已确认', cancelled: '已取消' }

const statsCards = computed(() => [
  { label: '档案总数', value: data.value.stats?.totalArchives || 0, icon: Files, gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
  { label: '物料总数', value: data.value.stats?.totalMaterials || 0, icon: Goods, gradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' },
  { label: '流转记录', value: data.value.stats?.totalTransfers || 0, icon: Van, gradient: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' },
  { label: '签章总数', value: data.value.stats?.totalSignatures || 0, icon: EditPen, gradient: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)' }
])

const recentArchives = computed(() => data.value.recentArchives || [])
const recentTransfers = computed(() => data.value.recentTransfers || [])

const initArchiveChart = () => {
  if (!archiveChartRef.value) return
  archiveChart = echarts.init(archiveChartRef.value)
  const categories = data.value.archiveCategories || []
  archiveChart.setOption({
    tooltip: { trigger: 'item' },
    legend: { orient: 'vertical', left: 'left' },
    series: [{
      type: 'pie',
      radius: ['40%', '70%'],
      avoidLabelOverlap: false,
      itemStyle: { borderRadius: 10, borderColor: '#fff', borderWidth: 2 },
      label: { show: false, position: 'center' },
      emphasis: { label: { show: true, fontSize: 18, fontWeight: 'bold' } },
      labelLine: { show: false },
      data: categories.map(c => ({ value: c.count, name: c.category }))
    }]
  })
}

const initMaterialChart = () => {
  if (!materialChartRef.value) return
  materialChart = echarts.init(materialChartRef.value)
  const categories = data.value.materialCategories || []
  materialChart.setOption({
    tooltip: { trigger: 'axis' },
    legend: { show: false },
    xAxis: { type: 'category', data: categories.map(c => c.category) },
    yAxis: { type: 'value' },
    series: [{
      type: 'bar',
      data: categories.map(c => c.count),
      itemStyle: {
        borderRadius: [8, 8, 0, 0],
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: '#667eea' },
          { offset: 1, color: '#764ba2' }
        ])
      }
    }]
  })
}

const fetchData = async () => {
  const res = await getDashboard()
  if (res.code === 200) {
    data.value = res.data
    await nextTick()
    initArchiveChart()
    initMaterialChart()
  }
}

onMounted(() => {
  fetchData()
  window.addEventListener('resize', () => {
    archiveChart?.resize()
    materialChart?.resize()
  })
})
</script>

<style lang="scss" scoped>
.stats-row {
  margin-bottom: 20px;
}

.stat-card {
  border-radius: 12px;
  padding: 24px;
  color: #fff;
  display: flex;
  align-items: center;
  gap: 20px;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
  transition: transform 0.3s;

  &:hover {
    transform: translateY(-4px);
  }

  .stat-icon {
    width: 60px;
    height: 60px;
    background: rgba(255, 255, 255, 0.2);
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .stat-content {
    .stat-value {
      font-size: 28px;
      font-weight: 600;
      margin-bottom: 4px;
    }
    .stat-label {
      font-size: 14px;
      opacity: 0.9;
    }
  }
}

.card {
  background: #fff;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 20px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.05);

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;

    .title {
      font-size: 16px;
      font-weight: 600;
    }
  }

  .chart {
    height: 280px;
  }
}
</style>
