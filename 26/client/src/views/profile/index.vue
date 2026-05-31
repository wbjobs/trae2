<template>
  <div class="page-container">
    <div class="page-header">
      <div class="title">个人中心</div>
    </div>

    <el-row :gutter="20">
      <el-col :span="8">
        <div class="card profile-card">
          <div class="avatar-section">
            <el-avatar :size="100" :src="userStore.userInfo?.avatar">
              {{ userStore.userInfo?.realName?.charAt(0) }}
            </el-avatar>
            <h2>{{ userStore.userInfo?.realName }}</h2>
            <p>@{{ userStore.userInfo?.username }}</p>
            <el-tag :type="roleType[userStore.userInfo?.role]">{{ roleText[userStore.userInfo?.role] }}</el-tag>
            <div class="verify-status">
              <el-tag v-if="userStore.userInfo?.verified" type="success" size="small">
                <el-icon><CircleCheck /></el-icon> 已核验
              </el-tag>
              <el-tag v-else type="warning" size="small">
                <el-icon><Warning /></el-icon> 待核验
              </el-tag>
            </div>
          </div>
          <div class="info-list">
            <div class="info-item">
              <span class="label"><el-icon><Phone /></el-icon> 手机号</span>
              <span class="value">{{ userStore.userInfo?.phone || '-' }}</span>
            </div>
            <div class="info-item">
              <span class="label"><el-icon><Postcard /></el-icon> 身份证</span>
              <span class="value">{{ userStore.userInfo?.idCard ? maskIdCard(userStore.userInfo.idCard) : '-' }}</span>
            </div>
          </div>
        </div>
      </el-col>

      <el-col :span="16">
        <el-tabs v-model="activeTab">
          <el-tab-pane label="基本信息" name="profile">
            <div class="card">
              <el-form :model="profileForm" :rules="profileRules" ref="profileFormRef" label-width="100px">
                <el-row :gutter="20">
                  <el-col :span="12">
                    <el-form-item label="用户名">
                      <el-input v-model="profileForm.username" disabled />
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item label="真实姓名" prop="realName">
                      <el-input v-model="profileForm.realName" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item label="手机号" prop="phone">
                      <el-input v-model="profileForm.phone" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item label="头像URL">
                      <el-input v-model="profileForm.avatar" placeholder="输入头像图片地址" />
                    </el-form-item>
                  </el-col>
                </el-row>
                <div style="text-align: right">
                  <el-button type="primary" @click="updateProfile">保存修改</el-button>
                </div>
              </el-form>
            </div>
          </el-tab-pane>

          <el-tab-pane label="修改密码" name="password">
            <div class="card">
              <el-form :model="passwordForm" :rules="passwordRules" ref="passwordFormRef" label-width="120px" style="max-width: 500px">
                <el-form-item label="原密码" prop="oldPassword">
                  <el-input v-model="passwordForm.oldPassword" type="password" show-password />
                </el-form-item>
                <el-form-item label="新密码" prop="newPassword">
                  <el-input v-model="passwordForm.newPassword" type="password" show-password />
                </el-form-item>
                <el-form-item label="确认新密码" prop="confirmPassword">
                  <el-input v-model="passwordForm.confirmPassword" type="password" show-password />
                </el-form-item>
                <div style="text-align: right">
                  <el-button type="primary" @click="updatePassword">修改密码</el-button>
                </div>
              </el-form>
            </div>
          </el-tab-pane>

          <el-tab-pane label="操作日志" name="logs">
            <div class="card">
              <el-table :data="logs" v-loading="logsLoading">
                <el-table-column prop="operation" label="操作" width="150" />
                <el-table-column prop="module" label="模块" width="120">
                  <template #default="{ row }">{{ moduleMap[row.module] || row.module }}</template>
                </el-table-column>
                <el-table-column prop="detail" label="详情" />
                <el-table-column prop="ipAddress" label="IP地址" width="140" />
                <el-table-column prop="createdAt" label="时间" width="180">
                  <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
                </el-table-column>
              </el-table>
            </div>
          </el-tab-pane>
        </el-tabs>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { updateProfile as updateProfileApi, updatePassword as updatePasswordApi } from '@/api/auth'
