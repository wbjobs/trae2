<template>
  <div class="node-list">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>节点列表</span>
          <div class="filter-section">
            <el-select
              v-model="filters.groupId"
              placeholder="选择分组"
              clearable
              style="width: 150px; margin-right: 10px"
              @change="handleFilterChange"
            >
              <el-option
                v-for="group in groups"
                :key="group.id"
                :label="group.id"
                :value="group.id"
              />
            </el-select>
            <el-select
              v-model="filters.region"
              placeholder="选择区域"
              clearable
              style="width: 150px; margin-right: 10px"
              @change="handleFilterChange"
            >
              <el-option
                v-for="region in regions"
                :key="region.name"
                :label="region.name"
                :value="region.name"
              />
            </el-select>
            <el-select
              v-model="filters.status"
              placeholder="选择状态"
              clearable
              style="width: 120px; margin-right: 10px"
              @change="handleFilterChange"
            >
              <el-option label="在线" value="online" />
              <el-option label="离线" value="offline" />
              <el-option label="告警" value="warning" />
            </el-select>
            <el-button type="primary" @click="loadNodes">
              <el-icon><Search /></el-icon>
              搜索
            </el-button>
          </div>
        </div>
      </template>

      <el-table :data="nodes" stripe v-loading="loading">
        <el-table-column prop="node_id" label="节点ID" width="180"></el-table-column>
        <el-table-column prop="group_id" label="分组" width="150">
          <template #default="scope">
            <el-tag type="info" size="small">{{ scope.row.group_id }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="region" label="区域" width="120">
          <template #default="scope">
            <el-tag type="success" size="small">{{ scope.row.region }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="last_status" label="状态" width="100">
          <template #default="scope">
            <el-tag :type="getStatusType(scope.row.last_status)" effect="dark">
              {{ getStatusText(scope.row.last_status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="last_update" label="最后更新" width="200">
          <template #default="scope">
            {{ formatTime(scope.row.last_update) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="150">
          <template #default="scope">
            <el-button type="primary" link size="small" @click="viewDetail(scope.row.node_id)">
              查看详情
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        v-model:current-page="pagination.page"
        v-model:page-size="pagination.pageSize"
        :total="pagination.total"
        :page-sizes="[10, 20, 50, 100]"
        layout="total, sizes, prev, pager, next, jumper"
        style="margin-top: 20px; justify-content: flex-end"
        @size-change="handleSizeChange"
        @current-change="handlePageChange"
      />
    </el-card>

    <el-dialog
      v-model="detailVisible"
      :title="`节点详情 - ${currentNodeId}`"
      width="900px"
    >
      <el-tabs v-model="activeTab">
        <el-tab-pane label="实时监控" name="realtime">
          <div ref="detailChartRef" class="detail-chart"></div>
        </el-tab-pane>
        <el-tab-pane label="历史数据" name="history">
          <el-table :data="nodeMetrics" stripe>
            <el-table-column prop="cpu_usage" label="CPU(%)" width="100"></el-table-column>
            <el-table-column prop="memory_usage" label="内存(%)" width="100"></el-table-column>
            <el-table-column prop="bandwidth_usage" label="带宽(Mbps)" width="120"></el-table-column>
            <el-table-column prop="uptime" label="运行时间(秒)" width="150"></el-table-column>
            <el-table-column prop="status" label="状态" width="100">
              <template #default="scope">
                <el-tag :type="getStatusType(scope.row.status)" size="small">
                  {{ getStatusText(scope.row.status) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="timestamp" label="时间"></el-table-column>
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { getNodes, getGroups, getRegions, getNodeMetrics } from '../api'
import { Search } from '@element-plus/icons-vue'
import * as echarts from 'echarts'
import { useRouter, useRoute } from 'vue-router'

const router = useRouter()
const route = useRoute()

const nodes = ref([])
const groups = ref([])
const regions = ref([])
const loading = ref(false)
const detailVisible = ref(false)
const currentNodeId = ref('')
const nodeMetrics = ref([])
const activeTab = ref('realtime')
const detailChartRef = ref(null)
let detailChart = null

const filters = ref({
  groupId: '',
  region: '',
  status: ''
})

const pagination = ref({
  page: 1,
  pageSize: 10,
  total: 0
})

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

function formatTime(time) {
  if (!time) return '-'
  return new Date(time).toLocaleString('zh-CN')
}

async function loadGroups() {
  try {
    const res = await getGroups()
    groups.value = res.data.data
  } catch (error) {
    console.error('加载分组失败:', error)
  }
}

async function loadRegions() {
  try {
    const res = await getRegions()
    regions.value = res.data.data
  } catch (error) {
    console.error('加载区域失败:', error)
  }
}

async function loadNodes() {
  loading.value = true
  try {
    const params = {
      ...filters.value,
      page: pagination.value.page,
      pageSize: pagination.value.pageSize
    }
    
    const res = await getNodes(params)
    nodes.value = res.data.data
    pagination.value.total = res.data.total
    
    router.push({
      path: '/nodes',
      query: params
    })
  } catch (error) {
    console.error('加载节点列表失败:', error)
  } finally {
    loading.value = false
  }
}

function handleFilterChange() {
  pagination.value.page = 1
  loadNodes()
}

function handleSizeChange(size) {
  pagination.value.pageSize = size
  loadNodes()
}

function handlePageChange(page) {
  pagination.value.page = page
  loadNodes()
}

async function viewDetail(nodeId) {
  currentNodeId.value = nodeId
  detailVisible.value = true
  
  try {
    const res = await getNodeMetrics(nodeId, 50)
    nodeMetrics.value = res.data.data
    initDetailChart(res.data.data)
  } catch (error) {
    console.error('加载节点详情失败:', error)
  }
}

function initDetailChart(data) {
  if (!detailChartRef.value) return
  
  if (!detailChart) {
    detailChart = echarts.init(detailChartRef.value)
  }

  const timestamps = data.map(d => new Date(d.timestamp).toLocaleTimeString('zh-CN')).reverse()
  const cpuData = data.map(d => d.cpu_usage).reverse()
  const memoryData = data.map(d => d.memory_usage).reverse()

  const option = {
    tooltip: {
      trigger: 'axis'
    },
    legend: {
      data: ['CPU使用率', '内存使用率']
    },
    xAxis: {
      type: 'category',
      data: timestamps
    },
    yAxis: {
      type: 'value',
      max: 100
    },
    series: [
      {
        name: 'CPU使用率',
        data: cpuData,
        type: 'line',
        smooth: true,
        itemStyle: { color: '#409EFF' }
      },
      {
        name: '内存使用率',
        data: memoryData,
        type: 'line',
        smooth: true,
        itemStyle: { color: '#67C23A' }
      }
    ]
  }

  detailChart.setOption(option)
}

onMounted(() => {
  const query = route.query
  if (query.groupId) filters.value.groupId = query.groupId
  if (query.region) filters.value.region = query.region
  if (query.status) filters.value.status = query.status
  if (query.page) pagination.value.page = parseInt(query.page)
  if (query.pageSize) pagination.value.pageSize = parseInt(query.pageSize)
  
  loadGroups()
  loadRegions()
  loadNodes()
})
</script>

<style scoped>
.node-list {
  padding: 0;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.filter-section {
  display: flex;
  align-items: center;
}

.detail-chart {
  height: 400px;
}
</style>
