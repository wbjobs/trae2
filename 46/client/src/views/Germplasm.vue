<template>
  <div class="page-container">
    <div class="page-header">
      <h1 class="page-title">种质资源管理</h1>
      <div>
        <el-button type="primary" @click="goToNew">
          <el-icon><Plus /></el-icon> 登记新资源
        </el-button>
        <el-button @click="loadData">
          <el-icon><Refresh /></el-icon> 刷新
        </el-button>
        <el-button type="success" @click="showBatchDialog = true" :disabled="selectedIds.length === 0">
          <el-icon><Download /></el-icon> 批量导出
        </el-button>
      </div>
    </div>

    <div class="filter-bar">
      <el-input
        v-model="filters.keyword"
        placeholder="搜索资源编号/名称/英文名/来源"
        clearable
        style="width: 280px"
        @keyup.enter="handleSearch"
        @clear="handleSearch"
      >
        <template #prefix><el-icon><Search /></el-icon></template>
      </el-input>
      <el-select v-model="filters.classification_id" placeholder="选择分类" clearable style="width: 180px" @change="handleSearch">
        <el-option v-for="c in classificationOptions" :key="c.id" :label="c.name" :value="c.id" />
      </el-select>
      <el-select v-model="filters.status" placeholder="状态" clearable style="width: 120px" @change="handleSearch">
        <el-option label="有效" value="active" />
        <el-option label="停用" value="inactive" />
      </el-select>
      <el-button type="primary" @click="handleSearch">搜索</el-button>
      <el-button @click="resetFilters">重置</el-button>
    </div>

    <el-card shadow="never" class="table-card">
      <div class="table-header">
        <span class="selected-info" v-if="selectedIds.length > 0">
          已选择 <strong>{{ selectedIds.length }}</strong> 项
          <el-button link type="primary" @click="clearSelection">取消选择</el-button>
        </span>
      </div>

      <el-table
        :data="tableData"
        stripe
        style="width: 100%"
        v-loading="loading"
        @selection-change="handleSelectionChange"
        row-key="id"
      >
        <el-table-column type="selection" width="50" width="50" />
        <el-table-column prop="resource_no" label="资源编号" width="200">
          <template #default="{ row }">
            <el-link type="primary" @click="goToDetail(row.id)">{{ row.resource_no }}</el-link>
          </template>
        </el-table-column>
        <el-table-column prop="name" label="种质名称" min-width="140" show-overflow-tooltip />
        <el-table-column prop="english_name" label="英文名" min-width="140" show-overflow-tooltip />
        <el-table-column label="分类" min-width="140">
          <template #default="{ row }">
            <el-tag v-if="row.classification_name" type="success" effect="light">{{ row.classification_name }}</el-tag>
            <span v-else style="color:#c0c4cc">未分类</span>
          </template>
        </el-table-column>
        <el-table-column prop="origin" label="来源地" min-width="120" show-overflow-tooltip />
        <el-table-column prop="material_type" label="材料类型" width="110" />
        <el-table-column label="性状" width="80" align="center">
          <template #default="{ row }">
            <el-tag size="small">{{ row.trait_count || 0 }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="影像" width="80" align="center">
          <template #default="{ row }">
            <el-tag size="small" type="success">{{ row.image_count || 0 }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="80">
          <template #default="{ row }">
            <el-tag :type="row.status === 'active' ? 'success' : 'info'" size="small">
              {{ row.status === 'active' ? '有效' : '停用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="登记时间" width="170" />
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="goToDetail(row.id)">
              <el-icon><View /></el-icon> 详情
            </el-button>
            <el-button link type="primary" size="small" @click="goToEdit(row.id)">
              <el-icon><Edit /></el-icon> 编辑
            </el-button>
            <el-button link type="danger" size="small" @click="handleDelete(row)">
              <el-icon><Delete /></el-icon> 删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination-container">
        <el-pagination
        v-model:current-page="pagination.page"
        v-model:page-size="pagination.pageSize"
        :total="pagination.total"
        :page-sizes="[10, 20, 50, 100, 200, 500"
        layout="total, sizes, prev, pager, next, jumper"
        @size-change="handleSizeChange"
        @current-change="loadData"
      />
      </div>
    </el-card>

    <el-dialog
      v-model="showBatchDialog"
      title="批量导出"
      width="500px"
    >
      <el-form>
        <el-form-item label="导出格式">
        <el-radio-group v-model="exportFormat">
          <el-radio value="json">JSON</el-radio>
          <el-radio value="csv">CSV</el-radio>
        </el-radio-group>
      </el-form-item>
        <el-form-item label="包含内容">
          <el-checkbox v-model="exportOptions.basicInfo">基本信息</el-checkbox>
          <el-checkbox v-model="exportOptions.traits">性状记录</el-checkbox>
          <el-checkbox v-model="exportOptions.images">影像信息</el-checkbox>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showBatchDialog = false">取消</el-button>
        <el-button type="primary" @click="handleExport">导出</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api } from '@/api'

const router = useRouter()
const loading = ref(false)
const tableData = ref([])
const classificationOptions = ref([])
const filters = ref({ keyword: '', classification_id: '', status: '' })
const pagination = ref({ page: 1, pageSize: 20, total: 0 })
const selectedIds = ref([])
const selectedRows = ref([])
const showBatchDialog = ref(false)
const exportFormat = ref('json')
const exportOptions = ref({ basicInfo: true, traits: false, images: false })

const cacheKey = computed(() => {
  return JSON.stringify({ ...filters.value, page: pagination.value.page, pageSize: pagination.value.pageSize })
})

const dataCache = ref({})

async function loadClassifications() {
  try {
    const res = await api.classification.flat()
    classificationOptions.value = res.data || []
  } catch (e) {
    console.error(e)
  }
}

async function loadData() {
  const key = cacheKey.value
  
  if (dataCache.value[key]) {
    tableData.value = dataCache.value[key].list
    pagination.value.total = dataCache.value[key].total
    return
  }

  loading.value = true
  try {
    const params = {
      ...filters.value,
      page: pagination.value.page,
      pageSize: pagination.value.pageSize
    }
    
    const res = await api.germplasm.list(params)
    tableData.value = res.data.list
    pagination.value.total = res.data.total

    dataCache.value[key] = {
      list: res.data.list,
      total: res.data.total,
      timestamp: Date.now()
    }

    if (Object.keys(dataCache.value).length > 50) {
      const keys = Object.keys(dataCache.value)
      const oldestKey = keys.sort((a, b) => dataCache.value[a].timestamp - dataCache.value[b].timestamp)[0]
      delete dataCache.value[oldestKey]
    }
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

function handleSearch() {
  pagination.value.page = 1
  dataCache.value = {}
  loadData()
}

function resetFilters() {
  filters.value = { keyword: '', classification_id: '', status: '' }
  handleSearch()
}

function handleSizeChange() {
  pagination.value.page = 1
  loadData()
}

function handleSelectionChange(selection) {
  selectedRows.value = selection
  selectedIds.value = selection.map(row => row.id)
}

function clearSelection() {
  selectedIds.value = []
  selectedRows.value = []
}

function goToNew() {
  router.push('/germplasm/new')
}

function goToDetail(id) {
  router.push(`/germplasm/detail/${id}`)
}

function goToEdit(id) {
  router.push(`/germplasm/edit/${id}`)
}

async function handleDelete(row) {
  try {
    await ElMessageBox.confirm(`确定删除种质资源 "${row.name}" 吗？此操作不可恢复。`, '确认删除', {
      confirmButtonText: '确定删除',
      cancelButtonText: '取消',
      type: 'warning'
    })
    await api.germplasm.delete(row.id)
    ElMessage.success('删除成功')
    dataCache.value = {}
    loadData()
  } catch (e) {
    if (e !== 'cancel') console.error(e)
  }
}

async function handleExport() {
  try {
    const exportData = selectedRows.value.map(row => {
      const result = {}
      if (exportOptions.value.basicInfo) {
        Object.assign(result, {
        id: row.id,
        resource_no: row.resource_no,
        name: row.name,
        english_name: row.english_name,
        classification_name: row.classification_name,
        origin: row.origin,
        material_type: row.material_type,
        status: row.status,
        created_at: row.created_at
      })
    }
      return result
    })

    const content = exportFormat.value === 'json' 
      ? JSON.stringify(exportData, null, 2)
      : convertToCSV(exportData)

    const blob = new Blob([content], { 
      type: exportFormat.value === 'json' ? 'application/json' : 'text/csv' 
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `germplasm-export-${Date.now()}.${exportFormat.value}`
    a.click()
    URL.revokeObjectURL(url)

    ElMessage.success(`已导出 ${selectedRows.value.length} 条数据`)
    showBatchDialog.value = false
  } catch (e) {
    console.error(e)
    ElMessage.error('导出失败')
  }
}

function convertToCSV(data) {
  if (data.length === 0) return ''
  
  const headers = Object.keys(data[0])
  const csvRows = [headers.join(',')]
  
  for (const row of data) {
    const values = headers.map(header => {
      const val = row[header]
      return typeof val === 'string' && val.includes(',') ? `"${val}"` : val
      return val
    })
    csvRows.push(values.join(','))
  }
  
  return csvRows.join('\n')
}

onMounted(() => {
  loadClassifications()
  loadData()
})
</script>

<style scoped>
.filter-bar {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
  align-items: center;
}

.table-card {
  margin-top: 16px;
}

.table-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 12px;
}

.selected-info {
  font-size: 14px;
  color: #606266;
}

.selected-info strong {
  color: #409eff;
  margin: 0 4px;
}

.pagination-container {
  margin-top: 20px;
  text-align: right;
}
</style>
