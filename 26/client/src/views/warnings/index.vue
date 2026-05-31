<template>
  <div class="warnings-page">
    <el-card class="search-card">
      <el-form :inline="true" :model="filters" @submit.prevent>
        <el-form-item label="预警状态">
          <el-select v-model="filters.status" placeholder="全部" clearable>
            <el-option label="待处理" value="pending" />
            <el-option label="已处理" value="resolved" />
          </el-select>
        </el-form-item>
        <el-form-item label="预警级别">
          <el-select v-model="filters.warningLevel" placeholder="全部" clearable>
            <el-option label="严重" value="critical" />
            <el-option label="警告" value="warning" />
            <el-option label="普通" value="normal" />
          </el-select>
        </el-form-item>
        <el-form-item label="预警类型">
          <el-select v-model="filters.warningType" placeholder="全部" clearable>
            <el-option label="流转逾期" value="overdue" />
            <el-option label="即将到期" value="upcoming" />
            <el-option label="物流异常" value="logistics" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :icon="Search" @click="fetchData">搜索</el-button>
          <el-button :icon="Refresh" @click="resetFilters">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-row :gutter="20" class="stats-row">
      <el-col :span="6">
        <el-card shadow="hover">
          <div class="stat-item">
            <div class="stat-label">待处理预警</div>
            <div class="stat-value pending">{{ stats.pending }}</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover">
          <div class="stat-item">
            <div class="stat-label">严重预警</div>
            <div class="stat-value critical">{{ stats.critical }}</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover">
          <div class="stat-item">
            <div class="stat-label">警告预警</div>
            <div class="stat-value warning">{{ stats.warning }}</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover">
          <div class="stat-item">
            <div class="stat-label">已处理</div>
            <div class="stat-value resolved">{{ stats.resolved }}</div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-card class="table-card">
      <template #header>
        <div class="card-header">
          <span>预警列表</span>
          <div>
            <el-button :icon="Warning" @click="scanWarnings" type="danger">扫描流转异常</el-button>
          </div>
        </div>
      </template>

      <el-table :data="tableData" v-loading="loading" stripe>
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column prop="warningLevel" label="级别" width="100">
          <template #default="{ row }">
            <el-tag :type="getLevelType(row.warningLevel)">{{ getLevelLabel(row.warningLevel) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="title" label="标题" min-width="150" />
        <el-table-column prop="message" label="详情" min-width="200" show-overflow-tooltip />
        <el-table-column prop="archiveName" label="作品名称" width="150" />
        <el-table-column prop="handlerName" label="负责人" width="100" />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 'pending' ? 'warning' : 'success'">
              {{ row.status === 'pending' ? '待处理' : '已处理' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建时间" width="180">
          <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="viewDetail(row)">详情</el-button>
            <el-button v-if="row.status === 'pending'" link type="success" size="small" @click="handleResolve(row)">处理</el-button>
            <el-button link type="danger" size="small" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        v-model:current-page="pagination.page"
        v-model:page-size="pagination.pageSize"
        :total="pagination.total"
        :page-sizes="[10, 20, 50]"
        layout="total, sizes, prev, pager, next, jumper"
        @size-change="fetchData"
        @current-change="fetchData"
        class="pagination"
      />
    </el-card>

    <el-dialog v-model="detailVisible" title="预警详情" width="600px">
      <el-descriptions :column="2" border v-if="currentWarning">
        <el-descriptions-item label="预警级别">
          <el-tag :type="getLevelType(currentWarning.warningLevel)">{{ getLevelLabel(currentWarning.warningLevel) }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="预警类型">{{ currentWarning.warningType }}</el-descriptions-item>
        <el-descriptions-item label="状态" :span="2">
          <el-tag :type="currentWarning.status === 'pending' ? 'warning' : 'success'">
            {{ currentWarning.status === 'pending' ? '待处理' : '已处理' }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="标题" :span="2">{{ currentWarning.title }}</el-descriptions-item>
        <el-descriptions-item label="详情" :span="2">{{ currentWarning.message }}</el-descriptions-item>
        <el-descriptions-item label="作品名称">{{ currentWarning.archiveName }}</el-descriptions-item>
        <el-descriptions-item label="负责人">{{ currentWarning.handlerName }}</el-descriptions-item>
        <el-descriptions-item label="预计到达">{{ currentWarning.expectedArrival || '-' }}</el-descriptions-item>
        <el-descriptions-item label="实际到达">{{ currentWarning.actualArrival || '-' }}</el-descriptions-item>
        <el-descriptions-item label="创建时间" :span="2">{{ formatDate(currentWarning.createdAt) }}</el-descriptions-item>
        <el-descriptions-item v-if="currentWarning.resolvedAt" label="处理时间" :span="2">{{ formatDate(currentWarning.resolvedAt) }}</el-descriptions-item>
        <el-descriptions-item v-if="currentWarning.remark" label="处理备注" :span="2">{{ currentWarning.remark }}</el-descriptions-item>
      </el-descriptions>
    </el-dialog>

    <el-dialog v-model="resolveVisible" title="处理预警" width="500px">
      <el-form :model="resolveForm" label-width="80px">
        <el-form-item label="处理备注">
          <el-input v-model="resolveForm.remark" type="textarea" :rows="4" placeholder="请输入处理备注" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="resolveVisible = false">取消</el-button>
        <el-button type="primary" @click="confirmResolve">确认处理</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Refresh, Warning } from '@element-plus/icons-vue'
import { getWarnings, getWarningStats, resolveWarning, deleteWarning, checkTransferWarnings } from '@/api/warnings'

const loading = ref(false)
const tableData = ref([])
const filters = reactive({
  status: '',
  warningLevel: '',
  warningType: ''
})
const pagination = reactive({
  page: 1,
  pageSize: 10,
  total: 0
})
const stats = ref({ pending: 0, resolved: 0, critical: 0, warning: 0, normal: 0 })
const detailVisible = ref(false)
const resolveVisible = ref(false)
const currentWarning = ref(null)
const resolveForm = reactive({ remark: '' })

const fetchData = async () => {
  loading.value = true
  try {
    const res = await getWarnings({ ...filters, page: pagination.page, pageSize: pagination.pageSize })
    if (res.code === 200) {
      tableData.value = res.data.list
      pagination.total = res.data.total
    }
  } finally {
    loading.value = false
  }
}

const fetchStats = async () => {
  const res = await getWarningStats()
  if (res.code === 200) {
    stats.value = res.data
  }
}

const resetFilters = () => {
  filters.status = ''
  filters.warningLevel = ''
  filters.warningType = ''
  pagination.page = 1
  fetchData()
}

const scanWarnings = async () => {
  try {
    await ElMessageBox.confirm('确定要扫描所有流转记录并生成预警吗？', '确认', { type: 'warning' })
    const res = await checkTransferWarnings()
    if (res.code === 200) {
      ElMessage.success(res.message)
      fetchData()
      fetchStats()
    }
  } catch {}
}

const viewDetail = (row) => {
  currentWarning.value = row
  detailVisible.value = true
}

const handleResolve = (row) => {
  currentWarning.value = row
  resolveForm.remark = ''
  resolveVisible.value = true
}

const confirmResolve = async () => {
  try {
    await resolveWarning(currentWarning.value.id, resolveForm)
    ElMessage.success('处理成功')
    resolveVisible.value = false
    fetchData()
    fetchStats()
  } catch {}
}

const handleDelete = (row) => {
  ElMessageBox.confirm('确定删除此预警吗？', '确认', { type: 'warning' }).then(async () => {
    await deleteWarning(row.id)
    ElMessage.success('删除成功')
    fetchData()
    fetchStats()
  }).catch(() => {})
}

const getLevelType = (level) => {
  const map = { critical: 'danger', warning: 'warning', normal: 'info' }
  return map[level] || 'info'
}

const getLevelLabel = (level) => {
  const map = { critical: '严重', warning: '警告', normal: '普通' }
  return map[level] || level
}

const formatDate = (date) => {
  if (!date) return '-'
  return new Date(date).toLocaleString('zh-CN')
}

onMounted(() => {
  fetchData()
  fetchStats()
})
</script>

<style scoped>
.warnings-page { padding: 20px; }
.search-card { margin-bottom: 20px; }
.stats-row { margin-bottom: 20px; }
.stat-item { text-align: center; }
.stat-label { font-size: 14px; color: #666; margin-bottom: 10px; }
.stat-value { font-size: 32px; font-weight: bold; }
.stat-value.pending { color: #e6a23c; }
.stat-value.critical { color: #f56c6c; }
.stat-value.warning { color: #e6a23c; }
.stat-value.resolved { color: #67c23a; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
.table-card { margin-bottom: 20px; }
.pagination { margin-top: 20px; text-align: right; }
</style>
