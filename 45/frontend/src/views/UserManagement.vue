<template>
  <div class="user-management">
    <div class="page-header">
      <h2 class="page-title">用户管理</h2>
      <el-button type="primary" :icon="Plus" @click="showAddDialog = true">
        新增用户
      </el-button>
    </div>

    <el-card class="table-card">
      <el-table
        :data="users"
        v-loading="loading"
        stripe
        style="width: 100%"
      >
        <el-table-column prop="username" label="用户名" width="140" />
        <el-table-column prop="realName" label="真实姓名" width="120" />
        <el-table-column prop="email" label="邮箱" min-width="180" />
        <el-table-column prop="role" label="角色" width="120">
          <template #default="{ row }">
            <el-tag :color="getRoleColor(row.role)" size="small" style="color: #fff">
              {{ getRoleLabel(row.role) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="department" label="部门" width="140" />
        <el-table-column prop="phone" label="电话" width="130" />
        <el-table-column prop="isActive" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.isActive ? 'success' : 'danger'" size="small">
              {{ row.isActive ? '正常' : '禁用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建时间" width="160">
          <template #default="{ row }">
            {{ formatDate(row.createdAt) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" text size="small" @click="handleEdit(row)">
              编辑
            </el-button>
            <el-button
              :type="row.isActive ? 'warning' : 'success'"
              text
              size="small"
              @click="toggleStatus(row)"
            >
              {{ row.isActive ? '禁用' : '启用' }}
            </el-button>
            <el-button
              type="danger"
              text
              size="small"
              @click="handleDelete(row)"
              v-if="row._id !== userStore.user?._id"
            >
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog
      v-model="showAddDialog"
      :title="isEdit ? '编辑用户' : '新增用户'"
      width="500px"
    >
      <el-form :model="formData" :rules="formRules" ref="formRef" label-width="100px">
        <el-form-item label="用户名" prop="username">
          <el-input v-model="formData.username" :disabled="isEdit" placeholder="请输入用户名" />
        </el-form-item>
        <el-form-item label="邮箱" prop="email">
          <el-input v-model="formData.email" placeholder="请输入邮箱" />
        </el-form-item>
        <el-form-item label="密码" prop="password" v-if="!isEdit">
          <el-input v-model="formData.password" type="password" placeholder="请输入密码" />
        </el-form-item>
        <el-form-item label="真实姓名" prop="realName">
          <el-input v-model="formData.realName" placeholder="请输入真实姓名" />
        </el-form-item>
        <el-form-item label="角色" prop="role">
          <el-select v-model="formData.role" placeholder="请选择角色" style="width: 100%">
            <el-option
              v-for="opt in ROLE_OPTIONS"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="部门">
          <el-input v-model="formData.department" placeholder="请输入部门" />
        </el-form-item>
        <el-form-item label="电话">
          <el-input v-model="formData.phone" placeholder="请输入电话" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="closeDialog">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmit">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import { getAllUsers, updateUser, deleteUser, register } from '@/api/auth';
import { ROLE_OPTIONS, getRoleLabel, getRoleColor } from '@/utils/constants';
import { useUserStore } from '@/stores/user';
import dayjs from 'dayjs';
import type { User } from '@/types';

const userStore = useUserStore();
const loading = ref(false);
const submitting = ref(false);
const users = ref<User[]>([]);
const showAddDialog = ref(false);
const isEdit = ref(false);
const formRef = ref<FormInstance>();

const formData = reactive({
  _id: '',
  username: '',
  email: '',
  password: '',
  realName: '',
  role: 'viewer' as any,
  department: '',
  phone: ''
});

const formRules: FormRules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  email: [{ required: true, message: '请输入邮箱', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
  realName: [{ required: true, message: '请输入真实姓名', trigger: 'blur' }],
  role: [{ required: true, message: '请选择角色', trigger: 'change' }]
};

const formatDate = (date: string) => dayjs(date).format('YYYY-MM-DD HH:mm');

const loadUsers = async () => {
  loading.value = true;
  try {
    const res = await getAllUsers();
    users.value = res.data?.users || [];
  } catch (err) {
    console.error('加载用户列表失败', err);
  } finally {
    loading.value = false;
  }
};

const handleEdit = (row: User) => {
  isEdit.value = true;
  formData._id = row._id;
  formData.username = row.username;
  formData.email = row.email;
  formData.password = '';
  formData.realName = row.realName;
  formData.role = row.role;
  formData.department = row.department || '';
  formData.phone = row.phone || '';
  showAddDialog.value = true;
};

const toggleStatus = (row: User) => {
  ElMessageBox.confirm(
    `确定要${row.isActive ? '禁用' : '启用'}用户"${row.realName}"吗？`,
    '提示',
    {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    }
  ).then(async () => {
    try {
      await updateUser(row._id, { isActive: !row.isActive });
      ElMessage.success('操作成功');
      loadUsers();
    } catch (err) {
    }
  });
};

const handleDelete = (row: User) => {
  ElMessageBox.confirm(
    `确定要删除用户"${row.realName}"吗？此操作不可恢复。`,
    '提示',
    {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    }
  ).then(async () => {
    try {
      await deleteUser(row._id);
      ElMessage.success('删除成功');
      loadUsers();
    } catch (err) {
    }
  });
};

const closeDialog = () => {
  showAddDialog.value = false;
  isEdit.value = false;
  formData._id = '';
  formData.username = '';
  formData.email = '';
  formData.password = '';
  formData.realName = '';
  formData.role = 'viewer';
  formData.department = '';
  formData.phone = '';
};

const handleSubmit = async () => {
  if (!formRef.value) return;
  await formRef.value.validate(async (valid) => {
    if (valid) {
      submitting.value = true;
      try {
        if (isEdit.value) {
          const { password, ...data } = formData;
          await updateUser(formData._id, data);
          ElMessage.success('修改成功');
        } else {
          await register(formData);
          ElMessage.success('创建成功');
        }
        closeDialog();
        loadUsers();
      } catch (err) {
      } finally {
        submitting.value = false;
      }
    }
  });
};

onMounted(() => {
  loadUsers();
});
</script>

<style scoped lang="scss">
.user-management {
  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;

    .page-title {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
    }
  }
}
</style>
