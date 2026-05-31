<template>
  <Suspense>
    <template #default>
      <RealtimeTable v-if="isVisible" :title="title" :data="data" :loading="loading" :realtime="realtime" :showPagination="showPagination" :total="total">
        <slot></slot>
      </RealtimeTable>
      <div v-else ref="placeholderRef" class="table-placeholder">
        <div class="skeleton-header"></div>
        <div class="skeleton-body">
          <div v-for="i in 5" :key="i" class="skeleton-row"></div>
        </div>
      </div>
    </template>
    <template #fallback>
      <div class="table-placeholder">
        <div class="skeleton-header"></div>
        <div class="skeleton-body">
          <div v-for="i in 5" :key="i" class="skeleton-row"></div>
        </div>
      </div>
    </template>
  </Suspense>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, defineAsyncComponent } from 'vue'
import { useIntersectionObserver } from '@vueuse/core'

defineProps<{
  title: string
  data: any[]
  loading?: boolean
  realtime?: boolean
  showPagination?: boolean
  total?: number
}>()

const RealtimeTable = defineAsyncComponent({
  loader: () => import('./RealtimeTable.vue'),
  delay: 100,
  timeout: 5000
})

const placeholderRef = ref<HTMLElement>()
const isVisible = ref(false)

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
</script>

<style scoped>
.table-placeholder {
  background: #001529;
  border: 1px solid #1f2d3d;
  border-radius: 8px;
  overflow: hidden;
}

.skeleton-header {
  height: 56px;
  background: linear-gradient(90deg, #001e36 25%, #002240 50%, #001e36 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-bottom: 1px solid #1f2d3d;
}

.skeleton-body {
  padding: 16px 20px;
}

.skeleton-row {
  height: 40px;
  background: linear-gradient(90deg, #001e36 25%, #002240 50%, #001e36 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  margin-bottom: 8px;
  border-radius: 4px;
}

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
</style>
