<template>
  <div class="realtime-table">
    <div class="table-header">
      <div class="title">
        <el-icon :size="18" color="#409eff"><Bell /></el-icon>
        <span>{{ title }}</span>
      </div>
      <div class="badge" v-if="realtime">
        <span class="dot"></span>
        <span>实时更新</span>
      </div>
    </div>
    <el-table
      :data="data"
      style="width: 100%"
      max-height="400"
      :row-class-name="rowClassName"
      v-loading="loading"
    >
      <slot></slot>
    </el-table>
    <div v-if="showPagination" class="pagination">
      <el-pagination
        v-model:current-page="currentPage"
        v-model:page-size="pageSize"
        :page-sizes="[10, 20, 50, 100]"
        :total="total"
        layout="total, sizes, prev, pager, next, jumper"
        background
        @size-change="handleSizeChange"
        @current-change="handleCurrentChange"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { Bell } from '@element-plus/icons-vue'
import type { SignalingMessage } from '@/types'

const props = defineProps<{
  title: string
  data: any[]
  loading?: boolean
  realtime?: boolean
  showPagination?: boolean
  total?: number
}>()

const emit = defineEmits<{
  (e: 'page-change', page: number, pageSize: number): void
  (e: 'row-click', row: any): void
}>()

const currentPage = ref(1)
const pageSize = ref(20)

function rowClassName({ row }: { row: SignalingMessage }) {
  if (row.status === 'failed') return 'row-failed'
  if (row.status === 'pending') return 'row-pending'
  return ''
}

function handleSizeChange(val: number) {
  pageSize.value = val
  emit('page-change', currentPage.value, val)
}

function handleCurrentChange(val: number) {
  currentPage.value = val
  emit('page-change', val, pageSize.value)
}

watch(
  () => props.data,
  () => {
    const table = document.querySelector('.realtime-table .el-table__body-wrapper')
    if (table && props.realtime) {
      table.scrollTop = 0
    }
  },
  { deep: true }
)
</script>

<style scoped>
.realtime-table {
  background: #001529;
  border: 1px solid #1f2d3d;
  border-radius: 8px;
  overflow: hidden;
}

.table-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #1f2d3d;
}

.title {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #fff;
  font-size: 15px;
  font-weight: 600;
}

.badge {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #67c23a;
  font-size: 12px;
}

.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: #67c23a;
  animation: blink 1s infinite;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

:deep(.el-table) {
  --el-table-bg-color: #001529;
  --el-table-tr-bg-color: #001529;
  --el-table-text-color: #b9c0cc;
  --el-table-header-bg-color: #001e36;
  --el-table-header-text-color: #8b9aae;
  --el-table-border-color: #1f2d3d;
  --el-table-row-hover-bg-color: #001e36;
}

:deep(.el-table th) {
  background-color: #001e36;
}

:deep(.el-table td),
:deep(.el-table th.is-leaf) {
  border-bottom: 1px solid #1f2d3d;
}

:deep(.row-failed) {
  --el-table-tr-bg-color: rgba(245, 108, 108, 0.1);
}

:deep(.row-pending) {
  --el-table-tr-bg-color: rgba(230, 162, 60, 0.1);
}

:deep(.el-pagination) {
  --el-pagination-hover-color: #409eff;
  --el-pagination-button-color: #b9c0cc;
  --el-pagination-bg-color: #001e36;
  --el-pagination-button-bg-color: #001e36;
  --el-border-color: #1f2d3d;
  --el-pagination-button-disabled-bg-color: #001529;
}

.pagination {
  padding: 16px 20px;
  border-top: 1px solid #1f2d3d;
  display: flex;
  justify-content: flex-end;
}
</style>
