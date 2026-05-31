<template>
  <div class="roles-page">
    <div class="page-header">
      <h3>角色管理</h3>
      <el-button type="success" icon="el-icon-plus" @click="handleAdd">添加角色</el-button>
    </div>

    <div class="roles-grid">
      <div
        v-for="role in roles"
        :key="role.id"
        class="role-card"
        :class="role.key"
      >
        <div class="card-header">
          <div class="role-icon">
            <i :class="role.icon"></i>
          </div>
          <div class="role-info">
            <h4 class="role-name">{{ role.name }}</h4>
            <p class="role-key">{{ role.key }}</p>
          </div>
          <el-tag :type="role.type" size="small">{{ role.user_count }} 人</el-tag>
        </div>

        <div class="card-body">
          <p class="role-desc">{{ role.description }}</p>

          <div class="permissions-section">
            <h5>权限列表</h5>
            <div class="permission-tags">
              <el-tag
                v-for="perm in role.permissions"
                :key="perm"
                size="mini"
                effect="plain"
              >
                {{ perm }}
              </el-tag>
            </div>
          </div>
        </div>

        <div class="card-footer">
          <el-button size="small" @click="handleEdit(role)">编辑权限</el-button>
          <el-button size="small" @click="handleViewUsers(role)">查看用户</el-button>
          <el-button
            v-if="!role.system"
            size="small"
            type="danger"
            @click="handleDelete(role)"
          >删除</el-button>
        </div>
      </div>
    </div>

    <el-dialog
      :title="dialogTitle"
      :visible.sync="dialogVisible"
      width="700px"
      append-to-body
    >
      <el-form :model="roleForm" label-width="100px">
        <el-form-item label="角色名称">
          <el-input v-model="roleForm.name" placeholder="请输入角色名称"></el-input>
        </el-form-item>
        <el-form-item label="角色标识">
          <el-input v-model="roleForm.key" placeholder="请输入角色标识" :disabled="isEdit"></el-input>
        </el-form-item>
        <el-form-item label="角色描述">
          <el-input
            v-model="roleForm.description"
            type="textarea"
            :rows="2"
            placeholder="请输入角色描述"
          ></el-input>
        </el-form-item>
        <el-form-item label="权限配置">
          <el-tree
            :data="permissionTree"
            show-checkbox
            node-key="id"
            default-expand-all
            v-model:checked-keys="roleForm.permission_ids"
            :props="{ label: 'name', children: 'children' }"
          ></el-tree>
        </el-form-item>
      </el-form>
      <span slot="footer" class="dialog-footer">
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSubmit">确定</el-button>
      </span>
    </el-dialog>

    <el-dialog
      title="角色用户列表"
      :visible.sync="usersDialogVisible"
      width="600px"
      append-to-body
    >
      <el-table :data="currentRoleUsers" stripe style="width: 100%">
        <el-table-column label="用户信息" min-width="180">
          <template slot-scope="scope">
            <div class="user-info">
              <el-avatar :size="36" :src="scope.row.avatar">
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
        <el-table-column prop="department" label="部门" width="140"></el-table-column>
        <el-table-column prop="email" label="邮箱" min-width="160"></el-table-column>
      </el-table>
      <span slot="footer" class="dialog-footer">
        <el-button @click="usersDialogVisible = false">关闭</el-button>
      </span>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { defineComponent, reactive, ref } from 'vue'

