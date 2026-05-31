<template>
  <div class="page-container">
    <div class="page-header">
      <div class="title">身份核验</div>
    </div>

    <el-row :gutter="20">
      <el-col :span="12">
        <div class="card">
          <div class="card-header"><span class="title">我的核验状态</span></div>

          <div class="verify-status" :class="statusClass">
            <el-icon :size="48">
              <CircleCheck v-if="userStore.userInfo?.verified" />
              <Clock v-else-if="userStore.userInfo?.verifyStatus === 'pending'" />
              <CircleClose v-else />
            </el-icon>
            <div class="status-text">
              <h3>{{ statusText }}</h3>
              <p v-if="userStore.userInfo?.verified">您已通过身份核验，可正常使用全部功能</p>
              <p v-else-if="userStore.userInfo?.verifyStatus === 'pending'">核验申请已提交，正在审核中，请耐心等待</p>
              <p v-else>请完成身份核验以使用完整功能</p>
            </div>
          </div>

          <el-button
            type="primary"
            size="large"
            style="width: 100%; margin-top: 20px"
            @click="submitDialogVisible = true"
            :disabled="userStore.userInfo?.verified || userStore.userInfo?.verifyStatus === 'pending'"
          >
            {{ userStore.userInfo?.verified ? '已通过核验' : userStore.userInfo?.verifyStatus === 'pending' ? '审核中' : '提交核验申请' }}
          </el-button>
        </div>

        <div class="card">
          <div class="card-header"><span class="title">核验说明</span></div>
          <el-steps direction="vertical" :active="3" finish-status="success">
            <el-step title="填写信息">
              <template #description>如实填写真实姓名、身份证号等信息</template>
            </el-step>
            <el-step title="上传证件">
              <template #description>上传身份证正反面照片</template>
            </el-step>
            <el-step title="人脸核验">
              <template #description>进行人脸识别，确保身份一致</template>
            </el-step>
            <el-step title="审核通过">
              <template #description>通过后即可使用签章等高级功能</template>
            </el-step>
          </el-steps>
        </div>
      </el-col>

      <el-col :span="12">
        <div class="card">
          <div class="card-header"><span class="title">我的核验记录</span></div>
          <el-table :data="myVerifications" v-loading="loading" empty-text="暂无核验记录">
            <el-table-column prop="verifyNo" label="核验编号" width="160" />
            <el-table-column prop="verifyMethod" label="核验方式" width="120">
              <template #default="{ row }">{{ methodOptions[row.verifyMethod] }}</template>
            </el-table-column>
            <el-table-column prop="confidence" label="置信度" width="100">
              <template #default="{ row }">
                <span v-if="row.confidence">{{ row.confidence }}%</span>
                <span v-else>-</span>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="statusType[row.status]">{{ statusOptions[row.status] }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="createdAt" label="申请时间" width="180">
              <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
            </el-table-column>
          </el-table>
        </div>

        <div class="card" v-if="userStore.hasRole('admin')">
          <div class="card-header"><span class="title">待审核列表</span></div>
          <el-table :data="pendingVerifications" v-loading="adminLoading">
            <el-table-column prop="verifyNo" label="核验编号" width="160" />
            <el-table-column prop="realName" label="姓名" width="100" />
            <el-table-column prop="idCard" label="身份证号" width="180">
              <template #default="{ row }">{{ maskIdCard(row.idCard) }}</template>
            </el-table-column>
            <el-table-column prop="verifyMethod" label="方式" width="100">
              <template #default="{ row }">{{ methodOptions[row.verifyMethod] }}</template>
            </el-table-column>
            <el-table-column label="操作" width="180">
              <template #default="{ row }">
                <el-button type="success" size="small" @click="handleApprove(row)">通过</el-button>
                <el-button type="danger" size="small" @click="handleReject(row)">拒绝</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-col>
    </el-row>

    <el-dialog v-model="submitDialogVisible" title="提交身份核验" width="600px" destroy-on-close>
      <el-form :model="verifyForm" :rules="verifyRules" ref="verifyFormRef" label-width="120px">
        <el-form-item label="真实姓名" prop="realName">
          <el-input v-model="verifyForm.realName" placeholder="请输入您的真实姓名" />
        </el-form-item>
        <el-form-item label="身份证号" prop="idCard">
          <el-input v-model="verifyForm.idCard" placeholder="请输入18位身份证号" maxlength="18" />
        </el-form-item>
        <el-form-item label="手机号">
          <el-input v-model="verifyForm.phone" placeholder="请输入手机号" maxlength="11" />
        </el-form-item>
        <el-form-item label="核验方式">
          <el-radio-group v-model="verifyForm.verifyMethod">
            <el-radio value="third_party">第三方自动核验</el-radio>
            <el-radio value="manual">人工审核</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="身份证正面">
          <el-input v-model="verifyForm.idCardFront" placeholder="请输入身份证正面照片URL" />
        </el-form-item>
        <el-form-item label="身份证反面">
          <el-input v-model="verifyForm.idCardBack" placeholder="请输入身份证反面照片URL" />
        </el-form-item>
        <el-form-item label="人脸照片">
          <el-input v-model="verifyForm.facePhoto" placeholder="请输入人脸照片URL" />
        </el-form-item>
      </el-form>
      <el-alert title="隐私声明" type="info" :closable="false" style="margin-top: 16px">
        <template #title>
          <div>您的身份信息仅用于核验，我们将严格保护您的隐私，不用于其他用途</div>
        </template>
      </el-alert>
      <template #footer>
        <el-button @click="submitDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitVerify">提交核验</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getMyVerifications, submitVerification, getVerifications, auditVerification } from '@/api/verification'
