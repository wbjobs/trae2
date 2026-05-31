<template>
  <Suspense>
    <template #default>
      <SignalingChart v-if="isVisible" :option="option" :width="width" :height="height" :theme="theme" ref="chartRef" />
      <div v-else ref="placeholderRef" :style="{ width, height, minHeight: '300px' }"></div>
    </template>
    <template #fallback>
      <div class="chart-loading" :style="{ width, height }">
        <div class="loading-spinner"></div>
        <span class="loading-text">图表加载中...</span>
      </div>
    </template>
  </Suspense>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, defineAsyncComponent } from 'vue'
import { useIntersectionObserver } from '@vueuse/core'
import type { EChartsOption } from 'echarts'

const props = defineProps<{
  option: EChartsOption
  width?: string
  height?: string
  theme?: 'dark' | 'light'
}>()

const SignalingChart = defineAsyncComponent({
  loader: () => import('./SignalingChart.vue'),
  delay: 100,
  timeout: 5000
})

const width = props.width || '100%'
const height = props.height || '400px'

const placeholderRef = ref<HTMLElement>()
const isVisible = ref(false)
const chartRef = ref<InstanceType<typeof SignalingChart>>()

let observer: ReturnType<typeof useIntersectionObserver> | null = null

onMounted(() => {
  if (placeholderRef.value) {
    observer = useIntersectionObserver(
      placeholderRef,
      ([{ isIntersecting }]) => {
        if (isIntersecting) {
          isVisible.value = true
          observer?.stop()
        }
      },
      { threshold: 0.1 }
    )
  }
})

onBeforeUnmount(() => {
  observer?.stop()
})

defineExpose({
  resize: () => chartRef.value?.resize?.()
})
</script>

<style scoped>
.chart-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #001529;
  border: 1px solid #1f2d3d;
  border-radius: 8px;
  min-height: 300px;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid #1f2d3d;
  border-top-color: #409eff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 12px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loading-text {
  color: #8b9aae;
  font-size: 13px;
}
</style>
