<template>
  <div class="not-found">
    <div class="content">
      <h1>404</h1>
      <p>抱歉，您访问的页面不存在</p>
      <el-button type="primary" size="large" @click="$router.push('/')">返回首页</el-button>
    </div>
  </div>
</template>

<script setup>
</script>

<style lang="scss" scoped>
.not-found {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);

  .content {
    text-align: center;
    color: #fff;

    h1 {
      font-size: 120px;
      margin: 0;
      text-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
    }

    p {
      font-size: 18px;
      margin: 20px 0 40px;
      opacity: 0.9;
    }
  }
}
</style>
