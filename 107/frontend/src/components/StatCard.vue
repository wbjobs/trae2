<template>
  <div class="stat-card" :style="{ '--accent-color': color }">
    <div class="stat-icon">{{ icon }}</div>
    <div class="stat-content">
      <div class="stat-title">{{ title }}</div>
      <div class="stat-value">
        <span class="value">{{ formatValue(value) }}</span>
        <span class="unit">{{ unit }}</span>
      </div>
      <div class="stat-trend" :class="trendClass">
        <span>{{ trend }}</span>
      </div>
    </div>
    <div class="stat-decoration"></div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  title: String,
  value: [Number, String],
  unit: String,
  icon: String,
  color: String,
  trend: String
})

const formatValue = (val) => {
  if (typeof val === 'number') {
    return val.toLocaleString()
  }
  return val || 0
}

const trendClass = computed(() => {
  if (!props.trend) return ''
  if (props.trend.startsWith('+')) return 'trend-up'
  if (props.trend.startsWith('-')) return 'trend-down'
  return ''
})
</script>

<style scoped lang="scss">
.stat-card {
  position: relative;
  background: linear-gradient(135deg, rgba(15, 38, 68, 0.9) 0%, rgba(15, 38, 68, 0.5) 100%);
  border: 1px solid rgba(64, 158, 255, 0.3);
  border-radius: 12px;
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 16px;
  overflow: hidden;
  transition: all 0.3s ease;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: linear-gradient(90deg, var(--accent-color) 0%, transparent 100%);
  }

  &:hover {
    transform: translateY(-4px);
    box-shadow: 0 8px 24px rgba(64, 158, 255, 0.2);
    border-color: var(--accent-color);
  }
}

.stat-icon {
  width: 56px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  background: linear-gradient(135deg, var(--accent-color) 0%, rgba(64, 158, 255, 0.3) 100%);
  border-radius: 12px;
  flex-shrink: 0;
}

.stat-content {
  flex: 1;
  min-width: 0;
}

.stat-title {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.7);
  margin-bottom: 8px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.stat-value {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-bottom: 4px;

  .value {
    font-size: 28px;
    font-weight: 700;
    color: #fff;
    font-family: 'Courier New', monospace;
  }

  .unit {
    font-size: 14px;
    color: rgba(255, 255, 255, 0.6);
  }
}

.stat-trend {
  font-size: 12px;

  &.trend-up {
    color: #67c23a;
  }

  &.trend-down {
    color: #f56c6c;
  }
}

.stat-decoration {
  position: absolute;
  right: -20px;
  bottom: -20px;
  width: 80px;
  height: 80px;
  background: radial-gradient(circle, var(--accent-color) 0%, transparent 70%);
  opacity: 0.1;
  pointer-events: none;
}
</style>
