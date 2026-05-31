<template>
  <div class="page-container">
    <div class="page-header">
      <div class="title">物料台账</div>
      <div class="actions">
        <el-button :icon="Download" @click="downloadTemplate">下载模板</el-button>
        <el-button :icon="Bottom" @click="exportData">导出数据</el-button>
        <el-upload :show-file-list="false" :before-upload="handleImport" accept=".xlsx,.xls">
          <el-button :icon="Upload">导入Excel</el-button>
        </el-upload>
        <el-button type="primary" :icon="Plus" @click="handleCreate">新增物料</el-button>
      </div>
    </div>

    <el-row :gutter="20" style="margin-bottom: 20px">
      <el-col :span="6">
        <div class="mini-stat">
          <div class="mini-stat-value">{{ stats.totalMaterials || 0 }}</div>
          <div class="mini-stat-label">物料总数</div>
        </div>
      </el-col>
      <el-col :span="6">
        <div class="mini-stat success">
          <div class="mini-stat-value">{{ stats.inStockCount || 0 }}</div>
          <div class="mini-stat-label">库存中</div>
        </div>
      </el-col>
      <el-col :span="6">
        <div class="mini-stat warning">
          <div class="mini-stat-value">{{ totalValueDisplay }}</div>
          <div class="mini-stat-label">库存总价值</div>
        </div>
      </el-col>
      <el-col :span="6">
        <div class="mini-stat info">
          <div class="mini-stat-value">{{ categoryCount }}</div>
          <div class="mini-stat-label">分类数</div>
        </div>
      </el-col>
    </el-row>

    <div class="card">
      <div class="search-bar">
        <el-input v-model="filters.keyword" placeholder="搜索物料名称" clearable style="width: 200px" @keyup.enter="fetchData" />
        <el-select v-model="filters.category" placeholder="分类" clearable style="width: 150px">
          <el-option label="颜料" value="颜料" />
          <el-option label="涂料" value="涂料" />
          <el-option label="木材" value="木材" />
          <el-option label="装饰材料" value="装饰材料" />
          <el-option label="宝石" value="宝石" />
        </el-select>
        <el-select v-model="filters.status" placeholder="状态" clearable style="width: 150px">
          <el-option label="库存中" value="in_stock" />
          <el-option label="使用中" value="in_use" />
          <el-option label="已用完" value="used" />
          <el-option label="已损坏" value="damaged" />
        </el-select>
        <el-button type="primary" :icon="Search" @click="fetchData">搜索</el-button>
        <el-button :icon="Refresh" @click="resetFilters">重置</el-button>
      </div>

      <el-table :data="tableData" v-loading="loading" stripe>
        <el-table-column prop="materialNo" label="物料编号" width="140" />
        <el-table-column label="物料信息" min-width="200">
          <template #default="{ row }">
            <div>
              <div style="font-weight: 500">{{ row.name }}</div>
              <div style="color: #909399; font-size: 12px">{{ row.category }} · {{ row.specification }}</div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="库存" width="120">
          <template #default="{ row }">{{ row.quantity }}{{ row.unit }}</template>
        </el-table-column>
        <el-table-column label="单价" width="100">
          <template #default="{ row }">¥{{ row.unitPrice }}</template>
        </el-table-column>
        <el-table-column label="总价值" width="120">
          <template #default="{ row }">¥{{ Number(row.totalValue).toLocaleString() }}</template>
        </el-table-column>
        <el-table-column prop="origin" label="产地" width="100" />
        <el-table-column prop="supplier" label="供应商" width="140" />
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="statusType[row.status]">{{ statusText[row.status] }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="storageLocation" label="库位" width="100" />
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" size="small" @click="handleUse(row)" v-if="row.status === 'in_stock'">领用</el-button>
            <el-button size="small" @click="handleEdit(row)">编辑</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        v-model:current-page="pagination.page"
        v-model:page-size="pagination.pageSize"
        :total="pagination.total"
        :page-sizes="[10, 20, 50]"
        layout="total, sizes, prev, pager, next, jumper"
        class="pagination"
        @current-change="fetchData"
        @size-change="fetchData"
      />
    </div>

    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑物料' : '新增物料'" width="600px" destroy-on-close>
      <el-form :model="form" :rules="rules" ref="formRef" label-width="100px">
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="物料名称" prop="name">
              <el-input v-model="form.name" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="分类" prop="category">
              <el-select v-model="form.category" style="width: 100%">
                <el-option label="颜料" value="颜料" />
                <el-option label="涂料" value="涂料" />
                <el-option label="木材" value="木材" />
                <el-option label="装饰材料" value="装饰材料" />
                <el-option label="宝石" value="宝石" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="规格">
              <el-input v-model="form.specification" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="单位">
              <el-input v-model="form.unit" placeholder="如: 克、千克、块" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="数量" prop="quantity">
              <el-input-number v-model="form.quantity" :min="0" :precision="2" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="单价(元)" prop="unitPrice">
              <el-input-number v-model="form.unitPrice" :min="0" :precision="2" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="产地">
              <el-input v-model="form.origin" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="供应商">
              <el-input v-model="form.supplier" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="采购日期">
              <el-date-picker v-model="form.purchaseDate" type="date" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="批次号">
              <el-input v-model="form.batchNo" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="质量等级">
              <el-input v-model="form.qualityLevel" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="库位">
              <el-input v-model="form.storageLocation" placeholder="如: A-01-01" />
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="描述">
              <el-input v-model="form.description" type="textarea" :rows="2" />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSubmit">确定</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="useDialogVisible" title="物料领用" width="400px" destroy-on-close>
      <el-form :model="useForm" ref="useFormRef" label-width="100px">
        <el-form-item label="物料">
          <el-input :value="currentMaterial?.name" disabled />
        </el-form-item>
        <el-form-item label="可用库存">
          <el-input :value="`${currentMaterial?.quantity}${currentMaterial?.unit}`" disabled />
        </el-form-item>
        <el-form-item label="领用数量" prop="quantity">
          <el-input-number v-model="useForm.quantity" :min="0" :max="currentMaterial?.quantity" style="width: 100%" />
        </el-form-item>
        <el-form-item label="用于作品" prop="archiveId">
          <el-select v-model="useForm.archiveId" filterable style="width: 100%" placeholder="请选择作品">
            <el-option v-for="arc in archives" :key="arc.id" :label="arc.name" :value="arc.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="用途说明">
          <el-input v-model="useForm.usageReason" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="useDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitUse">确定领用</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { ElMessage } from 'element-plus'
import {
  getMaterials, createMaterial, updateMaterial, getMaterialStats, useMaterial, getTemplate,
  exportMaterialData, importMaterials
} from '@/api/materials'
import { getArchives } from '@/api/archives'
import { Plus, Search, Refresh, Download, Upload, Bottom } from '@element-plus/icons-vue'

const loading = ref(false)
const dialogVisible = ref(false)
const useDialogVisible = ref(false)
const isEdit = ref(false)
const formRef = ref()
const useFormRef = ref()
const tableData = ref([])
const stats = ref({})
const archives = ref([])
const currentMaterial = ref(null)

const filters = reactive({ keyword: '', category: '', status: '' })
const pagination = reactive({ page: 1, pageSize: 10, total: 0 })

const form = reactive({
  id: null, name: '', category: '', specification: '', unit: '', quantity: 0,
  unitPrice: 0, origin: '', supplier: '', purchaseDate: '', batchNo: '',
  qualityLevel: '', storageLocation: '', description: ''
})

const useForm = reactive({ quantity: 0, archiveId: null, usageReason: '' })

const rules = {
  name: [{ required: true, message: '请输入物料名称', trigger: 'blur' }],
  category: [{ required: true, message: '请选择分类', trigger: 'change' }],
  quantity: [{ required: true, message: '请输入数量', trigger: 'blur' }],
  unitPrice: [{ required: true, message: '请输入单价', trigger: 'blur' }]
}

const statusType = { in_stock: 'success', in_use: 'primary', used: 'info', damaged: 'danger', returned: 'warning' }
const statusText = { in_stock: '库存中', in_use: '使用中', used: '已用完', damaged: '已损坏', returned: '已退回' }

const totalValueDisplay = computed(() => '¥' + Number(stats.value.totalValue || 0).toLocaleString())
const categoryCount = computed(() => stats.value.categories?.length || 0)

const fetchData = async () => {
  loading.value = true
  try {
    const res = await getMaterials({ ...filters, page: pagination.page, pageSize: pagination.pageSize })
    if (res.code === 200) {
      tableData.value = res.data.list
      pagination.total = res.data.total
    }
  } finally {
    loading.value = false
  }
}

const fetchStats = async () => {
  const res = await getMaterialStats()
  if (res.code === 200) stats.value = res.data
}

const fetchArchives = async () => {
  const res = await getArchives({ pageSize: 100 })
  if (res.code === 200) archives.value = res.data.list
}

const resetFilters = () => {
  Object.assign(filters, { keyword: '', category: '', status: '' })
  pagination.page = 1
  fetchData()
}

const handleCreate = () => {
  isEdit.value = false
  Object.keys(form).forEach(key => {
    form[key] = typeof form[key] === 'number' ? 0 : ''
    form.id = null
  })
  dialogVisible.value = true
}

const handleEdit = (row) => {
  isEdit.value = true
  Object.assign(form, row)
  dialogVisible.value = true
}

const handleSubmit = async () => {
  try {
    await formRef.value.validate()
    if (isEdit.value) {
      await updateMaterial(form.id, form)
      ElMessage.success('更新成功')
    } else {
      await createMaterial(form)
      ElMessage.success('新增成功')
    }
    dialogVisible.value = false
    fetchData()
    fetchStats()
  } catch (err) {}
}

const handleUse = (row) => {
  currentMaterial.value = row
  useForm.quantity = 0
  useForm.archiveId = null
  useForm.usageReason = ''
  useDialogVisible.value = true
}

const submitUse = async () => {
  try {
    await useMaterial(currentMaterial.value.id, useForm)
    ElMessage.success('领用成功')
    useDialogVisible.value = false
    fetchData()
    fetchStats()
  } catch (err) {}
}

const downloadTemplate = async () => {
  const res = await getTemplate()
  if (res.code === 200) {
    const link = document.createElement('a')
    link.href = 'data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,' + res.data
    link.download = '物料导入模板.xlsx'
    link.click()
  }
}

const exportData = async () => {
  loading.value = true
  try {
    const res = await exportMaterialData(filters)
    if (res.code === 200) {
      const link = document.createElement('a')
      link.href = 'data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,' + res.data.data
      link.download = res.data.filename || `物料台账_${new Date().toISOString().split('T')[0]}.xlsx`
      link.click()
      ElMessage.success('导出成功')
    }
  } catch (err) {
    ElMessage.error('导出失败')
  } finally {
    loading.value = false
  }
}

const handleImport = (file) => {
  const reader = new FileReader()
  reader.onload = async (e) => {
    loading.value = true
    try {
      const base64 = e.target.result.split(',')[1]
      const res = await importMaterials(base64)
      if (res.code === 200) {
        ElMessage.success(res.message)
        fetchData()
        fetchStats()
      }
    } catch (err) {
      ElMessage.error('导入失败')
    } finally {
      loading.value = false
    }
  }
  reader.readAsDataURL(file)
  return false
}

onMounted(() => {
  fetchData()
  fetchStats()
  fetchArchives()
})
</script>

<style lang="scss" scoped>
.mini-stat {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 12px;
  padding: 20px;
  color: #fff;

  &.success { background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%); }
  &.warning { background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); }
  &.info { background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); }

  .mini-stat-value {
    font-size: 28px;
    font-weight: 600;
    margin-bottom: 4px;
  }

  .mini-stat-label {
    font-size: 13px;
    opacity: 0.9;
  }
}
</style>
