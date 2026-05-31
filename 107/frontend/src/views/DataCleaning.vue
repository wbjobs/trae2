<template>
  <div class="data-cleaning-page">
    <div class="page-header">
      <h2>🔧 数据清洗模块</h2>
      <p>管理光伏数据的离线清洗与质量监控</p>
    </div>

    <div class="content-wrapper">
      <div class="left-panel">
        <div class="card">
          <div class="card-header">
            <span class="card-title">清洗任务配置</span>
          </div>
          <div class="card-body">
            <el-form :model="form" label-width="120px">
              <el-form-item label="数据源">
                <el-select v-model="form.dataSource" style="width: 100%">
                  <el-option label="光伏板原始数据" value="panel_raw" />
                  <el-option label="逆变器原始数据" value="inverter_raw" />
                  <el-option label="气象站数据" value="weather_raw" />
                  <el-option label="全部数据" value="all" />
                </el-select>
              </el-form-item>
              <el-form-item label="时间范围">
                <el-date-picker
                  v-model="form.dateRange"
                  type="daterange"
                  style="width: 100%"
                  start-placeholder="开始日期"
                  end-placeholder="结束日期"
                />
              </el-form-item>
              <el-form-item label="清洗规则">
                <el-checkbox-group v-model="form.rules">
                  <el-checkbox label="remove_duplicate">去除重复数据</el-checkbox>
                  <el-checkbox label="fill_missing">填充缺失值</el-checkbox>
                  <el-checkbox label="filter_outlier">过滤异常值</el-checkbox>
                  <el-checkbox label="format_standard">格式标准化</el-checkbox>
                </el-checkbox-group>
              </el-form-item>
              <el-form-item label="异常阈值">
                <el-slider v-model="form.threshold" :min="1" :max="10" :step="0.5" />
                <span class="threshold-value">{{ form.threshold }}σ</span>
              </el-form-item>
              <el-form-item>
                <el-button type="primary" @click="startCleaning" :loading="cleaning">
                  开始清洗
                </el-button>
                <el-button @click="resetForm">重置</el-button>
              </el-form-item>
            </el-form>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <span class="card-title">最近任务</span>
          </div>
          <div class="card-body">
            <el-table :data="recentTasks" size="small">
              <el-table-column prop="taskId" label="任务ID" width="100" />
              <el-table-column prop="type" label="类型" width="100" />
              <el-table-column prop="time" label="执行时间" />
              <el-table-column prop="status" label="状态" width="80">
                <template #default="{ row }">
                  <el-tag :type="getStatusType(row.status)" size="small">
                    {{ row.status }}
                  </el-tag>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </div>
      </div>

      <div class="right-panel">
        <div class="card">
          <div class="card-header">
            <span class="card-title">数据质量概览</span>
          </div>
          <div class="card-body">
            <div class="quality-stats">
              <div class="quality-item" v-for="item in qualityStats" :key="item.name">
                <div class="quality-label">{{ item.name }}</div>
                <div class="quality-value" :style="{ color: item.color }">
                  {{ item.value }}{{ item.unit }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <span class="card-title">数据质量趋势</span>
          </div>
          <div ref="qualityChart" class="chart-body"></div>
        </div>

        <div class="card">
          <div class="card-header">
            <span class="card-title">清洗日志</span>
          </div>
          <div class="log-container">
            <div v-for="(log, index) in logs" :key="index" class="log-item" :class="log.type">
              <span class="log-time">{{ log.time }}</span>
              <span class="log-content">{{ log.content }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { createChart } from '@/utils/chart'
import * as echarts from 'echarts'

const form = ref({
  dataSource: 'all',
  dateRange: [],
  rules: ['remove_duplicate', 'fill_missing', 'filter_outlier', 'format_standard'],
  threshold: 3
})

const cleaning = ref(false)
const qualityChart = ref(null)
const logs = ref([
  { time: '14:32:15', type: 'info', content: '系统检测到光伏板数据 1,245,600 条' },
  { time: '14:32:18', type: 'info', content: '开始执行去重操作...' },
  { time: '14:32:25', type: 'success', content: '去除重复数据 12,345 条' },
  { time: '14:32:28', type: 'info', content: '开始填充缺失值...' },
  { time: '14:32:35', type: 'success', content: '填充缺失值 3,456 处' },
  { time: '14:32:38', type: 'warning', content: '发现异常值 890 条，已标记' },
  { time: '14:32:45', type: 'success', content: '数据清洗完成，共处理 1,230,000 条' }
])

const qualityStats = ref([
  { name: '数据完整率', value: 98.5, unit: '%', color: '#67c23a' },
  { name: '数据准确率', value: 99.2, unit: '%', color: '#409eff' },
  { name: '重复数据率', value: 0.8, unit: '%', color: '#e6a23c' },
  { name: '异常数据率', value: 0.3, unit: '%', color: '#f56c6c' }
])

const recentTasks = ref([
  { taskId: 'T001', type: '全量清洗', time: '2024-01-15 14:30', status: '完成' },
  { taskId: 'T002', type: '增量清洗', time: '2024-01-14 02:00', status: '完成' },
  { taskId: 'T003', type: '全量清洗', time: '2024-01-13 14:30', status: '完成' },
  { taskId: 'T004', type: '增量清洗', time: '2024-01-12 02:00', status: '失败' }
])

const getStatusType = (status) => {
  const types = { '完成': 'success', '进行中': 'warning', '失败': 'danger' }
  return types[status] || 'info'
}

const startCleaning = () => {
  if (!form.value.dateRange || form.value.dateRange.length === 0) {
    ElMessage.warning('请选择时间范围')
    return
  }
  cleaning.value = true
  ElMessage.info('清洗任务已提交，正在执行...')
  
  setTimeout(() => {
    cleaning.value = false
    ElMessage.success('数据清洗完成！')
    logs.value.unshift(
      { time: new Date().toLocaleTimeString(), type: 'success', content: '手动触发清洗任务完成' }
    )
  }, 3000)
}

const resetForm = () => {
  form.value = {
    dataSource: 'all',
    dateRange: [],
    rules: ['remove_duplicate', 'fill_missing', 'filter_outlier', 'format_standard'],
    threshold: 3
  }
}

const initQualityChart = () => {
  if (!qualityChart.value) return
  
  const dates = ['1/10', '1/11', '1/12', '1/13', '1/14', '1/15', '1/16']
  const data1 = [97.2, 97.8, 98.1, 98.0, 98.3, 98.4, 98.5]
  const data2 = [98.5, 98.8, 99.0, 98.9, 99.1, 99.1, 99.2]
  
  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      borderColor: '#409eff'
    },
    legend: {
      data: ['完整率', '准确率'],
      textStyle: { color: 'rgba(255, 255, 255, 0.7)' },
      top: 0
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      top: '15%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: dates,
      axisLine: { lineStyle: { color: 'rgba(64, 158, 255, 0.3)' } },
      axisLabel: { color: 'rgba(255, 255, 255, 0.7)' }
    },
    yAxis: {
      type: 'value',
      min: 95,
      max: 100,
      axisLine: { show: false },
      splitLine: { lineStyle: { color: 'rgba(64, 158, 255, 0.1)' } },
      axisLabel: { color: 'rgba(255, 255, 255, 0.7)' }
    },
    series: [
      {
        name: '完整率',
        type: 'line',
        smooth: true,
        data: data1,
        lineStyle: { color: '#409eff', width: 2 },
        itemStyle: { color: '#409eff' }
      },
      {
        name: '准确率',
        type: 'line',
        smooth: true,
        data: data2,
        lineStyle: { color: '#67c23a', width: 2 },
        itemStyle: { color: '#67c23a' }
      }
    ]
  }
  
  createChart(qualityChart.value, option)
}

