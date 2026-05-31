<template>
  <div class="error-page">
    <div class="error-content">
      <h1 class="error-code">404</h1>
      <p class="error-message">抱歉，您访问的页面不存在</p>
      <el-button type="primary" @click="goHome">返回首页</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { defineComponent } from 'vue'

export default defineComponent({
  name: '404',
  methods: {
    goHome() {
      this.$router.push('/dashboard')
    },
  },
})
</script>

<style lang="scss" scoped>
.error-page {
  min-height: 100vh;
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  background: $bg-color-page;

  .error-content {
    text-align: center;

    .error-code {
      font-size: 120px;
      font-weight: bold;
      color: $primary-color;
      margin: 0;
      line-height: 1;
      text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.1);
    }

    .error-message {
      font-size: 18px;
      color: $text-regular;
      margin: 20px 0 30px;
    }
  }
}
</style>
