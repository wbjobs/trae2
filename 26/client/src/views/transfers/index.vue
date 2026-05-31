<template>
  <div class="page-container">
    <div class="page-header">
      <div class="title">流转记录</div>
      <div class="actions">
        <el-button type="primary" :icon="Plus" @click="handleCreate">新建流转</el-button>
      </div>
    </div>

    <div class="card">
      <div class="search-bar">
        <el-input v-model="filters.keyword" placeholder="搜索单号/作品名称" clearable style="width: 200px" @keyup.enter="fetchData" />
        <el-select v-model="filters.transferType" placeholder="流转类型" clearable style="width: 150px">
          <el-option v-for="(label, value) in transferTypeOptions" :key="value" :label="label" :value="value" />
        </el-select>
        <el-select v-model="filters.status" placeholder="状态" clearable style="width: 150px">
          <el-option v-for="(label, value) in statusOptions" :key="value" :label="label" :value="value" />
        </el-select>
        <el-button type="primary" :icon="Search" @click="fetchData">搜索</el-button>
        <el-button :icon="Refresh" @click="resetFilters">重置</el-button>
      </div>

      <el-table :data="tableData" v-loading="loading" stripe>
        <el-table-column prop="transferNo" label="流转单号" width="160" />
        <el-table-column label="作品信息" min-width="200">
          <template #default="{ row }">
            <div>
              <div style="font-weight: 500">{{ row.archiveName }}</div>
              <div style="color: #909399; font-size: 12px">{{ transferTypeOptions[row.transferType] }}</div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="流转路径" min-width="280">
          <template #default="{ row }">
            <div class="transfer-path">
              <span class="party">{{ row.fromParty }}</span>
              <el-icon class="arrow"><Right /></el-icon>
              <span class="party">{{ row.toParty }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="物流" width="200">
          <template #default="{ row }">
            <div v-if="row.logisticsCompany">{{ row.logisticsCompany }}</div>
            <div v-if="row.trackingNo" style="color: #909399; font-size: 12px">{{ row.trackingNo }}</div>
          </template>
        </el-table-column>
        <el-table-column prop="transferDate" label="流转时间" width="180">
          <template #default="{ row }">{{ formatDate(row.transferDate) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="statusType[row.status]">{{ statusOptions[row.status] }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="handlerName" label="经办人" width="100" />
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" size="small" @click="handleView(row)">详情</el-button>
            <el-button size="small" @click="handleEdit(row)" v-if="row.status === 'pending'">编辑</el-button>
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

    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑流转' : '新建流转'" width="700px" destroy-on-close>
      <el-form :model="form" :rules="rules" ref="formRef" label-width="120px">
        <el-form-item label="选择作品" prop="archiveId">
          <el-select v-model="form.archiveId" filterable style="width: 100%" @change="onArchiveChange">
            <el-option v-for="arc in archives" :key="arc.id" :label="`${arc.name} (${arc.archiveNo})`" :value="arc.id">
              <span>{{ arc.name }}</span>
              <span style="float: right; color: #909399; font-size: 12px">{{ arc.archiveNo }}</span>
            </el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="流转类型" prop="transferType">
          <el-select v-model="form.transferType" style="width: 100%">
            <el-option v-for="(label, value) in transferTypeOptions" :key="value" :label="label" :value="value" />
          </el-select>
        </el-form-item>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="转出方" prop="fromParty">
              <el-input v-model="form.fromParty" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="转入方" prop="toParty">
              <el-input v-model="form.toParty" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="转出方联系">
              <el-input v-model="form.fromPartyContact" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="转入方联系">
              <el-input v-model="form.toPartyContact" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="转出地址">
              <el-input v-model="form.fromAddress" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="转入地址">
              <el-input v-model="form.toAddress" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="流转日期">
              <el-date-picker v-model="form.transferDate" type="datetime" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="预计到达">
              <el-date-picker v-model="form.estimatedArrival" type="date" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="物流公司">
              <el-input v-model="form.logisticsCompany" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="物流单号">
              <el-input v-model="form.trackingNo" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="保费(元)">
              <el-input-number v-model="form.insuranceAmount" :min="0" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="运费(元)">
              <el-input-number v-model="form.transferFee" :min="0" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="备注">
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

    <el-dialog v-model="detailVisible" title="流转详情" width="600px">
      <div v-if="currentTransfer">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="流转单号">{{ currentTransfer.transferNo }}</el-descriptions-item>
          <el-descriptions-item label="作品名称">{{ currentTransfer.archiveName }}</el-descriptions-item>
          <el-descriptions-item label="流转类型">{{ transferTypeOptions[currentTransfer.transferType] }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="statusType[currentTransfer.status]">{{ statusOptions[currentTransfer.status] }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="转出方" :span="2">{{ currentTransfer.fromParty }}</el-descriptions-item>
          <el-descriptions-item label="转入方" :span="2">{{ currentTransfer.toParty }}</el-descriptions-item>
          <el-descriptions-item label="流转日期">{{ formatDate(currentTransfer.transferDate) }}</el-descriptions-item>
          <el-descriptions-item label="经办人">{{ currentTransfer.handlerName }}</el-descriptions-item>
          <el-descriptions-item label="物流公司">{{ currentTransfer.logisticsCompany || '-' }}</el-descriptions-item>
          <el-descriptions-item label="物流单号">{{ currentTransfer.trackingNo || '-' }}</el-descriptions-item>
          <el-descriptions-item label="保费">¥{{ currentTransfer.insuranceAmount || 0 }}</el-descriptions-item>
          <el-descriptions-item label="运费">¥{{ currentTransfer.transferFee || 0 }}</el-descriptions-item>
          <el-descriptions-item label="备注" :span="2">{{ currentTransfer.description || '-' }}</el-descriptions-item>
        </el-descriptions>
        <div style="margin-top: 20px">
          <div class="detail-title">流转时间线</div>
          <el-steps :active="stepIndex" finish-status="success" size="small">
            <el-step title="创建" :description="formatDate(currentTransfer.createdAt)" />
            <el-step title="运输中" v-if="currentTransfer.status !== 'pending' && currentTransfer.status !== 'cancelled'" />
            <el-step title="已送达" v-if="['delivered', 'confirmed'].includes(currentTransfer.status)" :description="formatDate(currentTransfer.actualArrival)" />
            <el-step title="已确认" v-if="currentTransfer.status === 'confirmed'" />
          </el-steps>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { getTransfers, createTransfer, updateTransfer } from '@/api/transfers'
import { getArchives } from '@/api/archives'
import { Plus, Search, Refresh, Right } from '@element-plus/icons-vue'
import dayjs from 'dayjs'

const loading = ref(false)
const dialogVisible = ref(false)
const detailVisible = ref(false)
const isEdit = ref(false)
const formRef = ref()
const tableData = ref([])
const archives = ref([])
const currentTransfer = ref(null)

const filters = reactive({ keyword: '', transferType: '', status: '' })
const pagination = reactive({ page: 1, pageSize: 10, total: 0 })

const form = reactive({
  id: null, archiveId: null, archiveName: '', transferType: '',
  fromParty: '', toParty: '', fromPartyContact: '', toPartyContact: '',
  fromAddress: '', toAddress: '', transferDate: '', estimatedArrival: '',
  logisticsCompany: '', trackingNo: '', insuranceAmount: 0, transferFee: 0, description: ''
})

const rules = {
  archiveId: [{ required: true, message: '请选择作品', trigger: 'change' }],
  transferType: [{ required: true, message: '请选择流转类型', trigger: 'change' }],
  fromParty: [{ required: true, message: '请输入转出方', trigger: 'blur' }],
  toParty: [{ required: true, message: '请输入转入方', trigger: 'blur' }]
}

const transferTypeOptions = {
  creation: '创作启动',
  inspection: '质检送检',
  exhibition: '展览展示',
  sale: '销售',
  donation: '捐赠',
  loan: '出借',
  repair: '修复',
  other: '其他'
}

const statusOptions = {
  pending: '待发货',
  in_transit: '运输中',
  delivered: '已送达',
  confirmed: '已确认',
  cancelled: '已取消'
}

const statusType = { pending: 'warning', in_transit: 'primary', delivered: 'success', confirmed: 'success', cancelled: 'info' }

const stepIndex = computed(() => {
  if (!currentTransfer.value) return 0
  const steps = { pending: 1, in_transit: 2, delivered: 3, confirmed: 4, cancelled: 0 }
  return steps[currentTransfer.value.status] || 0
})

const formatDate = (date) => date ? dayjs(date).format('YYYY-MM-DD HH:mm:ss') : '-'

const fetchData = async () => {
  loading.value = true
  try {
    const res = await getTransfers({ ...filters, page: pagination.page, pageSize: pagination.pageSize })
    if (res.code === 200) {
      tableData.value = res.data.list
      pagination.total = res.data.total
    }
  } finally {
    loading.value = false
  }
}

const fetchArchives = async () => {
  const res = await getArchives({ pageSize: 100 })
  if (res.code === 200) archives.value = res.data.list
}

const resetFilters = () => {
  Object.assign(filters, { keyword: '', transferType: '', status: '' })
  pagination.page = 1
  fetchData()
}

const onArchiveChange = (id) => {
  const arc = archives.value.find(a => a.id === id)
  if (arc) {
    form.archiveName = arc.name
    form.fromParty = arc.currentHolder || '工作室'
    form.fromAddress = arc.currentLocation || ''
  }
}

const handleCreate = () => {
  isEdit.value = false
  Object.keys(form).forEach(key => {
    form[key] = typeof form[key] === 'number' ? 0 : ''
    form.id = null
    form.archiveId = null
  })
  dialogVisible.value = true
}

const handleEdit = (row) => {
  isEdit.value = true
  Object.assign(form, row)
  dialogVisible.value = true
}

const handleView = (row) => {
  currentTransfer.value = row
  detailVisible.value = true
}

const handleSubmit = async () => {
  try {
    await formRef.value.validate()
    if (isEdit.value) {
      await updateTransfer(form.id, form)
      ElMessage.success('更新成功')
    } else {
      await createTransfer(form)
      ElMessage.success('创建成功')
    }
    dialogVisible.value = false
    fetchData()
  } catch (err) {}
}

onMounted(() => {
  fetchData()
  fetchArchives()
})
</script>

<style lang="scss" scoped>
.transfer-path {
  display: flex;
  align-items: center;
  gap: 8px;

  .party {
    padding: 4px 8px;
    background: #f0f2f5;
    border-radius: 4px;
    font-size: 13px;
  }

  .arrow {
    color: #409eff;
  }
}

.detail-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 16px;
  color: #303133;
}
</style>
