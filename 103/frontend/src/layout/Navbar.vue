<template>
  <div class="navbar">
    <div class="navbar-left">
      <i class="hamburger el-icon-s-fold" @click="toggleSideBar" :class="{ 'el-icon-s-unfold': !sidebar.opened }"></i>
      <el-breadcrumb separator="/">
        <el-breadcrumb-item
          v-for="(item, index) in breadcrumbList"
          :key="index"
          :to="{ path: item.path }"
        >
          {{ item.meta.title }}
        </el-breadcrumb-item>
      </el-breadcrumb>
    </div>
    <div class="navbar-right">
      <el-dropdown trigger="click" @command="handleMessageCommand">
        <div class="notification-wrapper">
          <i class="el-icon-bell"></i>
          <el-badge :value="unreadCount" :hidden="unreadCount === 0" class="notification-badge"></el-badge>
        </div>
        <el-dropdown-menu slot="dropdown">
          <el-dropdown-item command="all">
            消息中心
            <span class="count">共 {{ unreadCount }} 条未读</span>
          </el-dropdown-item>
          <el-dropdown-item divided command="read-all">全部标记已读</el-dropdown-item>
        </el-dropdown-menu>
      </el-dropdown>
      <el-dropdown trigger="click" @command="handleUserCommand">
        <div class="user-info">
          <el-avatar :size="32" :src="userInfo?.avatar || ''">
            {{ userInfo?.real_name?.charAt(0) || 'U' }}
          </el-avatar>
          <span class="username">{{ userInfo?.real_name || '用户' }}</span>
          <i class="el-icon-caret-bottom"></i>
        </div>
        <el-dropdown-menu slot="dropdown">
          <el-dropdown-item command="profile">个人中心</el-dropdown-item>
          <el-dropdown-item divided command="logout">退出登录</el-dropdown-item>
        </el-dropdown-menu>
      </el-dropdown>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, defineComponent, onMounted, ref } from 'vue'
import { mapGetters } from 'vuex'
import { getUnreadCount, markAllAsRead } from '@/api/notification'

export default defineComponent({
  name: 'Navbar',
  data() {
    return {
      unreadCount: 0,
    }
  },
  computed: {
    ...mapGetters(['sidebar', 'userInfo']),
    breadcrumbList() {
      return this.$route.matched.filter((item) => item.meta && item.meta.title)
    },
  },
  mounted() {
    this.fetchUnreadCount()
    this.timer = setInterval(() => {
      this.fetchUnreadCount()
    }, 60000)
  },
  beforeDestroy() {
    if (this.timer) {
      clearInterval(this.timer)
    }
  },
  methods: {
    ...mapActions(['user/logout']),
    toggleSideBar() {
      this.$store.dispatch('app/toggleSideBar')
    },
    async fetchUnreadCount() {
      try {
        const res: any = await getUnreadCount()
        this.unreadCount = res.data?.count || 0
      } catch (e) {
        console.error(e)
      }
    },
    async handleMessageCommand(command: string) {
      if (command === 'all') {
        this.$router.push('/messages')
      } else if (command === 'read-all') {
        await markAllAsRead()
        this.unreadCount = 0
        this.$message.success('全部标记已读')
      }
    },
    async handleUserCommand(command: string) {
      if (command === 'profile') {
        this.$message.info('个人中心开发中')
      } else if (command === 'logout') {
        this.$confirm('确定要退出登录吗？', '提示', {
          confirmButtonText: '确定',
          cancelButtonText: '取消',
          type: 'warning',
        })
          .then(async () => {
            await this.$store.dispatch('user/logout')
            this.$router.push('/login')
            this.$message.success('已退出登录')
          })
          .catch(() => {})
      }
    },
  },
})
</script>

<style lang="scss" scoped>
.navbar {
  height: $header-height;
  background: #fff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 20px;
  position: relative;
  z-index: 10;

  .navbar-left {
    display: flex;
    align-items: center;
    gap: 20px;

    .hamburger {
      font-size: 20px;
      cursor: pointer;
      color: $text-regular;
      transition: color $transition-duration;

      &:hover {
        color: $primary-color;
      }
    }
  }

  .navbar-right {
    display: flex;
    align-items: center;
    gap: 20px;

    .notification-wrapper {
      position: relative;
      cursor: pointer;
      font-size: 18px;
      color: $text-regular;
      transition: color $transition-duration;

      &:hover {
        color: $primary-color;
      }

      .notification-badge {
        position: absolute;
        top: -8px;
        right: -8px;
      }
    }

    .user-info {
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;

      .username {
        color: $text-regular;
        font-size: 14px;
      }

      i {
        color: $text-secondary;
        font-size: 12px;
      }
    }
  }
}

.count {
  margin-left: 10px;
  color: $text-secondary;
  font-size: 12px;
}
</style>
