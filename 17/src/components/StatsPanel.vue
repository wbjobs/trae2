<template>
  <div class="stats-panel">
    <div class="panel-header">
      <div class="panel-title">
        <el-icon><DataAnalysis /></el-icon>
        <span>{{ title }}</span>
      </div>
      <div class="panel-controls">
        <el-tag v-if="stats.timeRange" type="info" size="small">
          {{ stats.timeRange }}
        </el-tag>
        <el-button size="small" @click="handleFullReport">
          <el-icon><Document /></el-icon>
          完整报告
        </el-button>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon water-level">
          <el-icon><Water /></el-icon>
        </div>
        <div class="stat-content">
          <div class="stat-label">平均水位</div>
          <div class="stat-value">{{ formatValue(stats.waterLevel?.mean) }} <span class="stat-unit">m</span></div>
          <div class="stat-trend" :class="getTrendClass(stats.waterLevel?.trend)">
            <el-icon><CaretTop v-if="stats.waterLevel?.trend === 'increasing'" /><CaretBottom v-else-if="stats.waterLevel?.trend === 'decreasing'" /><Minus v-else /></el-icon>
            {{ getTrendText(stats.waterLevel?.trend) }}
          </div>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon flow-velocity">
          <el-icon><Promotion /></el-icon>
        </div>
        <div class="stat-content">
          <div class="stat-label">平均流速</div>
          <div class="stat-value">{{ formatValue(stats.flowVelocity?.mean) }} <span class="stat-unit">m/s</span></div>
          <div class="stat-trend" :class="getTrendClass(stats.flowVelocity?.trend)">
            <el-icon><CaretTop v-if="stats.flowVelocity?.trend === 'increasing'" /><CaretBottom v-else-if="stats.flowVelocity?.trend === 'decreasing'" /><Minus v-else /></el-icon>
            {{ getTrendText(stats.flowVelocity?.trend) }}
          </div>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon rainfall">
          <el-icon><Cloudy /></el-icon>
        </div>
        <div class="stat-content">
          <div class="stat-label">累计雨量</div>
          <div class="stat-value">{{ formatValue(stats.rainfall?.sum) }} <span class="stat-unit">mm</span></div>
          <div class="stat-trend" :class="getTrendClass(stats.rainfall?.trend)">
            <el-icon><CaretTop v-if="stats.rainfall?.trend === 'increasing'" /><CaretBottom v-else-if="stats.rainfall?.trend === 'decreasing'" /><Minus v-else /></el-icon>
            {{ getTrendText(stats.rainfall?.trend) }}
          </div>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon anomaly">
          <el-icon><Warning /></el-icon>
        </div>
        <div class="stat-content">
          <div class="stat-label">异常数据</div>
          <div class="stat-value anomaly-value">{{ stats.anomalyCount || 0 }} <span class="stat-unit">条</span></div>
          <div class="stat-trend">
            数据质量: {{ stats.quality || '正常' }}
          </div>
        </div>
      </div>
    </div>

    <div v-if="showDetail" class="stats-detail">
      <div class="detail-section">
        <h4>百分位数分布</h4>
        <div class="percentile-grid">
          <div class="percentile-item" v-for="(value, key) in stats.percentiles" :key="key">
            <span class="percentile-label">{{ key }}</span>
            <span class="percentile-value">{{ value }}</span>
          </div>
        </div>
      </div>

      <div class="detail-section">
        <h4>相关性分析</h4>
        <div class="correlation-list">
          <div class="correlation-item" v-for="item in stats.correlations" :key="item.variables">
            <span class="correlation-vars">{{ item.variables }}</span>
            <el-progress
              :percentage="Math.abs(item.correlation) * 100"
              :color="getCorrelationColor(item.correlation)"
              :stroke-width="8"
              style="flex: 1; margin: 0 12px;"
            />
            <span class="correlation-value">{{ item.strength }}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="panel-footer">
      <el-button type="primary" size="small" @click="handleExportReport">
        <el-icon><Download /></el-icon>
        导出分析报告
      </el-button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  DataAnalysis,
  Document,
  Water,
  Promotion,
  Cloudy,
  Warning,
  CaretTop,
  CaretBottom,
  Minus,
  Download
} from '@element-plus/icons-vue'
import { exportService } from '@/services/export'
import dayjs from 'dayjs'

const props = defineProps({
  title: {
    type: String,
    default: '统计分析面板'
  },
  stats: {
    type: Object,
    default: () => ({})
  },
  showDetail: {
    type: Boolean,
    default: true
  }
})

