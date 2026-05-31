<template>
  <div class="route-error">
    <div class="error-content">
      <div class="error-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
      </div>
      <h3 class="error-title">{{ title }}</h3>
      <p class="error-message">{{ message }}</p>
      <button class="retry-btn" @click="handleRetry">
        重新加载
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  title?: string
  message?: string
}>()

const emit = defineEmits<{
  (e: 'retry'): void
}>()

function handleRetry() {
  emit('retry')
  window.location.reload()
}
</script>

<style scoped>
.route-error {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 400px;
  background: #001529;
}

.error-content {
  text-align: center;
  padding: 40px;
}

.error-icon {
  width: 80px;
  height: 80px;
  margin: 0 auto 24px;
  color: #f56c6c;
}

.error-title {
  color: #fff;
  font-size: 20px;
  margin: 0 0 12px;
}

.error-message {
  color: #8b9aae;
  font-size: 14px;
  margin: 0 0 24px;
}

.retry-btn {
  padding: 10px 24px;
  background: #409eff;
  color: #fff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.3s;
}

.retry-btn:hover {
  background: #66b1ff;
}
</style>