onMounted(() => {
  initQualityChart()
})
</script>

<style scoped lang="scss">
.data-cleaning-page {
  width: 100%;
  min-height: 100vh;
  padding: 20px;
  background: linear-gradient(180deg, #0a1628 0%, #0f2644 100%);
}

.page-header {
  margin-bottom: 20px;
  
  h2 {
    font-size: 24px;
    color: #fff;
    margin-bottom: 8px;
  }
  
  p {
    color: rgba(255, 255, 255, 0.6);
  }
}

.content-wrapper {
  display: grid;
  grid-template-columns: 400px 1fr;
  gap: 20px;
}

.left-panel, .right-panel {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.card-body {
  padding: 10px 0;
}

.threshold-value {
  color: #409eff;
  font-weight: 600;
  margin-left: 12px;
}

.quality-stats {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}

.quality-item {
  text-align: center;
  padding: 16px;
  background: rgba(64, 158, 255, 0.1);
  border-radius: 8px;
  
  .quality-label {
    color: rgba(255, 255, 255, 0.7);
    font-size: 14px;
    margin-bottom: 8px;
  }
  
  .quality-value {
    font-size: 24px;
    font-weight: 700;
  }
}

.chart-body {
  height: 200px;
}

.log-container {
  max-height: 300px;
  overflow-y: auto;
}

.log-item {
  padding: 8px 12px;
  border-bottom: 1px solid rgba(64, 158, 255, 0.1);
  font-size: 13px;
  display: flex;
  gap: 12px;
  
  &.info {
    color: rgba(255, 255, 255, 0.7);
  }
  
  &.success {
    color: #67c23a;
  }
  
  &.warning {
    color: #e6a23c;
  }
  
  &.error {
    color: #f56c6c;
  }
  
  .log-time {
    color: rgba(255, 255, 255, 0.5);
    flex-shrink: 0;
  }
}

:deep(.el-form-item__label) {
  color: rgba(255, 255, 255, 0.8);
}

:deep(.el-checkbox__label) {
  color: rgba(255, 255, 255, 0.8);
}
</style>