const emit = defineEmits(['exportReport', 'fullReport'])

const formatValue = (value) => {
  if (value === undefined || value === null || isNaN(value)) {
    return '-'
  }
  return Number(value).toFixed(2)
}

const getTrendClass = (trend) => {
  const classMap = {
    increasing: 'trend-up',
    decreasing: 'trend-down',
    stable: 'trend-stable'
  }
  return classMap[trend] || ''
}

const getTrendText = (trend) => {
  const textMap = {
    increasing: '上升趋势',
    decreasing: '下降趋势',
    stable: '稳定'
  }
  return textMap[trend] || '-'
}

const getCorrelationColor = (correlation) => {
  const abs = Math.abs(correlation)
  if (abs > 0.8) return '#F56C6C'
  if (abs > 0.5) return '#E6A23C'
  return '#67C23A'
}

const handleExportReport = async () => {
  try {
    await ElMessageBox.confirm(
      '确定要导出分析报告吗？',
      '导出确认',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'info'
      }
    )

    exportService.exportSummaryReport(props.stats)
    ElMessage.success('报告导出成功')
    emit('exportReport', props.stats)
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('报告导出失败')
    }
  }
}

const handleFullReport = () => {
  emit('fullReport', props.stats)
}
</script>

<style scoped>
.stats-panel {
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  padding: 16px;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.panel-title {
  display: flex;
  align-items: center;
  font-size: 16px;
  font-weight: 600;
  color: #333;
}

.panel-title .el-icon {
  margin-right: 8px;
  color: #909399;
}

.panel-controls {
  display: flex;
  align-items: center;
  gap: 10px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 16px;
}

.stat-card {
  display: flex;
  align-items: center;
  padding: 16px;
  background: linear-gradient(135deg, #f5f7fa 0%, #e8ebef 100%);
  border-radius: 8px;
  transition: all 0.3s ease;
}

.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.stat-icon {
  width: 48px;
  height: 48px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  margin-right: 12px;
}

.stat-icon.water-level {
  background: linear-gradient(135deg, #409EFF 0%, #66b1ff 100%);
  color: #fff;
}

.stat-icon.flow-velocity {
  background: linear-gradient(135deg, #67C23A 0%, #85ce61 100%);
  color: #fff;
}

.stat-icon.rainfall {
  background: linear-gradient(135deg, #E6A23C 0%, #ebb563 100%);
  color: #fff;
}

.stat-icon.anomaly {
  background: linear-gradient(135deg, #F56C6C 0%, #f78989 100%);
  color: #fff;
}

.stat-content {
  flex: 1;
}

.stat-label {
  font-size: 13px;
  color: #666;
  margin-bottom: 4px;
}

.stat-value {
  font-size: 24px;
  font-weight: 600;
  color: #333;
  margin-bottom: 4px;
}

.stat-unit {
  font-size: 14px;
  color: #999;
  font-weight: normal;
}

.stat-trend {
  display: flex;
  align-items: center;
  font-size: 12px;
  color: #666;
}

.stat-trend .el-icon {
  margin-right: 4px;
}

.trend-up {
  color: #F56C6C;
}

.trend-down {
  color: #67C23A;
}

.trend-stable {
  color: #909399;
}

.anomaly-value {
  color: #F56C6C;
}

.stats-detail {
  padding: 16px 0;
  border-top: 1px solid #eee;
}

.detail-section {
  margin-bottom: 20px;
}

.detail-section h4 {
  font-size: 14px;
  color: #333;
  margin-bottom: 12px;
  font-weight: 600;
}

.percentile-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 8px;
}

.percentile-item {
  text-align: center;
  padding: 8px;
  background: #f5f7fa;
  border-radius: 4px;
}

.percentile-label {
  display: block;
  font-size: 11px;
  color: #999;
  margin-bottom: 4px;
}

.percentile-value {
  font-size: 14px;
  font-weight: 600;
  color: #333;
}

.correlation-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.correlation-item {
  display: flex;
  align-items: center;
}

.correlation-vars {
  width: 100px;
  font-size: 13px;
  color: #666;
}

.correlation-value {
  width: 80px;
  font-size: 13px;
  color: #333;
  text-align: right;
}

.panel-footer {
  display: flex;
  justify-content: flex-end;
  padding-top: 16px;
  border-top: 1px solid #eee;
}

@media (max-width: 1200px) {
  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 768px) {
  .stats-grid {
    grid-template-columns: 1fr;
  }

  .percentile-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}
</style>
