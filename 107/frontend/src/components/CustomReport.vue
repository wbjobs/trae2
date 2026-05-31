<template>
  <div class="custom-report">
    <div class="generator-content">
      <div class="form-section card">
        <div class="card-header">
          <span class="card-title">自定义报表配置</span>
        </div>
        <div class="card-body">
          <el-form :model="form" label-width="120px">
            <el-form-item label="报表名称">
              <el-input v-model="form.reportName" placeholder="请输入报表名称" />
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
            
            <el-form-item label="数据维度">
              <el-select v-model="form.dimensions" multiple style="width: 100%">
                <el-option label="按电站" value="station" />
                <el-option label="按区域" value="area" />
                <el-option label="按设备类型" value="device_type" />
                <el-option label="按时间(小时)" value="hour" />
                <el-option label="按时间(天)" value="day" />
              </el-select>
            </el-form-item>
            
            <el-form-item label="指标选择">
              <el-checkbox-group v-model="form.metrics">
                <el-checkbox label="power">发电量</el-checkbox>
                <el-checkbox label="efficiency">发电效率</el-checkbox>
                <el-checkbox label="loss">损耗率</el-checkbox>
                <el-checkbox label="fault">故障次数</el-checkbox>
                <el-checkbox label="online">在线率</el-checkbox>
              </el-checkbox-group>
            </el-form-item>
            
            <el-form-item label="聚合方式">
              <el-radio-group v-model="form.aggregation">
                <el-radio value="sum">求和</el-radio>
                <el-radio value="avg">平均值</el-radio>
                <el-radio value="max">最大值</el-radio>
                <el-radio value="min">最小值</el-radio>
              </el-radio-group>
            </el-form-item>
            
            <el-form-item>
              <el-button type="primary" @click="generateReport" :loading="generating">
                生成自定义报表
              </el-button>
              <el-button @click="saveTemplate">保存模板</el-button>
            </el-form-item>
          </el-form>
        </div>
      </div>
      
      <div class="preview-section card">
        <div class="card-header">
          <span class="card-title">数据预览</span>
          <el-button-group>
            <el-button size="small" :type="viewType === 'table' ? 'primary' : ''" @click="viewType = 'table'">表格</el-button>
            <el-button size="small" :type="viewType === 'chart' ? 'primary' : ''" @click="viewType = 'chart'">图表</el-button>
          </el-button-group>
        </div>
        <div class="preview-body">
          <div v-if="viewType === 'table'">
            <el-table :data="previewTableData" size="small" border>
              <el-table-column prop="dimension" label="维度" />
              <el-table-column prop="power" label="发电量(MWh)" v-if="form.metrics.includes('power')" />
              <el-table-column prop="efficiency" label="效率(%)" v-if="form.metrics.includes('efficiency')" />
              <el-table-column prop="loss" label="损耗率(%)" v-if="form.metrics.includes('loss')" />
              <el-table-column prop="fault" label="故障数" v-if="form.metrics.includes('fault')" />
              <el-table-column prop="online" label="在线率(%)" v-if="form.metrics.includes('online')" />
            </el-table>
          </div>
          <div v-else>
            <div ref="customChart" class="chart-body"></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { createChart } from '@/utils/chart'

const form = ref({
  reportName: '',
  dateRange: [],
  dimensions: ['station'],
  metrics: ['power', 'efficiency'],
  aggregation: 'sum'
})

const generating = ref(false)
const viewType = ref('table')
const customChart = ref(null)
let chartInstance = null

const previewTableData = ref([
  { dimension: '光伏电站A', power: 1250.5, efficiency: 96.5, loss: 3.2, fault: 5, online: 98.5 },
  { dimension: '光伏电站B', power: 980.3, efficiency: 95.8, loss: 3.8, fault: 8, online: 97.2 },
  { dimension: '光伏电站C', power: 756.2, efficiency: 94.2, loss: 4.5, fault: 3, online: 99.1 }
])

const generateReport = () => {
  if (!form.value.reportName) {
    ElMessage.warning('请输入报表名称')
    return
  }
  if (!form.value.dateRange || form.value.dateRange.length === 0) {
    ElMessage.warning('请选择时间范围')
    return
  }
  generating.value = true
  ElMessage.info('正在生成自定义报表...')
  
  setTimeout(() => {
    generating.value = false
    ElMessage.success('报表生成成功！')
    updateChart()
  }, 2000)
}

const saveTemplate = () => {
  ElMessage.success('模板已保存')
}

const updateChart = () => {
  if (!customChart.value) return
  
  const labels = previewTableData.value.map(d => d.dimension)
  const seriesData = form.value.metrics.map(metric => ({
    name: getMetricName(metric),
    type: 'bar',
    data: previewTableData.value.map(d => d[metric])
  }))
  
  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      borderColor: '#409eff'
    },
    legend: {
      data: seriesData.map(s => s.name),
      textStyle: { color: 'rgba(255, 255, 255, 0.7)' }
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: labels,
      axisLine: { lineStyle: { color: 'rgba(64, 158, 255, 0.3)' } },
      axisLabel: { color: 'rgba(255, 255, 255, 0.7)' }
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      splitLine: { lineStyle: { color: 'rgba(64, 158, 255, 0.1)' } },
      axisLabel: { color: 'rgba(255, 255, 255, 0.7)' }
    },
    series: seriesData
  }
  
  if (chartInstance) {
    chartInstance.dispose()
  }
  chartInstance = createChart(customChart.value, option)
}

const getMetricName = (key) => {
  const names = {
    power: '发电量(MWh)',
    efficiency: '效率(%)',
    loss: '损耗率(%)',
    fault: '故障数',
    online: '在线率(%)'
  }
  return names[key] || key
}

watch(viewType, (val) => {
  if (val === 'chart') {
    setTimeout(updateChart, 100)
  }
})

onMounted(() => {
  if (viewType.value === 'chart') {
    setTimeout(updateChart, 100)
  }
})
</script>

<style scoped lang="scss">
.custom-report {
  padding: 20px 0;
}

.generator-content {
  display: grid;
  grid-template-columns: 450px 1fr;
  gap: 20px;
}

.chart-body {
  height: 300px;
}

:deep(.el-form-item__label) {
  color: rgba(255, 255, 255, 0.8);
}

:deep(.el-checkbox__label),
:deep(.el-radio__label) {
  color: rgba(255, 255, 255, 0.8);
}

:deep(.el-table) {
  background: transparent;

  th {
    background: rgba(64, 158, 255, 0.1) !important;
    color: #409eff;
  }

  td {
    color: rgba(255, 255, 255, 0.8);
  }
}
</style>
