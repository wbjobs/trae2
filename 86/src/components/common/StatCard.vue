<template>
  <div class="stat-card card">
    <div class="flex items-start justify-between">
      <div class="flex-1">
        <div class="stat-label">{{ label }}</div>
        <div class="stat-value mt-2">
          {{ formattedValue }}
          <span v-if="unit" class="stat-unit">{{ unit }}</span>
        </div>
        <div v-if="subLabel" class="text-xs text-muted mt-2">{{ subLabel }}</div>
      </div>
      <div
        class="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0"
        :style="{ background: iconBg }"
      >
        <slot name="icon">
          <svg class="w-6 h-6" :style="{ color: iconColor }" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </slot>
      </div>
    </div>
    <div v-if="showProgress" class="mt-4">
      <div class="progress-bar">
        <div class="progress-fill" :class="progressClass" :style="{ width: progressWidth }"></div>
      </div>
      <div class="flex justify-between mt-1 text-xs text-muted">
        <span>{{ value }}%</span>
        <span>{{ statusText }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useHardwareStore } from '@/stores/hardware'

const props = withDefaults(defineProps<{
  label: string
  value: number | string
  unit?: string
  subLabel?: string
  iconColor?: string
  iconBg?: string
  showProgress?: boolean
  isPercentage?: boolean
  formatBytes?: boolean
}>(), {
  showProgress: false,
  isPercentage: false,
  formatBytes: false,
  iconColor: 'var(--primary-color)',
  iconBg: 'rgba(74, 158, 255, 0.15)',
})

const hardwareStore = useHardwareStore()

const formattedValue = computed(() => {
  if (props.formatBytes && typeof props.value === 'number') {
    return hardwareStore.formatBytes(props.value)
  }
  if (props.isPercentage && typeof props.value === 'number') {
    return props.value.toFixed(1)
  }
  return props.value
})

const progressWidth = computed(() => {
  if (typeof props.value === 'number') {
    return `${Math.min(props.value, 100)}%`
  }
  return '0%'
})

const progressClass = computed(() => {
  if (typeof props.value === 'number') {
    return hardwareStore.getStatusClass(props.value)
  }
  return 'primary'
})

const statusText = computed(() => {
  if (typeof props.value === 'number') {
    if (props.value >= 90) return '危险'
    if (props.value >= 70) return '警告'
    return '正常'
  }
  return '正常'
})
</script>

<style scoped>
.stat-card {
  transition: all 0.3s ease;
}

.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}
</style>
