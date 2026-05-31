<template>
  <div class="trace-query">
    <QueryFilter
      :devices="deviceStore.devices"
      :loading="loading"
      @search="handleSearch"
      @reset="handleReset"
    />

    <div class="result-stats" v-if="queryResult">
      <el-statistic title="查询结果总数" :value="queryResult.total" />
      <el-statistic title="当前页" :value="queryResult.page" />
      <el-statistic title="每页显示" :value="queryResult.pageSize" />
    </div>

    <RealtimeTable
      title="信令溯源结果"
      :data="tableData"
      :loading="loading"
      :show-pagination="true"
      :total="queryResult?.total || 0"
      @page-change="handlePageChange"
    >
      <el-table-column prop="id" label="消息ID" width="220" show-overflow-tooltip />
      <el-table-column label="时间" width="210">
        <template #default="{ row }">
          {{ formatTimestamp(row.timestamp) }}
        </template>
      </el-table-column>
      <el-table-column prop="deviceName" label="设备" width="140" />
      <el-table-column prop="type" label="类型" width="100">
        <template #default="{ row }">
          <el-tag :type="getTypeTag(row.type)" size="small">{{ row.type }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="method" label="方法" width="120" />
      <el-table-column prop="from" label="来源" min-width="150" show-overflow-tooltip />
      <el-table-column prop="to" label="目标" min-width="150" show-overflow-tooltip />
      <el-table-column prop="duration" label="耗时(ms)" width="100" />
      <el-table-column prop="status" label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="row.status === 'success' ? 'success' : row.status === 'failed' ? 'danger' : 'warning'" size="small">
            {{ row.status === 'success' ? '成功' : row.status === 'failed' ? '失败' : '处理中' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="100" fixed="right">
        <template #default="{ row }">
          <el-button type="primary" link size="small" @click="showDetail(row)">
            详情
          </el-button>
        </template>
      </el-table-column>
    </RealtimeTable>

    <el-dialog
      v-model="detailVisible"
      title="信令详情"
      width="800px"
      :close-on-click-modal="false"
    >
      <div v-if="currentDetail" class="detail-content">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="消息ID">{{ currentDetail.id }}</el-descriptions-item>
          <el-descriptions-item label="时间">{{ formatTimestamp(currentDetail.timestamp) }}</el-descriptions-item>
          <el-descriptions-item label="设备">{{ currentDetail.deviceName }}</el-descriptions-item>
          <el-descriptions-item label="类型">
            <el-tag :type="getTypeTag(currentDetail.type)" size="small">{{ currentDetail.type }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="方法">{{ currentDetail.method }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="currentDetail.status === 'success' ? 'success' : currentDetail.status === 'failed' ? 'danger' : 'warning'" size="small">
              {{ currentDetail.status === 'success' ? '成功' : currentDetail.status === 'failed' ? '失败' : '处理中' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="来源" :span="2">{{ currentDetail.from }}</el-descriptions-item>
          <el-descriptions-item label="目标" :span="2">{{ currentDetail.to }}</el-descriptions-item>
          <el-descriptions-item label="耗时" v-if="currentDetail.duration">{{ currentDetail.duration }}ms</el-descriptions-item>
        </el-descriptions>

        <div class="payload-section" v-if="currentDetail.payload">
          <h4>信令载荷</h4>
          <pre class="payload-content">{{ JSON.stringify(currentDetail.payload, null, 2) }}</pre>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useSignalingStore } from '@/stores/signaling'
import { useDeviceStore } from '@/stores/device'
import QueryFilter from '@/components/QueryFilter.vue'
import RealtimeTable from '@/components/RealtimeTable.vue'
import type { SignalingType, SignalingMessage, TraceQueryParams } from '@/types'

const signalingStore = useSignalingStore()
const deviceStore = useDeviceStore()

const loading = ref(false)
const currentPage = ref(1)
const pageSize = ref(20)
const detailVisible = ref(false)
const currentDetail = ref<SignalingMessage | null>(null)
const queryParams = ref<TraceQueryParams>({})

const queryResult = computed(() => signalingStore.queryResult)
const tableData = computed(() => queryResult.value?.data || [])

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp)
  const pad = (n: number) => n.toString().padStart(2, '0')
  const pad3 = (n: number) => n.toString().padStart(3, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad3(date.getMilliseconds())}`
}

function getTypeTag(type: SignalingType): 'primary' | 'success' | 'warning' | 'danger' | 'info' {
  const tagMap: Record<SignalingType, 'primary' | 'success' | 'warning' | 'danger' | 'info'> = {
    'SIP': 'primary',
    'H.323': 'success',
    'MGCP': 'warning',
    'MEGACO': 'danger',
    'SCTP': 'info',
    'Diameter': 'primary',
    'RADIUS': 'success',
    'Other': 'info'
  }
  return tagMap[type] || 'info'
}

async function handleSearch(params: TraceQueryParams) {
  queryParams.value = params
  currentPage.value = 1
  await executeQuery()
}

async function handleReset() {
  queryParams.value = {}
  currentPage.value = 1
  await executeQuery()
}

async function handlePageChange(page: number, size: number) {
  currentPage.value = page
  pageSize.value = size
  await executeQuery()
}

async function executeQuery() {
  loading.value = true
  try {
    await signalingStore.queryTrace({
      ...queryParams.value,
      page: currentPage.value,
      pageSize: pageSize.value
    })
  } finally {
    loading.value = false
  }
}

function showDetail(row: SignalingMessage) {
  currentDetail.value = row
  detailVisible.value = true
}

onMounted(() => {
  deviceStore.fetchDevices()
  executeQuery()
})
</script>

<style scoped>
.trace-query {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.result-stats {
  display: flex;
  gap: 40px;
  background: #001529;
  border: 1px solid #1f2d3d;
  border-radius: 8px;
  padding: 20px 30px;
}

:deep(.el-statistic__head) {
  color: #8b9aae;
  font-size: 13px;
}

:deep(.el-statistic__number) {
  color: #409eff;
  font-size: 24px;
}

.detail-content {
  color: #b9c0cc;
}

:deep(.el-descriptions) {
  --el-descriptions-item-label-color: #8b9aae;
  --el-descriptions-text-color: #b9c0cc;
  --el-descriptions-border-color: #1f2d3d;
  --el-descriptions-item-bg-color: #001e36;
}

.payload-section {
  margin-top: 20px;
}

.payload-section h4 {
  color: #fff;
  margin: 0 0 12px 0;
  font-size: 14px;
}

.payload-content {
  background: #000c17;
  border: 1px solid #1f2d3d;
  border-radius: 6px;
  padding: 16px;
  max-height: 300px;
  overflow-y: auto;
  color: #67c23a;
  font-size: 12px;
  line-height: 1.6;
}

:deep(.el-dialog) {
  --el-dialog-bg-color: #001529;
  --el-dialog-border-color: #1f2d3d;
  --el-text-color-primary: #fff;
  --el-text-color-regular: #b9c0cc;
}

:deep(.el-dialog__header) {
  border-bottom: 1px solid #1f2d3d;
}

:deep(.el-dialog__footer) {
  border-top: 1px solid #1f2d3d;
}
</style>
