<template>
  <div class="qrcode-page">
    <el-card class="search-card">
      <el-form :inline="true" :model="filters" @submit.prevent>
        <el-form-item label="作品分类">
          <el-select v-model="filters.category" placeholder="全部" clearable>
            <el-option v-for="cat in categories" :key="cat" :label="cat" :value="cat" />
          </el-select>
        </el-form-item>
        <el-form-item label="工艺类型">
          <el-select v-model="filters.craftType" placeholder="全部" clearable>
            <el-option v-for="t in craftTypes" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :icon="Search" @click="searchArchives">搜索</el-button>
          <el-button :icon="Refresh" @click="resetFilters">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card class="select-card">
      <template #header>
        <div class="card-header">
          <span>选择档案 (已选 {{ selectedIds.length }} 个)</span>
          <div>
            <el-button :icon="Delete" size="small" @click="clearSelection">清空选择</el-button>
            <el-button type="primary" :icon="Picture" size="small" :disabled="selectedIds.length === 0" @click="generateBatch">
              批量生成二维码
            </el-button>
          </div>
        </div>
      </template>

      <el-table :data="archives" @selection-change="handleSelectionChange" v-loading="loading" stripe>
        <el-table-column type="selection" width="55" />
        <el-table-column prop="archiveNo" label="档案编号" width="140" />
        <el-table-column prop="name" label="作品名称" min-width="180" />
        <el-table-column prop="category" label="分类" width="100" />
        <el-table-column prop="craftType" label="工艺类型" width="120" />
        <el-table-column prop="artisanName" label="工匠" width="100" />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)">{{ getStatusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="generateSingle(row)">生成二维码</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        v-model:current-page="pagination.page"
        v-model:page-size="pagination.pageSize"
        :total="pagination.total"
        :page-sizes="[10, 20, 50, 100]"
        layout="total, sizes, prev, pager, next, jumper"
        @size-change="searchArchives"
        @current-change="searchArchives"
        class="pagination"
      />
    </el-card>

    <el-dialog v-model="qrcodeVisible" title="溯源二维码" width="500px">
      <div v-if="currentQR" class="qrcode-display">
        <div class="qrcode-image">
          <img :src="currentQR.qrCode" alt="二维码" />
        </div>
        <el-descriptions :column="1" border class="qrcode-info">
          <el-descriptions-item label="档案编号">{{ currentQR.archive.archiveNo }}</el-descriptions-item>
          <el-descriptions-item label="作品名称">{{ currentQR.archive.name }}</el-descriptions-item>
          <el-descriptions-item label="工匠">{{ currentQR.archive.artisanName }}</el-descriptions-item>
          <el-descriptions-item label="溯源地址">
            <el-link :href="currentQR.archive.traceUrl" type="primary" target="_blank">{{ currentQR.archive.traceUrl }}</el-link>
          </el-descriptions-item>
        </el-descriptions>
        <div class="qrcode-actions">
          <el-button type="primary" @click="downloadQR">下载二维码</el-button>
        </div>
      </div>
    </el-dialog>

    <el-dialog v-model="batchVisible" title="批量生成二维码" width="900px">
      <div v-if="batchQRCodes.length > 0">
        <div class="batch-actions">
          <el-button type="primary" :icon="Download" @click="downloadAll">打包下载</el-button>
          <span>共生成 {{ batchQRCodes.length }} 个二维码</span>
        </div>
        <el-row :gutter="20" class="batch-grid">
          <el-col :xs="12" :sm="8" :md="6" :lg="4" v-for="item in batchQRCodes" :key="item.archive.id">
            <el-card shadow="hover" class="qr-card">
              <div class="qr-image">
                <img :src="item.qrCode" alt="二维码" />
              </div>
              <div class="qr-info">
                <div class="qr-name">{{ item.archive.name }}</div>
                <div class="qr-no">{{ item.archive.archiveNo }}</div>
              </div>
            </el-card>
          </el-col>
        </el-row>
      </div>
      <div v-else>
        <el-empty description="暂无二维码" />
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Search, Refresh, Delete, Picture, Download } from '@element-plus/icons-vue'
import { getArchives, getArchiveCategories } from '@/api/archives'
import { generateSingleQR, generateBatchQR, downloadQR } from '@/api/qrcode'

