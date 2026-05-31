<template>
  <div class="app-wrapper" :class="{ 'sidebar-collapsed': !sidebar.opened }">
    <Sidebar class="sidebar-container" />
    <div class="main-container">
      <Navbar />
      <AppMain />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, defineComponent } from 'vue'
import Sidebar from './Sidebar.vue'
import Navbar from './Navbar.vue'
import AppMain from './AppMain.vue'
import { mapGetters } from 'vuex'

export default defineComponent({
  name: 'Layout',
  components: { Sidebar, Navbar, AppMain },
  computed: {
    ...mapGetters(['sidebar']),
  },
})
</script>

<style lang="scss" scoped>
.app-wrapper {
  position: relative;
  height: 100%;
  width: 100%;
  display: flex;

  &.sidebar-collapsed {
    .main-container {
      margin-left: $sidebar-collapsed-width;
    }
  }
}

.sidebar-container {
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  width: $sidebar-width;
  background-color: #001529;
  z-index: 1001;
  transition: width $transition-duration;
  overflow: hidden;
}

.main-container {
  position: relative;
  min-height: 100%;
  margin-left: $sidebar-width;
  transition: margin-left $transition-duration;
  display: flex;
  flex-direction: column;
}
</style>
