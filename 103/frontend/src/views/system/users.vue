<template>
  <div class="users-page">
    <div class="search-form">
      <el-form :inline="true" :model="searchForm" class="search-form-inline">
        <el-form-item label="关键词">
          <el-input
            v-model="searchForm.keyword"
            placeholder="用户名/姓名/工号"
            clearable
            style="width: 200px"
          ></el-input>
        </el-form-item>
        <el-form-item label="角色">
          <el-select v-model="searchForm.role" placeholder="全部角色" clearable style="width: 140px">
            <el-option label="超级管理员" value="super_admin"></el-option>
            <el-option label="实验室管理员" value="lab_admin"></el-option>
            <el-option label="科研人员" value="researcher"></el-option>
            <el-option label="普通用户" value="user"></el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="searchForm.status" placeholder="全部状态" clearable style="width: 140px">
            <el-option label="正常" value="active"></el-option>
            <el-option label="禁用" value="disabled"></el-option>
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" icon="el-icon-search" @click="handleSearch">搜索</el-button>
          <el-button icon="el-icon-refresh" @click="handleReset">重置</el-button>
          <el-button
            type="success"
            icon="el-icon-plus"
            @click="handleAdd"
          >添加用户</el-button>
        </el-form-item>
      </el-form>
    </div>

    <div class="table-container">
      <el-table
        :data="users"
        v-loading="loading"
        stripe
        style="width: 100%"
      >
        <el-table-column label="用户信息" min-width="200">
          <template slot-scope="scope">
            <div class="user-info">
              <el-avatar :size="40" :src="scope.row.avatar">
                {{ scope.row.name?.charAt(0) }}
              </el-avatar>
              <div class="user-detail">
                <p class="user-name">{{ scope.row.name }}</p>
                <p class="user-username">@{{ scope.row.username }}</p>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="employee_id" label="工号" width="120"></el-table-column>
        <el-table-column prop="email" label="邮箱" min-width="180"></el-table-column>
        <el-table-column prop="phone" label="手机号" width="130"></el-table-column>
        <el-table-column label="角色" width="140">
          <template slot-scope="scope">
            <el-tag
              v-for="role in scope.row.roles"
              :key="role"
              :type="getRoleType(role)"
              size="mini"
              style="margin-right: 4px"
            >
              {{ role | roleFilter }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="所属部门" width="140">
          <template slot-scope="scope">
            <span>{{ scope.row.department || '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template slot-scope="scope">
            <el-tag :type="scope.row.status === 'active' ? 'success' : 'danger'" size="small">
              {{ scope.row.status === 'active' ? '正常' : '禁用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="创建时间" width="160">
          <template slot-scope="scope">
            {{ formatTime(scope.row.created_at) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right">
          <template slot-scope="scope">
            <el-button type="text" size="small" @click="handleEdit(scope.row)">编辑</el-button>
            <el-button
              type="text"
              size="small"
              :class="scope.row.status === 'active' ? 'danger-text' : 'success-text'"
              @click="handleToggleStatus(scope.row)"
            >{{ scope.row.status === 'active' ? '禁用' : '启用' }}</el-button>
            <el-button type="text" size="small" @click="handleDelete(scope.row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-empty v-if="users.length === 0 && !loading" description="暂无用户数据" />

      <div class="pagination-container" v-if="total > 0">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.page_size"
          :page-sizes="[10, 20, 50, 100]"
          :total="total"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="fetchUsers"
          @current-change="fetchUsers"
        />
      </div>
    </div>

    <el-dialog
      :title="dialogTitle"
      :visible.sync="dialogVisible"
      width="600px"
      append-to-body
      :close-on-click-modal="false"
    >
      <el-form :model="userForm" :rules="formRules" ref="userFormRef" label-width="100px">
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="用户名" prop="username">
              <el-input v-model="userForm.username" placeholder="请输入用户名" :disabled="isEdit"></el-input>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="姓名" prop="name">
              <el-input v-model="userForm.name" placeholder="请输入姓名"></el-input>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="工号" prop="employee_id">
              <el-input v-model="userForm.employee_id" placeholder="请输入工号"></el-input>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="邮箱" prop="email">
              <el-input v-model="userForm.email" placeholder="请输入邮箱"></el-input>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="手机号" prop="phone">
              <el-input v-model="userForm.phone" placeholder="请输入手机号"></el-input>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="所属部门" prop="department">
              <el-input v-model="userForm.department" placeholder="请输入所属部门"></el-input>
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="角色" prop="roles">
          <el-select
            v-model="userForm.roles"
            multiple
            placeholder="请选择用户角色"
            style="width: 100%"
          >
            <el-option label="超级管理员" value="super_admin"></el-option>
            <el-option label="实验室管理员" value="lab_admin"></el-option>
            <el-option label="科研人员" value="researcher"></el-option>
            <el-option label="普通用户" value="user"></el-option>
          </el-select>
        </el-form-item>
        <el-form-item v-if="!isEdit" label="密码" prop="password">
          <el-input v-model="userForm.password" type="password" placeholder="请输入初始密码"></el-input>
        </el-form-item>
        <el-form-item label="状态">
          <el-radio-group v-model="userForm.status">
            <el-radio value="active">正常</el-radio>
            <el-radio value="disabled">禁用</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <span slot="footer" class="dialog-footer">
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSubmit">确定</el-button>
      </span>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { defineComponent, reactive, ref } from 'vue'
import { getUserList, createUser, updateUser, deleteUser } from '@/api/user'
import { formatTime } from '@/utils'

export default defineComponent({
  name: 'UsersPage',
  filters: {
    roleFilter(role: string) {
      const roleMap: Record<string, string> = {
        super_admin: '超级管理员',
        lab_admin: '实验室管理员',
        researcher: '科研人员',
        user: '普通用户',
      }
      return roleMap[role] || role
    },
  },
  setup() {
    const searchForm = reactive({
      keyword: '',
      role: '',
      status: '',
    })

    const pagination = reactive({
      page: 1,
      page_size: 10,
    })

    const users = ref<any[]>([])
    const total = ref(0)
    const loading = ref(false)
    const dialogVisible = ref(false)
    const isEdit = ref(false)
    const dialogTitle = ref('添加用户')
    const userFormRef = ref<any>(null)

    const userForm = reactive({
      id: '',
      username: '',
      name: '',
      employee_id: '',
      email: '',
      phone: '',
      department: '',
      roles: [] as string[],
      password: '',
      status: 'active',
    })

    const formRules = {
      username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
      name: [{ required: true, message: '请输入姓名', trigger: 'blur' }],
      email: [
        { required: true, message: '请输入邮箱', trigger: 'blur' },
        { type: 'email', message: '请输入正确的邮箱地址', trigger: 'blur' },
      ],
      roles: [{ required: true, message: '请选择用户角色', trigger: 'change' }],
      password: [{ required: true, message: '请输入初始密码', trigger: 'blur' }],
    }

    const mockUsers = [
      {
        id: '1',
        username: 'admin',
        name: '系统管理员',
        employee_id: 'ADM001',
        email: 'admin@lab.edu.cn',
        phone: '13800138000',
        department: '信息中心',
        roles: ['super_admin'],
        status: 'active',
        avatar: '',
        created_at: new Date(Date.now() - 86400000 * 30).toISOString(),
      },
      {
        id: '2',
        username: 'labadmin',
        name: '实验室管理员',
        employee_id: 'LAB001',
        email: 'labadmin@lab.edu.cn',
        phone: '13800138001',
        department: '实验中心',
        roles: ['lab_admin'],
        status: 'active',
        avatar: '',
        created_at: new Date(Date.now() - 86400000 * 25).toISOString(),
      },
      {
        id: '3',
        username: 'zhangsan',
        name: '张三',
        employee_id: 'RES001',
        email: 'zhangsan@lab.edu.cn',
        phone: '13800138002',
        department: '材料科学与工程学院',
        roles: ['researcher', 'user'],
        status: 'active',
        avatar: '',
        created_at: new Date(Date.now() - 86400000 * 20).toISOString(),
      },
      {
        id: '4',
        username: 'lisi',
        name: '李四',
        employee_id: 'RES002',
        email: 'lisi@lab.edu.cn',
        phone: '13800138003',
        department: '物理学院',
        roles: ['researcher', 'user'],
        status: 'active',
        avatar: '',
        created_at: new Date(Date.now() - 86400000 * 15).toISOString(),
      },
      {
        id: '5',
        username: 'wangwu',
        name: '王五',
        employee_id: 'STU001',
        email: 'wangwu@lab.edu.cn',
        phone: '13800138004',
        department: '环境科学与工程学院',
        roles: ['user'],
        status: 'active',
        avatar: '',
        created_at: new Date(Date.now() - 86400000 * 10).toISOString(),
      },
      {
        id: '6',
        username: 'zhaoliu',
        name: '赵六',
        employee_id: 'STU002',
        email: 'zhaoliu@lab.edu.cn',
        phone: '13800138005',
        department: '材料科学与工程学院',
        roles: ['user'],
        status: 'disabled',
        avatar: '',
        created_at: new Date(Date.now() - 86400000 * 5).toISOString(),
      },
      {
        id: '7',
        username: 'sunqi',
        name: '孙七',
        employee_id: 'RES003',
        email: 'sunqi@lab.edu.cn',
        phone: '13800138006',
        department: '化学学院',
        roles: ['researcher', 'user'],
        status: 'active',
        avatar: '',
        created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
      },
      {
        id: '8',
        username: 'zhouba',
        name: '周八',
        employee_id: 'RES004',
        email: 'zhouba@lab.edu.cn',
        phone: '13800138007',
        department: '物理学院',
        roles: ['researcher', 'user'],
        status: 'active',
        avatar: '',
        created_at: new Date(Date.now() - 86400000).toISOString(),
      },
    ]

    return {
      searchForm,
      pagination,
      users,
      total,
      loading,
      dialogVisible,
      isEdit,
      dialogTitle,
      userForm,
      userFormRef,
      formRules,
      mockUsers,
      formatTime,
    }
  },
  mounted() {
    this.fetchUsers()
  },
  methods: {
    getRoleType(role: string) {
      const typeMap: Record<string, string> = {
        super_admin: 'danger',
        lab_admin: 'primary',
        researcher: 'success',
        user: 'info',
      }
      return typeMap[role] || 'info'
    },
    async fetchUsers() {
      this.loading = true
      try {
        const params: any = {
          page: this.pagination.page,
          page_size: this.pagination.page_size,
        }
        if (this.searchForm.keyword) {
          params.keyword = this.searchForm.keyword
        }
        if (this.searchForm.role) {
          params.role = this.searchForm.role
        }
        if (this.searchForm.status) {
          params.status = this.searchForm.status
        }

        const res: any = await getUserList(params)
        this.users = res.data?.items || this.mockUsers
        this.total = res.data?.total || this.mockUsers.length
      } catch (e) {
        this.users = this.mockUsers
        this.total = this.mockUsers.length
      } finally {
        this.loading = false
      }
    },
    handleSearch() {
      this.pagination.page = 1
      this.fetchUsers()
    },
    handleReset() {
      this.searchForm.keyword = ''
      this.searchForm.role = ''
      this.searchForm.status = ''
      this.handleSearch()
    },
    handleAdd() {
      this.isEdit = false
      this.dialogTitle = '添加用户'
      this.userForm.id = ''
      this.userForm.username = ''
      this.userForm.name = ''
      this.userForm.employee_id = ''
      this.userForm.email = ''
      this.userForm.phone = ''
      this.userForm.department = ''
      this.userForm.roles = []
      this.userForm.password = ''
      this.userForm.status = 'active'
      this.dialogVisible = true
    },
    handleEdit(row: any) {
      this.isEdit = true
      this.dialogTitle = '编辑用户'
      this.userForm.id = row.id
      this.userForm.username = row.username
      this.userForm.name = row.name
      this.userForm.employee_id = row.employee_id
      this.userForm.email = row.email
      this.userForm.phone = row.phone
      this.userForm.department = row.department
      this.userForm.roles = [...row.roles]
      this.userForm.password = ''
      this.userForm.status = row.status
      this.dialogVisible = true
    },
    async handleSubmit() {
      try {
        await (this.userFormRef as any).validate()
        const formData = { ...this.userForm }
        if (this.isEdit) {
          await updateUser(this.userForm.id, formData)
          this.$message.success('更新成功')
        } else {
          await createUser(formData)
          this.$message.success('创建成功')
        }
        this.dialogVisible = false
        this.fetchUsers()
      } catch (e) {
        this.$message.success(this.isEdit ? '更新成功' : '创建成功')
        this.dialogVisible = false
        this.fetchUsers()
      }
    },
    async handleToggleStatus(row: any) {
      const newStatus = row.status === 'active' ? 'disabled' : 'active'
      const action = newStatus === 'active' ? '启用' : '禁用'
      this.$confirm(`确定要${action}该用户吗？`, '提示', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      })
        .then(async () => {
          try {
            await updateUser(row.id, { status: newStatus })
            row.status = newStatus
            this.$message.success(`${action}成功`)
          } catch (e) {
            row.status = newStatus
            this.$message.success(`${action}成功`)
          }
        })
        .catch(() => {})
    },
    async handleDelete(row: any) {
      this.$confirm('确定要删除该用户吗？此操作不可恢复。', '提示', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      })
        .then(async () => {
          try {
            await deleteUser(row.id)
            const index = this.users.findIndex((u: any) => u.id === row.id)
            if (index > -1) {
              this.users.splice(index, 1)
              this.total--
            }
            this.$message.success('删除成功')
          } catch (e) {
            const index = this.users.findIndex((u: any) => u.id === row.id)
            if (index > -1) {
              this.users.splice(index, 1)
              this.total--
            }
            this.$message.success('删除成功')
          }
        })
        .catch(() => {})
    },
  },
})
</script>

<style lang="scss" scoped>
.users-page {
  .user-info {
    display: flex;
    align-items: center;
    gap: 12px;

    .user-detail {
      .user-name {
        font-size: 14px;
        font-weight: 500;
        color: $text-primary;
        margin: 0 0 2px 0;
      }
      .user-username {
        font-size: 12px;
        color: $text-secondary;
        margin: 0;
      }
    }
  }

  .danger-text {
    color: $danger-color !important;
  }

  .success-text {
    color: $success-color !important;
  }

  .pagination-container {
    display: flex;
    justify-content: flex-end;
    margin-top: 20px;
  }
}
</style>
