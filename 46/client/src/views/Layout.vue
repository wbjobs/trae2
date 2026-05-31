<template>
  <el-container class="layout-container">
    <el-aside width="220px" class="aside">
      <div class="logo">
        <el-icon :size="28" color="#409eff"><Crop /></el-icon>
        <span class="logo-text">种质资源圃平台</span>
      </div>
      <el-menu
        :default-active="activeMenu"
        class="menu"
        router
        background-color="#001529"
        text-color="#bfbfbf"
        active-text-color="#409eff"
      >
        <el-menu-item index="/dashboard">
          <el-icon><DataAnalysis /></el-icon>
          <span>数据总览</span>
        </el-menu-item>
        <el-menu-item index="/germplasm">
          <el-icon><Collection /></el-icon>
          <span>种质资源管理</span>
        </el-menu-item>
        <el-menu-item index="/germplasm/new">
          <el-icon><Plus /></el-icon>
          <span>登记种质资源</span>
        </el-menu-item>
        <el-menu-item index="/trait">
          <el-icon><Document /></el-icon>
          <span>性状观测记录</span>
        </el-menu-item>
        <el-menu-item index="/trait/new">
          <el-icon><EditPen /></el-icon>
          <span>新增性状记录</span>
        </el-menu-item>
        <el-menu-item index="/trait/analysis">
          <el-icon><TrendCharts /></el-icon>
          <span>性状年度分析</span>
        </el-menu-item>
        <el-menu-item index="/distribution">
          <el-icon><Location /></el-icon>
          <span>资源分布热力图</span>
        </el-menu-item>
        <el-menu-item index="/classification">
          <el-icon><Menu /></el-icon>
          <span>资源分类管理</span>
        </el-menu-item>
        <el-menu-item index="/image">
          <el-icon><Picture /></el-icon>
          <span>田间影像管理</span>
        </el-menu-item>
      </el-menu>
    </el-aside>
    <el-container>
      <el-header class="header">
        <el-breadcrumb separator="/">
          <el-breadcrumb-item :to="{ path: '/dashboard' }">首页</el-breadcrumb-item>
          <el-breadcrumb-item v-if="route.meta.title">{{ route.meta.title }}</el-breadcrumb-item>
        </el-breadcrumb>
        <div class="header-right">
          <el-tooltip content="刷新" placement="bottom">
            <el-icon class="header-icon" @click="handleRefresh"><Refresh /></el-icon>
          </el-tooltip>
          <el-tag type="success" effect="light">服务正常</el-tag>
        </div>
      </el-header>
      <el-main class="main">
        <router-view v-slot="{ Component }">
          <component :is="Component" />
        </router-view>
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

const activeMenu = computed(() => {
  const path = route.path
  if (path.startsWith('/germplasm')) return '/germplasm'
  if (path.startsWith('/trait')) return '/trait'
  if (path.startsWith('/classification')) return '/classification'
  if (path.startsWith('/image')) return '/image'
  return path
})

function handleRefresh() {
  router.go(0)
}
</script>

<style scoped>
.layout-container {
  height: 100vh;
}

.aside {
  background-color: #001529;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.logo {
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: #002140;
  color: #fff;
  font-size: 16px;
  font-weight: 600;
}

.logo-text {
  background: linear-gradient(90deg, #409eff, #67c23a);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  font-size: 15px;
}

.menu {
  flex: 1;
  border-right: none;
}

.menu :deep(.el-menu-item) {
  height: 50px;
  line-height: 50px;
}

.menu :deep(.el-menu-item:hover) {
  background-color: #000c17 !important;
}

.menu :deep(.el-menu-item.is-active) {
  background-color: #000c17 !important;
  border-right: 3px solid #409eff;
}

.header {
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #ebeef5;
  padding: 0 20px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.header-icon {
  font-size: 20px;
  cursor: pointer;
  color: #606266;
}

.header-icon:hover {
  color: #409eff;
}

.main {
  padding: 0;
  background: #f0f2f5;
  overflow: hidden;
}
</style>
