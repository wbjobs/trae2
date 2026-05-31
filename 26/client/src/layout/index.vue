<template>
  <div class="layout-container">
    <el-container>
      <el-aside width="220px" class="sidebar">
        <div class="logo">
          <el-icon size="32" color="#409eff"><Collection /></el-icon>
          <span class="logo-text">非遗溯源平台</span>
        </div>
        <el-menu
          :default-active="activeMenu"
          class="menu"
          router
          background-color="#001529"
          text-color="#fff"
          active-text-color="#409eff"
        >
          <template v-for="item in menuItems" :key="item.path">
            <el-menu-item v-if="!item.hidden" :index="item.path">
              <el-icon><component :is="item.icon" /></el-icon>
              <span>{{ item.title }}</span>
            </el-menu-item>
          </template>
        </el-menu>
      </el-aside>

      <el-container>
        <el-header class="header">
          <div class="header-left">
            <el-breadcrumb separator="/">
              <el-breadcrumb-item v-for="(item, index) in breadcrumbs" :key="index">
                {{ item }}
              </el-breadcrumb-item>
            </el-breadcrumb>
          </div>
          <div class="header-right">
            <el-dropdown @command="handleCommand">
              <span class="user-info">
                <el-avatar :size="32" :src="userStore.userInfo?.avatar">
                  {{ userStore.userInfo?.realName?.charAt(0) }}
                </el-avatar>
                <span class="username">{{ userStore.userInfo?.realName }}</span>
                <el-tag v-if="userStore.userInfo?.verified" type="success" size="small">已核验</el-tag>
                <el-tag v-else type="warning" size="small">待核验</el-tag>
                <el-icon><CaretBottom /></el-icon>
              </span>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="profile">
                    <el-icon><User /></el-icon>个人中心
                  </el-dropdown-item>
                  <el-dropdown-item command="verification" v-if="!userStore.userInfo?.verified">
                    <el-icon><CircleCheck /></el-icon>身份核验
                  </el-dropdown-item>
                  <el-dropdown-item divided command="logout">
                    <el-icon><SwitchButton /></el-icon>退出登录
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </el-header>

        <el-main class="main">
          <router-view v-slot="{ Component }">
            <transition name="fade" mode="out-in">
              <component :is="Component" />
            </transition>
          </router-view>
        </el-main>
      </el-container>
    </el-container>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import { useUserStore } from '@/store/user'
import {
  Collection, Odometer, Files, Connection, Goods, Van, EditPen, User,
  CaretBottom, SwitchButton, CircleCheck, Setting
} from '@element-plus/icons-vue'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

const menuItems = computed(() => {
  return router.options.routes
    .find(r => r.path === '/')?.children
    ?.filter(r => r.meta && !r.meta.hidden) || []
})

const activeMenu = computed(() => route.path)

const breadcrumbs = computed(() => {
  const crumbs = ['首页']
  if (route.meta.title) crumbs.push(route.meta.title)
  return crumbs
})

const handleCommand = async (command) => {
  if (command === 'logout') {
    ElMessageBox.confirm('确定要退出登录吗？', '提示', { type: 'warning' })
      .then(async () => {
        await userStore.logout()
        router.push('/login')
      })
      .catch(() => {})
  } else if (command === 'profile') {
    router.push('/profile')
  } else if (command === 'verification') {
    router.push('/verification')
  }
}
</script>

<style lang="scss" scoped>
.layout-container {
  height: 100vh;
}

.sidebar {
  background: #001529;
  display: flex;
  flex-direction: column;

  .logo {
    height: 60px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    color: #fff;
    font-size: 18px;
    font-weight: 600;
    border-bottom: 1px solid #1f2d3d;

    .logo-text {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
  }

  .menu {
    flex: 1;
    border-right: none;
  }
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #fff;
  border-bottom: 1px solid $border-color;
  padding: 0 20px;

  .header-right {
    .user-info {
      display: flex;
      align-items: center;
      gap: 10px;
      cursor: pointer;

      .username {
        color: $text-color;
      }
    }
  }
}

.main {
  background: $bg-color;
  padding: 0;
  overflow-y: auto;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