import { getLogs } from '@/api/dashboard'
import { useUserStore } from '@/store/user'
import { CircleCheck, Warning, Phone, Postcard } from '@element-plus/icons-vue'
import dayjs from 'dayjs'

const userStore = useUserStore()
const activeTab = ref('profile')
const profileFormRef = ref()
const passwordFormRef = ref()
const logsLoading = ref(false)
const logs = ref([])

const profileForm = reactive({
  username: userStore.userInfo?.username || '',
  realName: userStore.userInfo?.realName || '',
  phone: userStore.userInfo?.phone || '',
  avatar: userStore.userInfo?.avatar || ''
})

const passwordForm = reactive({ oldPassword: '', newPassword: '', confirmPassword: '' })

const profileRules = {
  realName: [{ required: true, message: '请输入真实姓名', trigger: 'blur' }],
  phone: [{ pattern: /^1[3-9]\d{9}$/, message: '手机号格式不正确', trigger: 'blur' }]
}

const validateConfirm = (rule, value, callback) => {
  if (value !== passwordForm.newPassword) callback(new Error('两次输入的密码不一致'))
  else callback()
}

const passwordRules = {
  oldPassword: [{ required: true, message: '请输入原密码', trigger: 'blur' }],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 6, message: '密码长度不能少于6位', trigger: 'blur' }
  ],
  confirmPassword: [
    { required: true, message: '请确认新密码', trigger: 'blur' },
    { validator: validateConfirm, trigger: 'blur' }
  ]
}

const roleType = { admin: 'danger', artisan: 'primary', inspector: 'success', viewer: 'info' }
const roleText = { admin: '管理员', artisan: '工匠', inspector: '检查员', viewer: '浏览者' }
const moduleMap = { auth: '认证', archive: '档案', material: '物料', transfer: '流转', signature: '签章', verification: '核验', dashboard: '仪表盘' }

const maskIdCard = (id) => id ? id.replace(/(\d{6})\d{8}(\d{4})/, '$1********$2') : '-'
const formatDate = (date) => dayjs(date).format('YYYY-MM-DD HH:mm:ss')

watch(() => userStore.userInfo, (val) => {
  if (val) {
    Object.assign(profileForm, {
      username: val.username,
      realName: val.realName,
      phone: val.phone,
      avatar: val.avatar
    })
  }
}, { immediate: true })

const updateProfile = async () => {
  try {
    await profileFormRef.value.validate()
    const res = await updateProfileApi(profileForm)
    if (res.code === 200) {
      ElMessage.success('修改成功')
      userStore.updateUserInfo(profileForm)
    }
  } catch (err) {}
}

const updatePassword = async () => {
  try {
    await passwordFormRef.value.validate()
    const res = await updatePasswordApi(passwordForm)
    if (res.code === 200) {
      ElMessage.success('密码修改成功')
      Object.assign(passwordForm, { oldPassword: '', newPassword: '', confirmPassword: '' })
    }
  } catch (err) {}
}

const fetchLogs = async () => {
  logsLoading.value = true
  try {
    const res = await getLogs({ userId: userStore.userInfo?.id, pageSize: 50 })
    if (res.code === 200) logs.value = res.data.list
  } finally {
    logsLoading.value = false
  }
}

watch(activeTab, (val) => {
  if (val === 'logs') fetchLogs()
})
</script>

<style lang="scss" scoped>
.profile-card {
  text-align: center;

  .avatar-section {
    padding: 30px 0;
    border-bottom: 1px solid #eee;
    margin-bottom: 20px;

    h2 {
      margin: 16px 0 4px;
      font-size: 22px;
    }

    p {
      margin: 0 0 12px;
      color: #909399;
    }

    .verify-status {
      margin-top: 12px;
    }
  }

  .info-list {
    .info-item {
      display: flex;
      justify-content: space-between;
      padding: 12px 0;
      border-bottom: 1px solid #f0f0f0;

      &:last-child { border-bottom: none; }

      .label {
        display: flex;
        align-items: center;
        gap: 6px;
        color: #909399;
      }

      .value {
        color: #303133;
      }
    }
  }
}
</style>
