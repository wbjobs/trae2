<template>
  <div class="profile-page">
    <el-row :gutter="20">
      <el-col :span="8">
        <el-card class="user-card">
          <div class="user-info-header">
            <el-avatar :size="80" class="user-avatar">
              {{ userStore.user?.realName?.charAt(0) || 'U' }}
            </el-avatar>
            <h2 class="user-name">{{ userStore.user?.realName || userStore.user?.username }}</h2>
            <el-tag :type="roleType" size="large" class="role-tag">
              {{ roleLabel }}
            </el-tag>
          </div>
          <el-divider />
          <div class="user-info-list">
            <div class="info-item">
              <span class="label">用户名</span>
              <span class="value">{{ userStore.user?.username }}</span>
            </div>
            <div class="info-item">
              <span class="label">邮箱</span>
              <span class="value">{{ userStore.user?.email || '-' }}</span>
            </div>
            <div class="info-item">
              <span class="label">电话</span>
              <span class="value">{{ userStore.user?.phone || '-' }}</span>
            </div>
            <div class="info-item">
              <span class="label">所属部门</span>
              <span class="value">{{ userStore.user?.department || '-' }}</span>
            </div>
            <div class="info-item">
              <span class="label">账户状态</span>
              <el-tag :type="userStore.user?.isActive ? 'success' : 'danger'">
                {{ userStore.user?.isActive ? '正常' : '已禁用' }}
              </el-tag>
            </div>
            <div class="info-item">
              <span class="label">创建时间</span>
              <span class="value">{{ formatDate(userStore.user?.createdAt) }}</span>
            </div>
            <div class="info-item">
              <span class="label">最后登录</span>
              <span class="value">{{ formatDate(userStore.user?.lastLoginAt) }}</span>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="16">
        <el-card class="edit-card">
          <template #header>
            <div class="card-header">
              <span>修改信息</span>
            </div>
          </template>
          <el-form
            ref="formRef"
            :model="formData"
            :rules="formRules"
            label-width="100px"
            class="profile-form"
          >
            <el-form-item label="真实姓名" prop="realName">
              <el-input v-model="formData.realName" placeholder="请输入真实姓名" />
            </el-form-item>
            <el-form-item label="邮箱" prop="email">
              <el-input v-model="formData.email" placeholder="请输入邮箱" />
            </el-form-item>
            <el-form-item label="电话" prop="phone">
              <el-input v-model="formData.phone" placeholder="请输入电话号码" />
            </el-form-item>
            <el-form-item label="所属部门" prop="department">
              <el-input v-model="formData.department" placeholder="请输入所属部门" />
            </el-form-item>
            <el-divider content-position="left">修改密码</el-divider>
            <el-form-item label="当前密码" prop="oldPassword">
              <el-input
                v-model="formData.oldPassword"
                type="password"
                placeholder="请输入当前密码"
                show-password
              />
            </el-form-item>
            <el-form-item label="新密码" prop="newPassword">
              <el-input
                v-model="formData.newPassword"
                type="password"
                placeholder="请输入新密码（6-20位）"
                show-password
              />
            </el-form-item>
            <el-form-item label="确认密码" prop="confirmPassword">
              <el-input
                v-model="formData.confirmPassword"
                type="password"
                placeholder="请再次输入新密码"
                show-password
              />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="loading" @click="handleSubmit">
                保存修改
              </el-button>
              <el-button @click="handleReset">重置</el-button>
            </el-form-item>
          </el-form>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useUserStore } from '@/stores/user';
import { updateProfile, changePassword } from '@/api/auth';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import { ROLE_LABELS } from '@/utils/constants';

const userStore = useUserStore();
const formRef = ref<FormInstance>();
const loading = ref(false);

const formData = ref({
  realName: '',
  email: '',
  phone: '',
  department: '',
  oldPassword: '',
  newPassword: '',
  confirmPassword: ''
});

const roleLabel = computed(() => {
  return userStore.user?.role ? ROLE_LABELS[userStore.user.role] || userStore.user.role : '';
});

const roleType = computed(() => {
  const role = userStore.user?.role;
  const typeMap: Record<string, string> = {
    admin: 'danger',
    curator: 'primary',
    researcher: 'success',
    viewer: 'info'
  };
  return typeMap[role || ''] || 'info';
});

const validateConfirmPassword = (rule: any, value: string, callback: any) => {
  if (value && value !== formData.value.newPassword) {
    callback(new Error('两次输入的密码不一致'));
  } else {
    callback();
  }
};

const formRules: FormRules = {
  realName: [
    { required: true, message: '请输入真实姓名', trigger: 'blur' },
    { min: 2, max: 20, message: '姓名长度在 2 到 20 个字符', trigger: 'blur' }
  ],
  email: [
    { type: 'email', message: '请输入正确的邮箱地址', trigger: 'blur' }
  ],
  phone: [
    { pattern: /^1[3-9]\d{9}$/, message: '请输入正确的手机号码', trigger: 'blur' }
  ],
  confirmPassword: [
    { validator: validateConfirmPassword, trigger: 'blur' }
  ]
};

const formatDate = (date: string | Date | undefined) => {
  if (!date) return '-';
  return new Date(date).toLocaleString('zh-CN');
};

const initForm = () => {
  if (userStore.user) {
    formData.value.realName = userStore.user.realName || '';
    formData.value.email = userStore.user.email || '';
    formData.value.phone = userStore.user.phone || '';
    formData.value.department = userStore.user.department || '';
  }
};

const handleSubmit = async () => {
  if (!formRef.value) return;
  
  await formRef.value.validate(async (valid) => {
    if (!valid) return;
    
    loading.value = true;
    try {
      const profileData = {
        realName: formData.value.realName,
        email: formData.value.email,
        phone: formData.value.phone,
        department: formData.value.department
      };
      
      await updateProfile(profileData);
      
      if (formData.value.newPassword) {
        await changePassword({
          oldPassword: formData.value.oldPassword,
          newPassword: formData.value.newPassword
        });
      }
      
      await userStore.fetchUserInfo();
      ElMessage.success('信息更新成功');
      handleReset();
    } catch (err: any) {
      ElMessage.error(err.message || '更新失败');
    } finally {
      loading.value = false;
    }
  });
};

const handleReset = () => {
  initForm();
  formData.value.oldPassword = '';
  formData.value.newPassword = '';
  formData.value.confirmPassword = '';
  formRef.value?.clearValidate();
};

onMounted(() => {
  initForm();
});
</script>

<style scoped lang="scss">
.profile-page {
  padding: 20px;
}

.user-card {
  .user-info-header {
    text-align: center;
    padding: 20px 0;

    .user-avatar {
      background-color: #409eff;
      font-size: 32px;
      font-weight: 600;
    }

    .user-name {
      margin: 16px 0 8px;
      font-size: 20px;
      font-weight: 600;
      color: #303133;
    }

    .role-tag {
      margin-top: 8px;
    }
  }

  .user-info-list {
    .info-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 0;
      border-bottom: 1px solid #f0f0f0;

      &:last-child {
        border-bottom: none;
      }

      .label {
        color: #909399;
        font-size: 14px;
      }

      .value {
        color: #303133;
        font-size: 14px;
        font-weight: 500;
      }
    }
  }
}

.edit-card {
  .card-header {
    font-weight: 600;
    font-size: 16px;
  }

  .profile-form {
    max-width: 600px;
  }
}
</style>
