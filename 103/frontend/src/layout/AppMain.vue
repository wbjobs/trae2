<template>
  <section class="app-main">
    <transition name="fade" mode="out-in">
      <router-view :key="$route.fullPath" />
    </transition>
  </section>
</template>

<script setup lang="ts">
import { defineComponent } from 'vue'

export default defineComponent({
  name: 'AppMain',
})
</script>

<style lang="scss" scoped>
.app-main {
  flex: 1;
  overflow-x: hidden;
  padding: 20px;
  min-height: calc(100vh - #{$header-height});
  background-color: $bg-color-page;
}
</style>
