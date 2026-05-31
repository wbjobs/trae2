<template>
  <div class="page-container">
    <div class="page-header">
      <div class="title">电子签章</div>
      <div class="actions">
        <el-button type="primary" :icon="EditPen" @click="handleSign" :disabled="!userStore.userInfo?.verified">
          {{ userStore.userInfo?.verified ? '加盖签章' : '请先完成身份核验' }}
        </el-button>
      </div>
    </div>

    <el-row :gutter="20" style="margin-bottom: 20px">
      <el-col :span="8">
        <div class="sign-stat">
          <el-icon size="32" color="#409eff"><EditPen /></el-icon>
          <div>
            <div class="num">{{ stats.total }}</div>
            <div class="label">签章总数</div>
          </div>
        </div>
      </el-col>
      <el-col :span="8">
        <div class="sign-stat success">
          <el-icon size="32" color="#67c23a"><CircleCheck /></el-icon>
          <div>
            <div class="num">{{ stats.valid }}</div>
            <div class="label">有效签章</div>
          </div>
        </div>
      </el-col>
      <el-col :span="8">
        <div class="sign-stat warning">
          <el-icon size="32" color="#e6a23c"><Warning /></el-icon>
          <div>
            <div class="num">{{ stats.verifying }}</div>
            <div class="label">待验证</div>
          </div>
        </div>
      </el-col>
    </el-row>

    <div class="card">
      <div class="search-bar">
        <el-input v-model="filters.keyword" placeholder="搜索签章编号" clearable style="width: 200px" @keyup.enter="fetchData" />
        <el-select v-model="filters.signatureType" placeholder="签章类型" clearable style="width: 180px">
          <el-option v-for="(label, value) in typeOptions" :key="value" :label="label" :value="value" />
        </el-select>
        <el-select v-model="filters.status" placeholder="状态" clearable style="width: 150px">
          <el-option label="有效" value="valid" />
          <el-option label="已过期" value="expired" />
          <el-option label="已撤销" value="revoked" />
          <el-option label="无效" value="invalid" />
        </el-select>
        <el-button type="primary" :icon="Search" @click="fetchData">搜索</el-button>
        <el-button :icon="Refresh" @click="resetFilters">重置</el-button>
      </div>

      <el-table :data="tableData" v-loading="loading" stripe>
        <el-table-column prop="signatureNo" label="签章编号" width="160" />
        <el-table-column label="作品" min-width="200">
          <template #default="{ row }">
            <div>
              <div style="font-weight: 500">{{ row.archive?.name || row.archiveName }}</div>
              <div style="color: #909399; font-size: 12px">{{ typeOptions[row.signatureType] }}</div>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="signerName" label="签署人" width="120" />
        <el-table-column prop="signerRole" label="角色" width="100">
          <template #default="{ row }">{{ roleOptions[row.signerRole] }}</template>
        </el-table-column>
        <el-table-column label="证书编号" width="160">
          <template #default="{ row }">
            <span class="mono">{{ row.certificateNo }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="signedAt" label="签署时间" width="180">
          <template #default="{ row }">{{ formatDate(row.signedAt) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="statusType[row.status]">{{ statusText[row.status] }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" size="small" @click="verifySignature(row)">验证</el-button>
            <el-button size="small" @click="viewDetail(row)">详情</el-button>
            <el-button type="danger" size="small" @click="handleRevoke(row)" v-if="row.status === 'valid' && userStore.hasRole('admin')">撤销</el-button>
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

    <el-dialog v-model="signDialogVisible" title="加盖电子签章" width="600px" destroy-on-close>
      <el-form :model="signForm" :rules="signRules" ref="signFormRef" label-width="120px">
        <el-form-item label="选择作品" prop="archiveId">
          <el-select v-model="signForm.archiveId" filterable style="width: 100%">
            <el-option v-for="arc in archives" :key="arc.id" :label="`${arc.name} (${arc.archiveNo})`" :value="arc.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="签章类型" prop="signatureType">
          <el-select v-model="signForm.signatureType" style="width: 100%">
            <el-option v-for="(label, value) in typeOptions" :key="value" :label="label" :value="value" />
          </el-select>
        </el-form-item>
        <el-form-item label="签章数据" prop="signatureData">
          <el-input v-model="signForm.signatureData" type="textarea" :rows="3" placeholder="请输入签章说明或附加数据" />
        </el-form-item>
        <el-form-item label="文档哈希">
          <el-input v-model="signForm.documentHash" placeholder="可选：文档内容的SHA256哈希值" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="signForm.remark" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <el-alert title="重要提示" type="warning" :closable="false" style="margin-top: 16px">
        <template #title>
          <div>电子签章具有法律效力，请确认内容无误后再进行签署</div>
        </template>
      </el-alert>
      <template #footer>
        <el-button @click="signDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitSignature">确认签章</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="detailVisible" title="签章详情" width="600px">
      <div v-if="currentSignature">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="签章编号">{{ currentSignature.signatureNo }}</el-descriptions-item>
          <el-descriptions-item label="证书编号">{{ currentSignature.certificateNo }}</el-descriptions-item>
          <el-descriptions-item label="作品">{{ currentSignature.archive?.name }}</el-descriptions-item>
          <el-descriptions-item label="签章类型">{{ typeOptions[currentSignature.signatureType] }}</el-descriptions-item>
          <el-descriptions-item label="签署人">{{ currentSignature.signerName }}</el-descriptions-item>
          <el-descriptions-item label="角色">{{ roleOptions[currentSignature.signerRole] }}</el-descriptions-item>
          <el-descriptions-item label="签署时间">{{ formatDate(currentSignature.signedAt) }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="statusType[currentSignature.status]">{{ statusText[currentSignature.status] }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="签章说明" :span="2">{{ currentSignature.signatureData }}</el-descriptions-item>
          <el-descriptions-item label="签署IP">{{ currentSignature.ipAddress }}</el-descriptions-item>
          <el-descriptions-item label="地理位置">{{ currentSignature.location || '-' }}</el-descriptions-item>
          <el-descriptions-item label="文档哈希" :span="2">
            <span class="mono">{{ currentSignature.documentHash }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="公钥" :span="2">
            <div class="public-key">{{ currentSignature.publicKey }}</div>
          </el-descriptions-item>
        </el-descriptions>
      </div>
    </el-dialog>

    <el-dialog v-model="verifyVisible" title="签章验证结果" width="500px">
      <div v-if="verifyResult" class="verify-result" :class="{ valid: verifyResult.isValid }">
        <el-icon :size="64"><CircleCheck v-if="verifyResult.isValid" /><CircleClose v-else /></el-icon>
        <h3>{{ verifyResult.message }}</h3>
        <div class="verify-info">
          <div><span>签章编号:</span> {{ verifyResult.signatureNo }}</div>
          <div><span>签署人:</span> {{ verifyResult.signerName }}</div>
          <div><span>签署时间:</span> {{ formatDate(verifyResult.signedAt) }}</div>
          <div><span>过期状态:</span> {{ verifyResult.isExpired ? '已过期' : '未过期' }}</div>
          <div><span>撤销状态:</span> {{ verifyResult.isRevoked ? '已撤销' : '未撤销' }}</div>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getSignatures, createSignature, verifySignature as verifySigApi, revokeSignature, getSignatureStats } from '@/api/signatures'
import { getArchives } from '@/api/archives'
import { useUserStore } from '@/store/user'
import { EditPen, CircleCheck, Warning, Search, Refresh, CircleClose } from '@element-plus/icons-vue'
import dayjs from 'dayjs'

const userStore = useUserStore()
const loading = ref(false)
const signDialogVisible = ref(false)
const detailVisible = ref(false)
const verifyVisible = ref(false)
const signFormRef = ref()
const tableData = ref([])
const archives = ref([])
const currentSignature = ref(null)
const verifyResult = ref(null)

const filters = reactive({ keyword: '', signatureType: '', status: '' })
const pagination = reactive({ page: 1, pageSize: 10, total: 0 })

const signForm = reactive({
  archiveId: null,
  signatureType: '',
  signatureData: '',
  documentHash: '',
  remark: ''
})

const signRules = {
  archiveId: [{ required: true, message: '请选择作品', trigger: 'change' }],
  signatureType: [{ required: true, message: '请选择签章类型', trigger: 'change' }],
  signatureData: [{ required: true, message: '请输入签章数据', trigger: 'blur' }]
}

const typeOptions = {
  artisan_confirm: '工匠确认',
  quality_inspection: '质检确认',
  transfer_confirm: '流转确认',
  ownership_transfer: '所有权转移',
  archive_approval: '档案审批',
  other: '其他'
}

const roleOptions = { admin: '管理员', artisan: '工匠', inspector: '检查员', viewer: '浏览者' }
const statusType = { valid: 'success', invalid: 'danger', expired: 'warning', revoked: 'info' }
const statusText = { valid: '有效', invalid: '无效', expired: '已过期', revoked: '已撤销' }

const stats = ref({ total: 0, valid: 0, verifying: 0, expired: 0, revoked: 0 })

const formatDate = (date) => date ? dayjs(date).format('YYYY-MM-DD HH:mm:ss') : '-'

const fetchData = async () => {
  loading.value = true
  try {
    const res = await getSignatures({ ...filters, page: pagination.page, pageSize: pagination.pageSize })
    if (res.code === 200) {
      tableData.value = res.data.list
      pagination.total = res.data.total
    }
  } finally {
    loading.value = false
  }
}

const fetchArchives = async () => {
  const res = await getArchives({ pageSize: 100, status: 'approved' })
  if (res.code === 200) archives.value = res.data.list
}

const fetchStats = async () => {
  try {
    const res = await getSignatureStats()
    if (res.code === 200) {
      stats.value = res.data
    }
  } catch (err) {}
}

const resetFilters = () => {
  Object.assign(filters, { keyword: '', signatureType: '', status: '' })
  pagination.page = 1
  fetchData()
}

const handleSign = () => {
  if (!userStore.userInfo?.verified) {
    ElMessage.warning('请先完成身份核验后再使用签章功能')
    return
  }
  Object.assign(signForm, { archiveId: null, signatureType: '', signatureData: '', documentHash: '', remark: '' })
  signDialogVisible.value = true
}

const submitSignature = async () => {
  try {
    await signFormRef.value.validate()
    const res = await createSignature(signForm)
    if (res.code === 200) {
      ElMessage.success('签章成功！请妥善保管好您的私钥')
      console.log('Private Key:', res.data.privateKey)
      signDialogVisible.value = false
      fetchData()
      fetchStats()
    }
  } catch (err) {}
}

const verifySignature = async (row) => {
  const res = await verifySigApi({ signatureId: row.id })
  if (res.code === 200) {
    verifyResult.value = res.data
    verifyVisible.value = true
  }
}

const viewDetail = (row) => {
  currentSignature.value = row
  detailVisible.value = true
}

const handleRevoke = async (row) => {
  ElMessageBox.confirm('确定要撤销此签章吗？撤销后将无法恢复', '提示', { type: 'warning' })
    .then(async () => {
      await revokeSignature(row.id)
      ElMessage.success('已撤销')
      fetchData()
      fetchStats()
    })
    .catch(() => {})
}

onMounted(() => {
  fetchData()
  fetchArchives()
  fetchStats()
})
</script>

<style lang="scss" scoped>
.sign-stat {
  background: #fff;
  border-radius: 12px;
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 16px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.05);

  &.success { border-left: 4px solid #67c23a; }
  &.warning { border-left: 4px solid #e6a23c; }

  .num {
    font-size: 28px;
    font-weight: 600;
  }

  .label {
    color: #909399;
    font-size: 13px;
  }
}

.mono {
  font-family: monospace;
  font-size: 12px;
  color: #409eff;
}

.public-key {
  font-family: monospace;
  font-size: 11px;
  max-height: 100px;
  overflow-y: auto;
  background: #f5f7fa;
  padding: 8px;
  border-radius: 4px;
  word-break: break-all;
}

.verify-result {
  text-align: center;
  padding: 30px;

  &.valid .el-icon { color: #67c23a; }
  &:not(.valid) .el-icon { color: #f56c6c; }

  h3 {
    margin: 16px 0;
    font-size: 20px;
  }

  .verify-info {
    text-align: left;
    background: #f5f7fa;
    padding: 16px;
    border-radius: 8px;

    div {
      padding: 6px 0;

      span {
        color: #909399;
        min-width: 80px;
        display: inline-block;
      }
    }
  }
}
</style>