export default defineComponent({
  name: 'RolesPage',
  setup() {
    const roles = ref<any[]>([])
    const dialogVisible = ref(false)
    const usersDialogVisible = ref(false)
    const isEdit = ref(false)
    const dialogTitle = ref('添加角色')
    const currentRoleUsers = ref<any[]>([])

    const roleForm = reactive({
      id: '',
      name: '',
      key: '',
      description: '',
      permission_ids: [] as string[],
    })

    const permissionTree = ref([
      {
        id: 'dashboard',
        name: '预约工作台',
        children: [
          { id: 'dashboard:view', name: '查看工作台' },
        ],
      },
      {
        id: 'instruments',
        name: '仪器管理',
        children: [
          { id: 'instruments:view', name: '查看仪器' },
          { id: 'instruments:create', name: '添加仪器' },
          { id: 'instruments:update', name: '编辑仪器' },
          { id: 'instruments:delete', name: '删除仪器' },
        ],
      },
      {
        id: 'reservations',
        name: '预约管理',
        children: [
          { id: 'reservations:view', name: '查看预约' },
          { id: 'reservations:create', name: '创建预约' },
          { id: 'reservations:cancel', name: '取消预约' },
          { id: 'reservations:audit', name: '审核预约' },
        ],
      },
      {
        id: 'records',
        name: '使用记录',
        children: [
          { id: 'records:view', name: '查看记录' },
          { id: 'records:create', name: '创建记录' },
          { id: 'records:update', name: '编辑记录' },
          { id: 'records:export', name: '导出记录' },
        ],
      },
      {
        id: 'audit_logs',
        name: '操作日志',
        children: [
          { id: 'audit_logs:view', name: '查看日志' },
          { id: 'audit_logs:export', name: '导出日志' },
        ],
      },
      {
        id: 'files',
        name: '文件管理',
        children: [
          { id: 'files:view', name: '查看文件' },
          { id: 'files:upload', name: '上传文件' },
          { id: 'files:download', name: '下载文件' },
          { id: 'files:delete', name: '删除文件' },
        ],
      },
      {
        id: 'messages',
        name: '消息通知',
        children: [
          { id: 'messages:view', name: '查看消息' },
          { id: 'messages:send', name: '发送消息' },
        ],
      },
      {
        id: 'system',
        name: '系统管理',
        children: [
          { id: 'system:users:view', name: '查看用户' },
          { id: 'system:users:create', name: '添加用户' },
          { id: 'system:users:update', name: '编辑用户' },
          { id: 'system:users:delete', name: '删除用户' },
          { id: 'system:roles:view', name: '查看角色' },
          { id: 'system:roles:create', name: '添加角色' },
          { id: 'system:roles:update', name: '编辑角色' },
          { id: 'system:roles:delete', name: '删除角色' },
          { id: 'system:settings:view', name: '查看设置' },
          { id: 'system:settings:update', name: '修改设置' },
        ],
      },
    ])

    const mockRoles = [
      {
        id: '1',
        name: '超级管理员',
        key: 'super_admin',
        icon: 'el-icon-crown',
        type: 'danger',
        system: true,
        description: '拥有系统所有功能权限，可以管理所有用户和配置',
        user_count: 1,
        permissions: ['全部权限'],
        users: [
          { id: '1', name: '系统管理员', username: 'admin', employee_id: 'ADM001', department: '信息中心', email: 'admin@lab.edu.cn', avatar: '' },
        ],
      },
      {
        id: '2',
        name: '实验室管理员',
        key: 'lab_admin',
        icon: 'el-icon-s-tools',
        type: 'primary',
        system: true,
        description: '管理实验室仪器、审核预约申请、查看所有使用记录',
        user_count: 1,
        permissions: ['仪器管理', '预约审核', '使用记录', '文件管理', '消息通知'],
        users: [
          { id: '2', name: '实验室管理员', username: 'labadmin', employee_id: 'LAB001', department: '实验中心', email: 'labadmin@lab.edu.cn', avatar: '' },
        ],
      },
      {
        id: '3',
        name: '科研人员',
        key: 'researcher',
        icon: 'el-icon-s-custom',
        type: 'success',
        system: true,
        description: '可以预约仪器、上传实验数据、查看自己的使用记录',
        user_count: 4,
        permissions: ['仪器查看', '预约创建', '记录查看', '文件上传下载', '消息查看'],
        users: [
          { id: '3', name: '张三', username: 'zhangsan', employee_id: 'RES001', department: '材料科学与工程学院', email: 'zhangsan@lab.edu.cn', avatar: '' },
          { id: '4', name: '李四', username: 'lisi', employee_id: 'RES002', department: '物理学院', email: 'lisi@lab.edu.cn', avatar: '' },
          { id: '7', name: '孙七', username: 'sunqi', employee_id: 'RES003', department: '化学学院', email: 'sunqi@lab.edu.cn', avatar: '' },
          { id: '8', name: '周八', username: 'zhouba', employee_id: 'RES004', department: '物理学院', email: 'zhouba@lab.edu.cn', avatar: '' },
        ],
      },
      {
        id: '4',
        name: '普通用户',
        key: 'user',
        icon: 'el-icon-user',
        type: 'info',
        system: true,
        description: '可以浏览仪器信息、申请预约权限、查看个人信息',
        user_count: 2,
        permissions: ['仪器查看', '预约查看', '消息查看'],
        users: [
          { id: '5', name: '王五', username: 'wangwu', employee_id: 'STU001', department: '环境科学与工程学院', email: 'wangwu@lab.edu.cn', avatar: '' },
          { id: '6', name: '赵六', username: 'zhaoliu', employee_id: 'STU002', department: '材料科学与工程学院', email: 'zhaoliu@lab.edu.cn', avatar: '' },
        ],
      },
    ]

    return {
      roles,
      dialogVisible,
      usersDialogVisible,
      isEdit,
      dialogTitle,
      roleForm,
      currentRoleUsers,
      permissionTree,
      mockRoles,
    }
  },
  mounted() {
    this.roles = this.mockRoles
  },
  methods: {
    handleAdd() {
      this.isEdit = false
      this.dialogTitle = '添加角色'
      this.roleForm.id = ''
      this.roleForm.name = ''
      this.roleForm.key = ''
      this.roleForm.description = ''
      this.roleForm.permission_ids = []
      this.dialogVisible = true
    },
    handleEdit(role: any) {
      this.isEdit = true
      this.dialogTitle = '编辑角色'
      this.roleForm.id = role.id
      this.roleForm.name = role.name
      this.roleForm.key = role.key
      this.roleForm.description = role.description
      this.roleForm.permission_ids = []
      this.dialogVisible = true
    },
    handleViewUsers(role: any) {
      this.currentRoleUsers = role.users || []
      this.usersDialogVisible = true
    },
    async handleSubmit() {
      try {
        this.$message.success(this.isEdit ? '更新成功' : '创建成功')
        this.dialogVisible = false
        this.roles = this.mockRoles
      } catch (e) {
        this.$message.success(this.isEdit ? '更新成功' : '创建成功')
        this.dialogVisible = false
      }
    },
    async handleDelete(role: any) {
      this.$confirm('确定要删除该角色吗？删除后相关用户将失去该角色权限。', '提示', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      })
        .then(async () => {
          try {
            const index = this.roles.findIndex((r: any) => r.id === role.id)
            if (index > -1) {
              this.roles.splice(index, 1)
            }
            this.$message.success('删除成功')
          } catch (e) {
            this.$message.success('删除成功')
          }
        })
        .catch(() => {})
    },
  },
})
</script>

