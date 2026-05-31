<template>
  <el-container class="layout-container">
    <el-aside width="240px" class="sidebar">
      <div class="logo">
        <el-icon :size="28" color="#409eff"><Connection /></el-icon>
        <span class="title">信令监控系统</span>
      </div>
      <el-menu
        :default-active="activeMenu"
        class="sidebar-menu"
        background-color="#001529"
        text-color="#b9c0cc"
        active-text-color="#409eff"
        router
      >
        <el-menu-item index="/dashboard">
          <el-icon><Monitor /></el-icon>
          <span>实时监控面板</span>
        </el-menu-item>
        <el-menu-item index="/trace">
          <el-icon><Search /></el-icon>
          <span>信令溯源查询</span>
        </el-menu-item>
        <el-menu-item index="/devices">
          <el-icon><Cpu /></el-icon>
          <span>设备管理</span>
        </el-menu-item>
        <el-menu-item index="/analysis">
          <el-icon><DataAnalysis /></el-icon>
          <span>深度分析</span>
        </el-menu-item>
        <el-menu-item index="/alerts">
          <el-icon><Bell /></el-icon>
          <span>告警中心</span>
          <el-badge v-if="alertsStore.criticalCount + alertsStore.errorCount > 0"
            :value="alertsStore.criticalCount + alertsStore.errorCount"
            class="alert-badge" />
        </el-menu-item>
      </el-menu>
    </el-aside>
    <el-container>
      <el-header class="header">
        <div class="header-left">
          <el-breadcrumb separator="/">
            <el-breadcrumb-item :to="{ path: '/' }">首页</el-breadcrumb-item>
            <el-breadcrumb-item>{{ currentPageTitle }}</el-breadcrumb-item>
          </el-breadcrumb>
        </div>
        <div class="header-right">
          <div class="connection-status" :class="{ connected: isConnected }">
            <span class="status-dot"></span>
            <span>{{ isConnected ? '实时连接中' : '已断开' }}</span>
          </div>
          <el-dropdown>
            <span class="user-info">
              <el-avatar :size="32" icon="UserFilled" />
              <span class="username">管理员</span>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item>个人设置</el-dropdown-item>
                <el-dropdown-item divided>退出登录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>
      <el-main class="main-content">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useMetricsStore } from '@/stores/metrics'
import { Monitor, Search, Cpu, DataAnalysis, Connection, Bell } from '@element-plus/icons-vue'
import { useAlertsStore } from '@/stores/alerts'

const route = useRoute()
const metricsStore = useMetricsStore()
const alertsStore = useAlertsStore()

const activeMenu = computed(() => route.path)
const currentPageTitle = computed(() => route.meta.title as string)
const isConnected = computed(() => metricsStore.isConnected)
</script>

<style scoped>
.layout-container {
  height: 100vh;
  background-color: #0a192f;
}

.sidebar {
  background-color: #001529;
  border-right: 1px solid #1f2d3d;
}

.logo {
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  border-bottom: 1px solid #1f2d3d;
}

.logo .title {
  color: #fff;
  font-size: 16px;
  font-weight: 600;
}

.sidebar-menu {
  border-right: none;
  height: calc(100vh - 64px);
}

.sidebar-menu .el-menu-item {
  height: 50px;
  line-height: 50px;
}

.header {
  background-color: #001529;
  border-bottom: 1px solid #1f2d3d;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
}

.header-left :deep(.el-breadcrumb__inner) {
  color: #b9c0cc;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 24px;
}

.connection-status {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #f56c6c;
  font-size: 13px;
}

.connection-status.connected {
  color: #67c23a;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: currentColor;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.user-info {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
}

.username {
  color: #b9c0cc;
  font-size: 14px;
}

.main-content {
  background-color: #0a192f;
  padding: 20px;
  overflow-y: auto;
}

.main-content::-webkit-scrollbar {
  width: 6px;
}

.main-content::-webkit-scrollbar-thumb {
  background-color: #1f2d3d;
  border-radius: 3px;
}

.alert-badge {
  margin-left: 8px;
}

.alert-badge :deep(.el-badge__content) {
  font-size: 10px;
}
</style>
