<template>
  <div class="reports-page">
    <div class="page-header">
      <h2>📊 报表管理模块</h2>
      <p>生成并导出各类光伏电站运维分析报表</p>
    </div>

    <div class="report-tabs">
      <el-tabs v-model="activeTab" type="card">
        <el-tab-pane label="日报表" name="daily">
          <ReportGenerator type="daily" />
        </el-tab-pane>
        <el-tab-pane label="周报表" name="weekly">
          <ReportGenerator type="weekly" />
        </el-tab-pane>
        <el-tab-pane label="月报表" name="monthly">
          <ReportGenerator type="monthly" />
        </el-tab-pane>
        <el-tab-pane label="自定义报表" name="custom">
          <CustomReport />
        </el-tab-pane>
      </el-tabs>
    </div>

    <div class="report-history card">
      <div class="card-header">
        <span class="card-title">报表历史记录</span>
      </div>
      <div class="card-body">
        <el-table :data="reportHistory" stripe>
          <el-table-column prop="name" label="报表名称" min-width="200" />
          <el-table-column prop="type" label="类型" width="100" />
          <el-table-column prop="period" label="统计周期" width="180" />
          <el-table-column prop="createTime" label="生成时间" width="180" />
          <el-table-column prop="size" label="大小" width="100" />
          <el-table-column prop="status" label="状态" width="100">
            <template #default="{ row }">
              <el-tag :type="row.status === '已生成' ? 'success' : 'warning'" size="small">
                {{ row.status }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="150" fixed="right">
            <template #default="{ row }">
              <el-button type="primary" size="small" @click="downloadReport(row)">
                下载
              </el-button>
              <el-button type="danger" size="small" @click="deleteReport(row)">
                删除
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import ReportGenerator from '@/components/ReportGenerator.vue'
import CustomReport from '@/components/CustomReport.vue'

const activeTab = ref('daily')

const reportHistory = ref([
  { name: '光伏电站A_20240115日报表.xlsx', type: '日报表', period: '2024-01-15', createTime: '2024-01-15 23:55', size: '2.3MB', status: '已生成' },
  { name: '光伏电站A_2024W02周报表.xlsx', type: '周报表', period: '2024-01-08~2024-01-14', createTime: '2024-01-14 23:55', size: '5.1MB', status: '已生成' },
  { name: '全电站_202312月报表.xlsx', type: '月报表', period: '2023-12', createTime: '2024-01-01 00:05', size: '12.8MB', status: '已生成' },
  { name: '故障分析报表.xlsx', type: '自定义', period: '2024-01-01~2024-01-15', createTime: '2024-01-15 10:30', size: '1.5MB', status: '已生成' }
])

const downloadReport = (row) => {
  ElMessage.info(`正在下载: ${row.name}`)
  setTimeout(() => {
    const blob = new Blob(['报表内容模拟'], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = row.name
    link.click()
    URL.revokeObjectURL(url)
    ElMessage.success('下载成功！')
  }, 1000)
}

const deleteReport = (row) => {
  ElMessageBox.confirm(`确定要删除报表 "${row.name}" 吗？`, '删除确认', {
    type: 'warning'
  }).then(() => {
    const index = reportHistory.value.findIndex(r => r.name === row.name)
    if (index > -1) {
      reportHistory.value.splice(index, 1)
    }
    ElMessage.success('删除成功！')
  }).catch(() => {})
}
</script>

<style scoped lang="scss">
.reports-page {
  width: 100%;
  min-height: 100vh;
  padding: 20px;
  background: linear-gradient(180deg, #0a1628 0%, #0f2644 100%);
}

.page-header {
  margin-bottom: 20px;
  
  h2 {
    font-size: 24px;
    color: #fff;
    margin-bottom: 8px;
  }
  
  p {
    color: rgba(255, 255, 255, 0.6);
  }
}

.report-tabs {
  margin-bottom: 20px;
  
  :deep(.el-tabs__item) {
    color: rgba(255, 255, 255, 0.7);
  }
  
  :deep(.el-tabs__item.is-active) {
    color: #409eff;
  }
  
  :deep(.el-tabs__nav-wrap::after) {
    background-color: rgba(64, 158, 255, 0.2);
  }
  
  :deep(.el-tabs--card > .el-tabs__header .el-tabs__item) {
    background: rgba(15, 38, 68, 0.5);
    border: 1px solid rgba(64, 158, 255, 0.2);
  }
  
  :deep(.el-tabs--card > .el-tabs__header .el-tabs__item.is-active) {
    background: rgba(64, 158, 255, 0.2);
    border-bottom-color: transparent;
  }
}

.report-history {
  margin-top: 20px;
}

:deep(.el-table) {
  background: transparent;

  th {
    background: rgba(64, 158, 255, 0.1) !important;
    color: #409eff;
    border-bottom: 1px solid rgba(64, 158, 255, 0.3);
  }

  td {
    border-bottom: 1px solid rgba(64, 158, 255, 0.1);
    color: rgba(255, 255, 255, 0.8);
  }

  .el-table__row:hover > td {
    background: rgba(64, 158, 255, 0.1) !important;
  }

  .el-table__row--striped td {
    background: rgba(64, 158, 255, 0.05);
  }
}
</style>
