<template>
  <div id="app">
    <router-view />
  </div>
</template>

<script setup lang="ts">
import { defineComponent } from 'vue'

export default defineComponent({
  name: 'App',
})
</script>

<style lang="scss">
#app {
  height: 100%;
  width: 100%;
}
</style>
