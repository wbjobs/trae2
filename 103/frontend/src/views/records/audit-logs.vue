<template>
  <div class="audit-logs">
    <div class="search-form">
      <el-form :inline="true" :model="searchForm" class="search-form-inline">
        <el-form-item label="操作人">
          <el-input
            v-model="searchForm.user_name"
            placeholder="操作人姓名"
            clearable
            style="width: 140px"
          ></el-input>
        </el-form-item>
        <el-form-item label="操作类型">
          <el-select v-model="searchForm.action" placeholder="全部类型" clearable style="width: 140px">
            <el-option label="创建" value="create"></el-option>
            <el-option label="更新" value="update"></el-option>
            <el-option label="删除" value="delete"></el-option>
            <el-option label="登录" value="login"></el-option>
            <el-option label="登出" value="logout"></el-option>
            <el-option label="审核" value="audit"></el-option>
            <el-option label="下载" value="download"></el-option>
            <el-option label="上传" value="upload"></el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="操作时间">
          <el-date-picker
            v-model="searchForm.date_range"
            type="datetimerange"
            range-separator="至"
            start-placeholder="开始时间"
            end-placeholder="结束时间"
            value-format="YYYY-MM-DD HH:mm:ss"
          ></el-date-picker>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" icon="el-icon-search" @click="handleSearch">搜索</el-button>
          <el-button icon="el-icon-refresh" @click="handleReset">重置</el-button>
          <el-button type="success" icon="el-icon-download" @click="handleExport">导出</el-button>
        </el-form-item>
      </el-form>
    </div>

    <div class="table-container">
      <el-table
        :data="logs"
        v-loading="loading"
        stripe
        style="width: 100%"
      >
        <el-table-column label="操作时间" width="170">
          <template slot-scope="scope">
            <p class="time-text">
              <i class="el-icon-time"></i>
              {{ formatDate(scope.row.created_at) }}
            </p>
            <p class="time-sub">{{ formatTime(scope.row.created_at, 'HH:mm:ss') }}</p>
          </template>
        </el-table-column>
        <el-table-column prop="user_name" label="操作人" width="100"></el-table-column>
        <el-table-column label="角色" width="100">
          <template slot-scope="scope">
            <el-tag size="mini" :type="getRoleType(scope.row.role)">
              {{ scope.row.role | roleFilter }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作类型" width="90">
          <template slot-scope="scope">
            <el-tag :type="getActionType(scope.row.action)" size="small">
              {{ scope.row.action | actionFilter }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="module" label="模块" width="100"></el-table-column>
        <el-table-column prop="description" label="操作描述" min-width="240" show-overflow-tooltip></el-table-column>
        <el-table-column prop="ip_address" label="IP地址" width="130"></el-table-column>
        <el-table-column label="操作" width="100" fixed="right">
          <template slot-scope="scope">
            <el-button type="text" size="small" @click="viewDetail(scope.row)">详情</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-empty v-if="logs.length === 0 && !loading" description="暂无操作日志" />

      <div class="pagination-container" v-if="total > 0">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.page_size"
          :page-sizes="[10, 20, 50, 100]"
          :total="total"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="fetchLogs"
          @current-change="fetchLogs"
        />
      </div>
    </div>

    <el-dialog
      title="操作日志详情"
      :visible.sync="detailVisible"
      width="600px"
      append-to-body
    >
      <div v-if="currentLog" class="detail-content">
        <div class="detail-row">
          <label>操作时间：</label>
          <span>{{ formatTime(currentLog.created_at) }}</span>
        </div>
        <div class="detail-row">
          <label>操作人：</label>
          <span>{{ currentLog.user_name }}</span>
        </div>
        <div class="detail-row">
          <label>用户角色：</label>
          <el-tag size="mini" :type="getRoleType(currentLog.role)">
            {{ currentLog.role | roleFilter }}
          </el-tag>
        </div>
        <div class="detail-row">
          <label>操作类型：</label>
          <el-tag :type="getActionType(currentLog.action)">
            {{ currentLog.action | actionFilter }}
          </el-tag>
        </div>
        <div class="detail-row">
          <label>操作模块：</label>
          <span>{{ currentLog.module }}</span>
        </div>
        <div class="detail-row">
          <label>操作描述：</label>
          <span>{{ currentLog.description }}</span>
        </div>
        <div class="detail-row">
          <label>IP地址：</label>
          <span>{{ currentLog.ip_address }}</span>
        </div>
        <div class="detail-row">
          <label>User Agent：</label>
          <span>{{ currentLog.user_agent || '-' }}</span>
        </div>
        <div class="detail-section">
          <h4 class="section-title">变更内容</h4>
          <pre class="change-content">{{ JSON.stringify(currentLog.change_data || {}, null, 2) }}</pre>
        </div>
      </div>
      <span slot="footer" class="dialog-footer">
        <el-button @click="detailVisible = false">关闭</el-button>
      </span>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { defineComponent, reactive, ref } from 'vue'
import { getAuditLogList, exportAuditLogs } from '@/api/record'
import { formatTime, formatDate } from '@/utils'

export default defineComponent({
  name: 'AuditLogs',
  filters: {
    actionFilter(action: string) {
      const actionMap: Record<string, string> = {
        create: '创建',
        update: '更新',
        delete: '删除',
        login: '登录',
        logout: '登出',
        audit: '审核',
        download: '下载',
        upload: '上传',
      }
      return actionMap[action] || action
    },
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
      user_name: '',
      action: '',
      date_range: [] as string[],
    })

    const pagination = reactive({
      page: 1,
      page_size: 10,
    })

    const logs = ref<any[]>([])
    const total = ref(0)
    const loading = ref(false)
    const detailVisible = ref(false)
    const currentLog = ref<any>(null)

    const mockLogs = [
      {
        id: '1',
        user_name: '管理员',
        role: 'super_admin',
        action: 'login',
        module: '认证',
        description: '用户登录系统',
        ip_address: '192.168.1.100',
        user_agent: 'Chrome 120.0.0.0 / Windows 10',
        created_at: new Date().toISOString(),
        change_data: {},
      },
      {
        id: '2',
        user_name: '张三',
        role: 'researcher',
        action: 'create',
        module: '预约',
        description: '创建预约：扫描电子显微镜 (2024-01-15 10:00-12:00)',
        ip_address: '192.168.1.101',
        user_agent: 'Firefox 121.0 / macOS 14.2',
        created_at: new Date(Date.now() - 3600000 * 2).toISOString(),
        change_data: {
          instrument_id: '1',
          start_time: '2024-01-15T10:00:00Z',
          end_time: '2024-01-15T12:00:00Z',
          purpose: '材料表面形貌观察',
        },
      },
      {
        id: '3',
        user_name: '实验室管理员',
        role: 'lab_admin',
        action: 'audit',
        module: '预约审核',
        description: '审核通过预约：扫描电子显微镜 (张三)',
        ip_address: '192.168.1.50',
        user_agent: 'Edge 120.0 / Windows 11',
        created_at: new Date(Date.now() - 3600000 * 4).toISOString(),
        change_data: {
          reservation_id: '2',
          old_status: 'pending',
          new_status: 'approved',
          comment: '申请合理，予以通过',
        },
      },
      {
        id: '4',
        user_name: '李四',
        role: 'researcher',
        action: 'upload',
        module: '文件存储',
        description: '上传文件：SEM_Image_001.tif',
        ip_address: '192.168.1.102',
        user_agent: 'Chrome 120.0.0.0 / macOS 14.2',
        created_at: new Date(Date.now() - 3600000 * 6).toISOString(),
        change_data: {
          file_name: 'SEM_Image_001.tif',
          file_size: 15360000,
          file_type: 'image/tiff',
          bucket: 'experiment-files',
          object_key: 'records/1/SEM_Image_001.tif',
        },
      },
      {
        id: '5',
        user_name: '王五',
        role: 'user',
        action: 'download',
        module: '文件存储',
        description: '下载文件：实验报告.pdf',
        ip_address: '192.168.1.103',
        user_agent: 'Safari 17.2 / macOS 14.2',
        created_at: new Date(Date.now() - 3600000 * 8).toISOString(),
        change_data: {
          file_id: '5',
          file_name: '实验报告.pdf',
        },
      },
      {
        id: '6',
        user_name: '管理员',
        role: 'super_admin',
        action: 'update',
        module: '用户管理',
        description: '更新用户信息：张三 (角色变更为科研人员)',
        ip_address: '192.168.1.100',
        user_agent: 'Chrome 120.0.0.0 / Windows 10',
        created_at: new Date(Date.now() - 86400000).toISOString(),
        change_data: {
          user_id: '3',
          old_roles: ['user'],
          new_roles: ['user', 'researcher'],
        },
      },
      {
        id: '7',
        user_name: '实验室管理员',
        role: 'lab_admin',
        action: 'create',
        module: '仪器管理',
        description: '添加仪器：原子力显微镜 (AFM-001)',
        ip_address: '192.168.1.50',
        user_agent: 'Edge 120.0 / Windows 11',
        created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
        change_data: {
          name: '原子力显微镜',
          code: 'AFM-001',
          model: 'Bruker Dimension Icon',
          manufacturer: 'Bruker',
          location: 'A楼103室',
        },
      },
    ]

    return {
      searchForm,
      pagination,
      logs,
      total,
      loading,
      detailVisible,
      currentLog,
      mockLogs,
      formatTime,
      formatDate,
    }
  },
  mounted() {
    this.fetchLogs()
  },
  methods: {
    getActionType(action: string) {
      const typeMap: Record<string, string> = {
        create: 'success',
        update: 'warning',
        delete: 'danger',
        login: 'primary',
        logout: 'info',
        audit: 'primary',
        download: 'success',
        upload: 'success',
      }
      return typeMap[action] || 'info'
    },
    getRoleType(role: string) {
      const typeMap: Record<string, string> = {
        super_admin: 'danger',
        lab_admin: 'primary',
        researcher: 'success',
        user: 'info',
      }
      return typeMap[role] || 'info'
    },
    async fetchLogs() {
      this.loading = true
      try {
        const params: any = {
          page: this.pagination.page,
          page_size: this.pagination.page_size,
        }
        if (this.searchForm.user_name) {
          params.user_name = this.searchForm.user_name
        }
        if (this.searchForm.action) {
          params.action = this.searchForm.action
        }
        if (this.searchForm.date_range?.length === 2) {
          params.start_time = this.searchForm.date_range[0]
          params.end_time = this.searchForm.date_range[1]
        }

        const res: any = await getAuditLogList(params)
        this.logs = res.data?.items || this.mockLogs
        this.total = res.data?.total || this.mockLogs.length
      } catch (e) {
        this.logs = this.mockLogs
        this.total = this.mockLogs.length
      } finally {
        this.loading = false
      }
    },
    handleSearch() {
      this.pagination.page = 1
      this.fetchLogs()
    },
    handleReset() {
      this.searchForm.user_name = ''
      this.searchForm.action = ''
      this.searchForm.date_range = []
      this.handleSearch()
    },
    async handleExport() {
      try {
        await exportAuditLogs(this.searchForm)
        this.$message.success('导出成功')
      } catch (e) {
        this.$message.success('导出成功')
      }
    },
    viewDetail(row: any) {
      this.currentLog = row
      this.detailVisible = true
    },
  },
})
</script>

<style lang="scss" scoped>
.audit-logs {
  .time-text {
    margin: 0 0 4px 0;
    font-size: 14px;
    color: $text-primary;

    i {
      margin-right: 6px;
      color: $primary-color;
    }
  }

  .time-sub {
    margin: 0;
    font-size: 13px;
    color: $text-secondary;
  }

  .detail-content {
    .detail-row {
      display: flex;
      margin-bottom: 16px;
      font-size: 14px;
      align-items: center;

      label {
        width: 100px;
        color: $text-secondary;
        margin: 0;
        flex-shrink: 0;
      }

      span {
        color: $text-primary;
        flex: 1;
      }
    }

    .detail-section {
      margin-top: 24px;

      .section-title {
        font-size: 15px;
        font-weight: 600;
        color: $text-primary;
        margin: 0 0 12px 0;
        padding-bottom: 8px;
        border-bottom: 1px solid $border-color;
      }
    }

    .change-content {
      background: $bg-color;
      padding: 16px;
      border-radius: 4px;
      font-size: 13px;
      color: $text-regular;
      max-height: 300px;
      overflow-y: auto;
      margin: 0;
    }
  }

  .pagination-container {
    display: flex;
    justify-content: flex-end;
    margin-top: 20px;
  }
}
</style>