const loading = ref(false)
const archives = ref([])
const categories = ref([])
const craftTypes = ref(['脱胎漆器', '木雕', '瓷器', '刺绣', '剪纸', '竹编'])
const filters = reactive({ category: '', craftType: '' })
const pagination = reactive({ page: 1, pageSize: 10, total: 0 })
const selectedIds = ref([])
const qrcodeVisible = ref(false)
const batchVisible = ref(false)
const currentQR = ref(null)
const batchQRCodes = ref([])

const searchArchives = async () => {
  loading.value = true
  try {
    const res = await getArchives({
      ...filters,
      page: pagination.page,
      pageSize: pagination.pageSize
    })
    if (res.code === 200) {
      archives.value = res.data.list
      pagination.total = res.data.total
    }
  } finally {
    loading.value = false
  }
}

const loadCategories = async () => {
  const res = await getArchiveCategories()
  if (res.code === 200) {
    categories.value = res.data
  }
}

const resetFilters = () => {
  filters.category = ''
  filters.craftType = ''
  pagination.page = 1
  searchArchives()
}

const handleSelectionChange = (selection) => {
  selectedIds.value = selection.map(item => item.id)
}

const clearSelection = () => {
  selectedIds.value = []
}

const generateSingle = async (row) => {
  try {
    const res = await generateSingleQR(row.id)
    if (res.code === 200) {
      currentQR.value = res.data
      qrcodeVisible.value = true
    }
  } catch {}
}

const generateBatch = async () => {
  if (selectedIds.value.length === 0) {
    ElMessage.warning('请先选择档案')
    return
  }
  try {
    loading.value = true
    const res = await generateBatchQR({ archiveIds: selectedIds.value })
    if (res.code === 200) {
      batchQRCodes.value = res.data.list
      batchVisible.value = true
    }
  } finally {
    loading.value = false
  }
}

const downloadQR = async () => {
  if (!currentQR.value) return
  const link = document.createElement('a')
  link.href = currentQR.value.qrCode
  link.download = `${currentQR.value.archive.archiveNo}_溯源二维码.png`
  link.click()
  ElMessage.success('下载成功')
}

const downloadAll = () => {
  batchQRCodes.value.forEach((item, index) => {
    setTimeout(() => {
      const link = document.createElement('a')
      link.href = item.qrCode
      link.download = `${item.archive.archiveNo}_溯源二维码.png`
      link.click()
    }, index * 500)
  })
  ElMessage.success('开始批量下载')
}

const getStatusType = (status) => {
  const map = { approved: 'success', pending: 'warning', rejected: 'danger' }
  return map[status] || 'info'
}

const getStatusLabel = (status) => {
  const map = { approved: '已通过', pending: '待审核', rejected: '已驳回' }
  return map[status] || status
}

onMounted(() => {
  searchArchives()
  loadCategories()
})
</script>

<style scoped>
.qrcode-page { padding: 20px; }
.search-card { margin-bottom: 20px; }
.select-card { margin-bottom: 20px; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
.pagination { margin-top: 20px; text-align: right; }

.qrcode-display { text-align: center; }
.qrcode-image { margin-bottom: 20px; }
.qrcode-image img { width: 256px; height: 256px; border: 1px solid #eee; }
.qrcode-info { text-align: left; margin-bottom: 20px; }
.qrcode-actions { text-align: center; }

.batch-actions { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.batch-grid { max-height: 500px; overflow-y: auto; }
.qr-card { text-align: center; margin-bottom: 20px; }
.qr-image { margin-bottom: 10px; }
.qr-image img { width: 100%; height: 150px; object-fit: contain; }
.qr-info { text-align: left; }
.qr-name { font-weight: bold; font-size: 14px; margin-bottom: 5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.qr-no { font-size: 12px; color: #999; }
</style>
