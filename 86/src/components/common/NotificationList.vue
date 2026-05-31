<template>
  <div class="notifications fixed top-4 right-4 z-50 flex flex-col gap-3 w-80">
    <TransitionGroup name="notification">
      <div
        v-for="notification in appStore.notifications"
        :key="notification.id"
        class="notification card p-4 flex items-start gap-3 animate-fade-in"
        :class="notificationClass(notification.type)"
      >
        <div class="icon flex-shrink-0 w-5 h-5 mt-0.5">
          <component :is="notificationIcon(notification.type)" />
        </div>
        <div class="content flex-1">
          <p class="text-sm font-medium text-white">{{ notification.message }}</p>
        </div>
        <button
          class="close flex-shrink-0 w-6 h-6 rounded flex items-center justify-center text-muted hover:text-white transition-colors"
          @click="appStore.removeNotification(notification.id)"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup lang="ts">
import { h } from 'vue'
import { useAppStore } from '@/stores/app'

const appStore = useAppStore()

function notificationClass(type: string) {
  const classes: Record<string, string> = {
    success: 'border-l-4 border-l-success',
    error: 'border-l-4 border-l-danger',
    warning: 'border-l-4 border-l-warning',
    info: 'border-l-4 border-l-primary',
  }
  return classes[type] || classes.info
}

function notificationIcon(type: string) {
  const icons: Record<string, any> = {
    success: () => h('svg', {
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'var(--success-color)',
      'stroke-width': '2',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round'
    }, [
      h('path', { d: 'M22 11.08V12a10 10 0 1 1-5.93-9.14' }),
      h('polyline', { points: '22 4 12 14.01 9 11.01' })
    ]),
    error: () => h('svg', {
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'var(--danger-color)',
      'stroke-width': '2',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round'
    }, [
      h('circle', { cx: '12', cy: '12', r: '10' }),
      h('line', { x1: '15', y1: '9', x2: '9', y2: '15' }),
      h('line', { x1: '9', y1: '9', x2: '15', y2: '15' })
    ]),
    warning: () => h('svg', {
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'var(--warning-color)',
      'stroke-width': '2',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round'
    }, [
      h('path', { d: 'M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z' }),
      h('line', { x1: '12', y1: '9', x2: '12', y2: '13' }),
      h('line', { x1: '12', y1: '17', x2: '12.01', y2: '17' })
    ]),
    info: () => h('svg', {
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'var(--primary-color)',
      'stroke-width': '2',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round'
    }, [
      h('circle', { cx: '12', cy: '12', r: '10' }),
      h('line', { x1: '12', y1: '16', x2: '12', y2: '12' }),
      h('line', { x1: '12', y1: '8', x2: '12.01', y2: '8' })
    ]),
  }
  return icons[type] || icons.info
}
</script>

<style scoped>
.notification {
  backdrop-filter: blur(10px);
  animation: slideIn 0.3s ease;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateX(100%);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.notification-enter-active,
.notification-leave-active {
  transition: all 0.3s ease;
}

.notification-enter-from {
  opacity: 0;
  transform: translateX(100%);
}

.notification-leave-to {
  opacity: 0;
  transform: translateX(100%);
}

.border-l-success {
  border-left-color: var(--success-color) !important;
}

.border-l-danger {
  border-left-color: var(--danger-color) !important;
}

.border-l-warning {
  border-left-color: var(--warning-color) !important;
}

.border-l-primary {
  border-left-color: var(--primary-color) !important;
}
</style>
