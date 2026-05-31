<template>
  <Suspense>
    <template #default>
      <router-view />
    </template>
    <template #fallback>
      <div class="app-loading">
        <div class="loading-content">
          <div class="logo">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="#409eff" />
              <path d="M2 17L12 22L22 17" stroke="#409eff" stroke-width="2" />
              <path d="M2 12L12 17L22 12" stroke="#409eff" stroke-width="2" />
            </svg>
          </div>
          <h1 class="title">工业信令监控系统</h1>
          <div class="loading-spinner">
            <div class="spinner"></div>
          </div>
          <p class="loading-text">系统初始化中...</p>
        </div>
      </div>
    </template>
  </Suspense>
</template>

<script setup lang="ts">
</script>

<style>
#app {
  height: 100vh;
  width: 100%;
}

.app-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100vh;
  width: 100%;
  background: linear-gradient(135deg, #001529 0%, #002140 100%);
}

.loading-content {
  text-align: center;
}

.logo {
  width: 80px;
  height: 80px;
  margin: 0 auto 24px;
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.05); opacity: 0.8; }
}

.title {
  color: #fff;
  font-size: 24px;
  font-weight: 600;
  margin: 0 0 32px;
  letter-spacing: 2px;
}

.loading-spinner {
  display: flex;
  justify-content: center;
  margin-bottom: 16px;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid #1f2d3d;
  border-top-color: #409eff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loading-text {
  color: #8b9aae;
  font-size: 14px;
  margin: 0;
}
</style>
