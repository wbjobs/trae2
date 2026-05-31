<template>
  <div class="hot-nodes">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>热点节点排行榜</span>
          <el-button type="primary" @click="loadHotNodes" :loading="loading">
            <el-icon><Refresh /></el-icon>
            刷新
          </el-button>
        </div>
      </template>

      <el-row :gutter="20">
        <el-col :span="8" v-for="(node, index) in hotNodes" :key="node.nodeId">
          <el-card class="hot-node-card" :class="getRankClass(index)" shadow="hover">
            <div class="rank-badge">{{ index + 1 }}</div>
            <div class="node-header">
              <div class="node-info">
                <h3 class="node-id">{{ node.nodeId }}</h3>
                <el-tag size="small" type="info">{{ node.groupId }}</el-tag>
                <el-tag size="small" type="success" style="margin-left: 5px">{{ node.region }}</el-tag>
              </div>
              <el-tag :type="getStatusType(node.status)" effect="dark">
                {{ getStatusText(node.status) }}
              </el-tag>
            </div>

            <div class="metrics-section">
              <div class="metric-item">
                <span class="metric-label">热度值</span>
                <span class="metric-value hot">{{ Math.round(node.hotScore || 0) }}</span>
              </div>
              <div class="metric-item">
                <span class="metric-label">CPU</span>
                <span class="metric-value">{{ node.cpu }}%</span>
              </div>
              <div class="metric-item">
                <span class="metric-label">内存</span>
                <span class="metric-value">{{ node.memory }}%</span>
              </div>
              <div class="metric-item">
                <span class="metric-label">带宽</span>
                <span class="metric-value">{{ node.bandwidth }} Mbps</span>
              </div>
            </div>

            <div class="progress-section">
              <div class="progress-item">
                <span class="progress-label">CPU使用率</span>
                <el-progress :percentage="node.cpu" :color="getProgressColor(node.cpu)"></el-progress>
              </div>
              <div class="progress-item">
                <span class="progress-label">内存使用率</span>
                <el-progress :percentage="node.memory" :color="getProgressColor(node.memory)"></el-progress>
              </div>
            </div>
          </el-card>
        </el-col>
      </el-row>

      <el-empty v-if="hotNodes.length === 0" description="暂无热点节点数据" />
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { getHotNodes } from '../api'
import { Refresh } from '@element-plus/icons-vue'

const hotNodes = ref([])
const loading = ref(false)
let refreshTimer = null

function getStatusType(status) {
  const types = {
    online: 'success',
    offline: 'danger',
    warning: 'warning'
  }
  return types[status] || 'info'
}

function getStatusText(status) {
  const texts = {
    online: '在线',
    offline: '离线',
    warning: '告警'
  }
  return texts[status] || '未知'
}

function getRankClass(index) {
  if (index === 0) return 'rank-1'
  if (index === 1) return 'rank-2'
  if (index === 2) return 'rank-3'
  return ''
}

function getProgressColor(value) {
  if (value > 80) return '#f56c6c'
  if (value > 60) return '#e6a23c'
  return '#67c23a'
}

async function loadHotNodes() {
  loading.value = true
  try {
    const res = await getHotNodes(12)
    if (res.data && res.data.success) {
      hotNodes.value = res.data.data
    }
  } catch (error) {
    console.error('加载热点节点失败:', error)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadHotNodes()

  refreshTimer = setInterval(loadHotNodes, 10000)
})

onUnmounted(() => {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
})
</script>

<style scoped>
.hot-nodes {
  padding: 0;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.hot-node-card {
  margin-bottom: 20px;
  position: relative;
  transition: transform 0.3s;
}

.hot-node-card:hover {
  transform: translateY(-5px);
}

.hot-node-card.rank-1 {
  border: 2px solid #ffd700;
}

.hot-node-card.rank-2 {
  border: 2px solid #c0c0c0;
}

.hot-node-card.rank-3 {
  border: 2px solid #cd7f32;
}

.rank-badge {
  position: absolute;
  top: -10px;
  left: -10px;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: linear-gradient(135deg, #ffd700, #ffaa00);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  font-size: 18px;
  box-shadow: 0 2px 8px rgba(255, 215, 0, 0.5);
}

.rank-2 .rank-badge {
  background: linear-gradient(135deg, #c0c0c0, #a0a0a0);
}

.rank-3 .rank-badge {
  background: linear-gradient(135deg, #cd7f32, #b87333);
}

.node-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 15px;
  padding-top: 10px;
}

.node-id {
  margin: 0 0 8px 0;
  font-size: 16px;
  color: #303133;
}

.metrics-section {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 15px;
}

.metric-item {
  text-align: center;
  padding: 10px;
  background: #f5f7fa;
  border-radius: 8px;
}

.metric-label {
  display: block;
  font-size: 12px;
  color: #909399;
  margin-bottom: 5px;
}

.metric-value {
  font-size: 18px;
  font-weight: bold;
  color: #303133;
}

.metric-value.hot {
  color: #e6a23c;
}

.progress-section {
  margin-top: 10px;
}

.progress-item {
  margin-bottom: 10px;
}

.progress-label {
  display: block;
  font-size: 12px;
  color: #606266;
  margin-bottom: 5px;
}
</style>
