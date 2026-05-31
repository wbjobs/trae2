<template>
  <div class="sidebar">
    <div class="logo">
      <h2 v-show="sidebar.opened">实验室预约系统</h2>
      <h2 v-show="!sidebar.opened">Lab</h2>
    </div>
    <el-scrollbar wrap-class="scrollbar-wrapper">
      <el-menu
        :default-active="$route.path"
        :collapse="!sidebar.opened"
        :unique-opened="true"
        router
        background-color="#001529"
        text-color="#ffffff"
        active-text-color="#165dff"
      >
        <template v-for="route in permission_routes" v-if="!route.hidden">
          <el-menu-item
            v-if="!route.children || route.children.length === 1"
            :key="route.path + (route.children ? route.children[0].path : '')"
            :index="resolvePath(route.path, route.children ? route.children[0].path : '')"
          >
            <i :class="route.meta?.icon || 'el-icon-menu'"></i>
            <span slot="title">{{
              route.children ? route.children[0].meta?.title : route.meta?.title
            }}</span>
          </el-menu-item>
          <el-submenu v-else :key="route.path" :index="route.path">
            <template slot="title">
              <i :class="route.meta?.icon || 'el-icon-menu'"></i>
              <span>{{ route.meta?.title }}</span>
            </template>
            <el-menu-item
              v-for="child in route.children"
              :key="child.path"
              :index="resolvePath(route.path, child.path)"
              v-if="!child.hidden && hasPermission(child)"
            >
              {{ child.meta?.title }}
            </el-menu-item>
          </el-submenu>
        </template>
      </el-menu>
    </el-scrollbar>
  </div>
</template>

<script setup lang="ts">
import { computed, defineComponent } from 'vue'
import { mapGetters } from 'vuex'
import { constantRoutes } from '@/router'

export default defineComponent({
  name: 'Sidebar',
  computed: {
    ...mapGetters(['sidebar', 'roles']),
    permission_routes() {
      return this.filterRoutes(constantRoutes)
    },
  },
  methods: {
    resolvePath(parentPath: string, childPath?: string) {
      if (!childPath) return parentPath
      if (childPath.startsWith('/')) return childPath
      return `${parentPath}/${childPath}`.replace(/\/+/g, '/')
    },
    hasPermission(route: any) {
      if (route.meta && route.meta.roles) {
        return this.roles.some((role: string) => route.meta.roles.includes(role))
      }
      return true
    },
    filterRoutes(routes: any[]): any[] {
      return routes
        .map((route) => {
          const tmp = { ...route }
          if (tmp.children) {
            tmp.children = tmp.children.filter((child: any) => this.hasPermission(child))
          }
          return tmp
        })
        .filter((route) => {
          if (route.children && route.children.length > 0) return true
          if (!route.children) return this.hasPermission(route)
          return false
        })
    },
  },
})
</script>

<style lang="scss" scoped>
.sidebar {
  height: 100%;
  display: flex;
  flex-direction: column;

  .logo {
    height: $header-height;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: #002140;
    color: #fff;
    font-size: 18px;
    font-weight: bold;
    letter-spacing: 1px;

    h2 {
      margin: 0;
      font-size: 18px;
      color: #fff;
      font-weight: 600;
    }
  }

  .scrollbar-wrapper {
    flex: 1;
    overflow-x: hidden !important;
  }

  .el-menu {
    background-color: #001529;
    border: none;
  }

  .el-menu-item,
  .el-submenu__title {
    color: #ffffffa6 !important;
    &:hover {
      background-color: rgba(255, 255, 255, 0.05) !important;
      color: #fff !important;
    }
  }

  .el-menu-item.is-active {
    background-color: rgba(22, 93, 255, 0.2) !important;
    color: #165dff !important;
  }

  .el-submenu.is-active .el-submenu__title {
    color: #fff !important;
  }

  .el-menu--collapse {
    .el-submenu {
      .el-submenu__title {
        padding: 0 !important;
        text-align: center;
      }
    }
    .el-menu-item {
      padding: 0 !important;
      text-align: center;
    }
  }
}
</style>
