<template>
  <div class="data-table">
    <div class="table-header">
      <div class="table-title">
        <el-icon><DataLine /></el-icon>
        <span>{{ title }}</span>
      </div>
      <div class="table-controls">
        <el-input
          v-model="searchKeyword"
          placeholder="搜索..."
          size="small"
          style="width: 200px"
          clearable
          @input="handleSearch"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
        <el-button size="small" type="success" @click="handleExport" :disabled="data.length === 0">
          <el-icon><Download /></el-icon>
          导出
        </el-button>
        <el-button size="small" type="primary" @click="handleRefresh" :loading="loading">
          <el-icon><Refresh /></el-icon>
          刷新
        </el-button>
      </div>
    </div>

    <div class="table-container">
      <el-table
        :data="pagedData"
        border
        stripe
        height="400"
        style="width: 100%"
        :header-cell-style="{ background: '#f5f7fa', color: '#333' }"
        empty-text="暂无数据"
      >
        <el-table-column
          v-for="column in columns"
          :key="column.key"
          :prop="column.key"
          :label="column.label"
          :width="column.width"
          :align="column.align || 'center'"
          :formatter="column.formatter"
          show-overflow-tooltip
        >
          <template v-if="column.slot" #default="scope">
            <slot :name="column.slot" :row="scope.row" :value="scope.row[column.key]"></slot>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <div class="pagination-container">
      <el-pagination
        v-model:current-page="currentPage"
        v-model:page-size="pageSize"
        :page-sizes="[50, 100, 200, 500]"
        :total="filteredData.length"
        layout="total, sizes, prev, pager, next, jumper"
        @size-change="handleSizeChange"
        @current-change="handleCurrentChange"
        background
      />
    </div>

    <div class="table-stats">
      <span>共 {{ filteredData.length }} 条数据</span>
      <span v-if="loading" style="color: #409EFF; margin-left: 16px;">
        <el-icon class="is-loading"><Loading /></el-icon>
        加载中...
      </span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { DataLine, Search, Download, Refresh, Loading } from '@element-plus/icons-vue'
import dayjs from 'dayjs'
import { exportService } from '@/services/export'

const props = defineProps({
  title: {
    type: String,
    default: '数据列表'
  },
  data: {
    type: Array,
    default: () => []
  },
  columns: {
    type: Array,
    default: () => []
  },
  loading: {
    type: Boolean,
    default: false
  },
  pageSize: {
    type: Number,
    default: 100
  },
  exportFilename: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['refresh', 'search', 'export', 'pageChange'])

const currentPage = ref(1)
const internalPageSize = ref(props.pageSize)
const searchKeyword = ref('')

const filteredData = computed(() => {
  if (!searchKeyword.value) {
    return props.data
  }

  const keyword = searchKeyword.value.toLowerCase()
  return props.data.filter((item) => {
    return Object.values(item).some((value) => {
      return String(value).toLowerCase().includes(keyword)
    })
  })
})

const pagedData = computed(() => {
  const start = (currentPage.value - 1) * internalPageSize.value
  const end = start + internalPageSize.value
  return filteredData.value.slice(start, end)
})

const handleSearch = () => {
  currentPage.value = 1
  emit('search', searchKeyword.value)
}

const handleRefresh = () => {
  emit('refresh')
}

const handleSizeChange = (size) => {
  internalPageSize.value = size
  currentPage.value = 1
  emit('pageChange', { page: currentPage.value, pageSize: size })
}

const handleCurrentChange = (page) => {
  emit('pageChange', { page, pageSize: internalPageSize.value })
}

const handleExport = async () => {
  try {
    await ElMessageBox.confirm(
      `确定要导出 ${filteredData.value.length} 条数据吗？`,
      '导出确认',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'info'
      }
    )

    exportService.exportToExcel(
      filteredData.value,
      props.exportFilename || `水文数据_${dayjs().format('YYYYMMDD_HHmmss')}.xlsx`,
      {
        headers: props.columns.map((col) => ({
          key: col.key,
          label: col.label
        }))
      }
    )

    ElMessage.success('数据导出成功')
    emit('export', filteredData.value)
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('数据导出失败')
    }
  }
}

watch(
  () => props.data,
  () => {
    currentPage.value = 1
  }
)
</script>

<style scoped>
.data-table {
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  padding: 16px;
}

.table-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.table-title {
  display: flex;
  align-items: center;
  font-size: 16px;
  font-weight: 600;
  color: #333;
}

.table-title .el-icon {
  margin-right: 8px;
  color: #67C23A;
}

.table-controls {
  display: flex;
  align-items: center;
  gap: 10px;
}

.table-container {
  width: 100%;
}

.pagination-container {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}

.table-stats {
  display: flex;
  align-items: center;
  margin-top: 12px;
  font-size: 13px;
  color: #666;
}

:deep(.el-table th.el-table__cell) {
  background-color: #f5f7fa;
  color: #333;
  font-weight: 600;
}

:deep(.el-table--border .el-table__inner-wrapper::after) {
  display: none;
}
</style>
