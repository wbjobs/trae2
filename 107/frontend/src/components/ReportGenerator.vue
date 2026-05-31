<template>
  <div class="report-generator">
    <div class="generator-content">
      <div class="form-section card">
        <div class="card-header">
          <span class="card-title">报表配置</span>
        </div>
        <div class="card-body">
          <el-form :model="form" label-width="100px">
            <el-form-item label="选择电站">
              <el-select v-model="form.station" multiple style="width: 100%">
                <el-option label="光伏电站A" value="station_a" />
                <el-option label="光伏电站B" value="station_b" />
                <el-option label="光伏电站C" value="station_c" />
              </el-select>
            </el-form-item>
            
            <el-form-item label="报表内容">
              <el-checkbox-group v-model="form.sections">
                <el-checkbox label="overview">运行概览</el-checkbox>
                <el-checkbox label="power">发电量分析</el-checkbox>
                <el-checkbox label="fault">故障统计</el-checkbox>
                <el-checkbox label="loss">损耗分析</el-checkbox>
                <el-checkbox label="device">设备状态</el-checkbox>
              </el-checkbox-group>
            </el-form-item>
            
            <el-form-item label="导出格式">
              <el-radio-group v-model="form.format">
                <el-radio value="xlsx">Excel (.xlsx)</el-radio>
                <el-radio value="pdf">PDF (.pdf)</el-radio>
                <el-radio value="csv">CSV (.csv)</el-radio>
              </el-radio-group>
            </el-form-item>
            
            <el-form-item>
              <el-button type="primary" @click="generateReport" :loading="generating">
                生成报表
              </el-button>
              <el-button @click="previewReport">预览</el-button>
            </el-form-item>
          </el-form>
        </div>
      </div>
      
      <div class="preview-section card">
        <div class="card-header">
          <span class="card-title">报表预览</span>
          <el-button type="text" @click="refreshPreview">刷新</el-button>
        </div>
        <div class="preview-body">
          <div v-if="previewData" class="preview-content">
            <h3>{{ typeLabel }} - 运行概览</h3>
            <div class="preview-stats">
              <div class="stat-box">
                <span class="label">总发电量</span>
                <span class="value">{{ previewData.totalPower }} MWh</span>
              </div>
              <div class="stat-box">
                <span class="label">平均效率</span>
                <span class="value">{{ previewData.efficiency }}%</span>
              </div>
              <div class="stat-box">
                <span class="label">故障次数</span>
                <span class="value">{{ previewData.faultCount }} 次</span>
              </div>
              <div class="stat-box">
                <span class="label">损耗率</span>
                <span class="value">{{ previewData.lossRate }}%</span>
              </div>
            </div>
          </div>
          <el-empty v-else description="点击预览按钮查看报表" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'

const props = defineProps({
  type: {
    type: String,
    default: 'daily'
  }
})

const typeLabel = computed(() => {
  const labels = { daily: '日报表', weekly: '周报表', monthly: '月报表' }
  return labels[props.type] || '报表'
})

const form = ref({
  station: ['station_a'],
  sections: ['overview', 'power', 'fault', 'loss', 'device'],
  format: 'xlsx'
})

const generating = ref(false)
const previewData = ref(null)

const generateReport = () => {
  generating.value = true
  ElMessage.info(`正在生成${typeLabel.value}...`)
  
  setTimeout(() => {
    generating.value = false
    ElMessage.success('报表生成成功！')
  }, 2000)
}

const previewReport = () => {
  previewData.value = {
    totalPower: (Math.random() * 1000 + 500).toFixed(2),
    efficiency: (Math.random() * 5 + 93).toFixed(1),
    faultCount: Math.floor(Math.random() * 20 + 5),
    lossRate: (Math.random() * 3 + 2).toFixed(1)
  }
  ElMessage.success('预览加载完成')
}

const refreshPreview = () => {
  previewReport()
}
</script>

<style scoped lang="scss">
.report-generator {
  padding: 20px 0;
}

.generator-content {
  display: grid;
  grid-template-columns: 400px 1fr;
  gap: 20px;
}

.form-section, .preview-section {
  margin-bottom: 0;
}

.preview-body {
  min-height: 300px;
}

.preview-content {
  h3 {
    color: #409eff;
    margin-bottom: 20px;
    padding-bottom: 12px;
    border-bottom: 1px solid rgba(64, 158, 255, 0.2);
  }
}

.preview-stats {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}

.stat-box {
  padding: 20px;
  background: rgba(64, 158, 255, 0.1);
  border-radius: 8px;
  text-align: center;
  
  .label {
    display: block;
    color: rgba(255, 255, 255, 0.7);
    margin-bottom: 8px;
  }
  
  .value {
    display: block;
    font-size: 24px;
    font-weight: 700;
    color: #00d4ff;
  }
}

:deep(.el-form-item__label) {
  color: rgba(255, 255, 255, 0.8);
}

:deep(.el-checkbox__label),
:deep(.el-radio__label) {
  color: rgba(255, 255, 255, 0.8);
}
</style>