import { useUserStore } from '@/store/user'
import { CircleCheck, CircleClose, Clock } from '@element-plus/icons-vue'
import dayjs from 'dayjs'

const userStore = useUserStore()
const loading = ref(false)
const adminLoading = ref(false)
const submitDialogVisible = ref(false)
const verifyFormRef = ref()
const myVerifications = ref([])
const pendingVerifications = ref([])

const verifyForm = reactive({
  realName: userStore.userInfo?.realName || '',
  idCard: userStore.userInfo?.idCard || '',
  phone: userStore.userInfo?.phone || '',
  verifyMethod: 'third_party',
  idCardFront: '',
  idCardBack: '',
  facePhoto: ''
})

const verifyRules = {
  realName: [{ required: true, message: '请输入真实姓名', trigger: 'blur' }],
  idCard: [
    { required: true, message: '请输入身份证号', trigger: 'blur' },
    { pattern: /(^\d{15}$)|(^\d{18}$)|(^\d{17}(\d|X|x)$)/, message: '身份证号格式不正确' }
  ],
  phone: [
    { required: true, message: '请输入手机号', trigger: 'blur' },
    { pattern: /^1[3-9]\d{9}$/, message: '手机号格式不正确' }
  ]
}

const methodOptions = {
  manual: '人工审核',
  third_party: '第三方核验',
  face_recognition: '人脸识别',
  bank_card: '银行卡验证'
}

const statusType = { pending: 'warning', verifying: 'primary', approved: 'success', rejected: 'danger' }
const statusOptions = { pending: '待审核', verifying: '核验中', approved: '已通过', rejected: '已拒绝' }

const statusClass = computed(() => ({
  verified: userStore.userInfo?.verified,
  pending: userStore.userInfo?.verifyStatus === 'pending',
  rejected: userStore.userInfo?.verifyStatus === 'rejected'
}))

const statusText = computed(() => {
  if (userStore.userInfo?.verified) return '已通过身份核验'
  if (userStore.userInfo?.verifyStatus === 'pending') return '核验申请审核中'
  if (userStore.userInfo?.verifyStatus === 'rejected') return '核验未通过'
  return '未进行身份核验'
})

const formatDate = (date) => dayjs(date).format('YYYY-MM-DD HH:mm:ss')
const maskIdCard = (id) => id ? id.replace(/(\d{6})\d{8}(\d{4})/, '$1********$2') : '-'

const fetchMyVerifications = async () => {
  loading.value = true
  try {
    const res = await getMyVerifications()
    if (res.code === 200) myVerifications.value = res.data
  } finally {
    loading.value = false
  }
}

const fetchPendingVerifications = async () => {
  if (!userStore.hasRole('admin')) return
  adminLoading.value = true
  try {
    const res = await getVerifications({ status: 'pending', pageSize: 50 })
    if (res.code === 200) pendingVerifications.value = res.data.list
  } finally {
    adminLoading.value = false
  }
}

const submitVerify = async () => {
  try {
    await verifyFormRef.value.validate()
    const res = await submitVerification(verifyForm)
    if (res.code === 200) {
      ElMessage.success(res.message)
      submitDialogVisible.value = false
      userStore.updateUserInfo({ verifyStatus: 'pending' })
      fetchMyVerifications()

      setTimeout(async () => {
        await userStore.fetchUserInfo()
        fetchMyVerifications()
        if (userStore.userInfo?.verified) {
          ElMessage.success('身份核验已通过！')
        }
      }, 3000)
    }
  } catch (err) {}
}

const handleApprove = async (row) => {
  ElMessageBox.confirm(`确定通过 ${row.realName} 的核验申请吗？`, '提示', { type: 'warning' })
    .then(async () => {
      await auditVerification(row.id, { status: 'approved' })
      ElMessage.success('已通过')
      fetchPendingVerifications()
    })
    .catch(() => {})
}

const handleReject = async (row) => {
  ElMessageBox.prompt('请输入拒绝原因', '拒绝核验', {
    confirmButtonText: '确定拒绝',
    cancelButtonText: '取消',
    inputValidator: (value) => !!value || '请输入拒绝原因'
  }).then(async ({ value }) => {
    await auditVerification(row.id, { status: 'rejected', rejectReason: value })
    ElMessage.success('已拒绝')
    fetchPendingVerifications()
  }).catch(() => {})
}

onMounted(() => {
  fetchMyVerifications()
  fetchPendingVerifications()
})
</script>

<style lang="scss" scoped>
.verify-status {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 24px;
  background: #f5f7fa;
  border-radius: 12px;

  &.verified {
    background: linear-gradient(135deg, #f0f9eb 0%, #e1f3d8 100%);
    .el-icon { color: #67c23a; }
  }

  &.pending {
    background: linear-gradient(135deg, #fdf6ec 0%, #faecd8 100%);
    .el-icon { color: #e6a23c; }
  }

  &.rejected {
    background: linear-gradient(135deg, #fef0f0 0%, #fde2e2 100%);
    .el-icon { color: #f56c6c; }
  }

  .status-text h3 {
    margin: 0 0 8px;
    font-size: 18px;
  }

  .status-text p {
    margin: 0;
    color: #909399;
    font-size: 13px;
  }
}
</style>