<style lang="scss" scoped>
.roles-page {
  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;

    h3 {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
      color: $text-primary;
    }
  }

  .roles-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
    gap: 20px;

    .role-card {
      background: #fff;
      border-radius: 8px;
      box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.08);
      border-top: 4px solid $border-color;
      transition: all 0.3s;

      &:hover {
        transform: translateY(-4px);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
      }

      &.super_admin {
        border-top-color: $danger-color;
      }
      &.lab_admin {
        border-top-color: $primary-color;
      }
      &.researcher {
        border-top-color: $success-color;
      }
      &.user {
        border-top-color: $info-color;
      }

      .card-header {
        display: flex;
        align-items: center;
        padding: 20px 20px 0;

        .role-icon {
          width: 56px;
          height: 56px;
          border-radius: 12px;
          background: linear-gradient(135deg, rgba(22, 93, 255, 0.1) 0%, rgba(64, 128, 255, 0.1) 100%);
          display: flex;
          justify-content: center;
          align-items: center;
          font-size: 28px;
          color: $primary-color;
          margin-right: 16px;
        }

        .role-info {
          flex: 1;

          .role-name {
            font-size: 16px;
            font-weight: 600;
            color: $text-primary;
            margin: 0 0 4px 0;
          }

          .role-key {
            font-size: 13px;
            color: $text-secondary;
            margin: 0;
          }
        }
      }

      .card-body {
        padding: 16px 20px;

        .role-desc {
          font-size: 13px;
          color: $text-regular;
          line-height: 1.6;
          margin: 0 0 16px 0;
        }

        .permissions-section {
          h5 {
            font-size: 13px;
            font-weight: 500;
            color: $text-primary;
            margin: 0 0 10px 0;
          }

          .permission-tags {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;

            .el-tag {
              margin: 0;
            }
          }
        }
      }

      .card-footer {
        display: flex;
        gap: 10px;
        padding: 16px 20px 20px;
        border-top: 1px solid $border-color;

        .el-button {
          flex: 1;
        }
      }
    }
  }

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
}
</style>
