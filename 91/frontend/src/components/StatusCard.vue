<template>
  <div class="status-card" :class="statusClass">
    <div class="card-icon">
      <el-icon :size="32">
        <component :is="icon" />
      </el-icon>
    </div>
    <div class="card-content">
      <div class="card-value">{{ value }}</div>
      <div class="card-label">{{ label }}</div>
    </div>
    <div class="card-trend" v-if="trend !== undefined">
      <el-icon :size="14" :class="{ 'trend-up': trend > 0, 'trend-down': trend < 0 }">
        <CaretTop v-if="trend > 0" />
        <CaretBottom v-else-if="trend < 0" />
        <Minus v-else />
      </el-icon>
      <span>{{ Math.abs(trend) }}%</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Cpu, Monitor, Warning, CircleCheck, CircleClose, CaretTop, CaretBottom, Minus } from '@element-plus/icons-vue'
import type { DeviceStatus } from '@/types'

const props = defineProps<{
  label: string
  value: number | string
  status?: DeviceStatus | 'normal'
  icon?: string
  trend?: number
}>()

const iconMap: Record<string, any> = {
  Cpu,
  Monitor,
  Warning,
  CircleCheck,
  CircleClose
}

const icon = computed(() => {
  if (props.icon && iconMap[props.icon]) {
    return iconMap[props.icon]
  }
  if (props.status === 'online') return CircleCheck
  if (props.status === 'offline') return CircleClose
  if (props.status === 'warning' || props.status === 'error') return Warning
  return Monitor
})

const statusClass = computed(() => {
  if (!props.status) return 'status-normal'
  return `status-${props.status}`
})
</script>

<style scoped>
.status-card {
  background: linear-gradient(135deg, #001e36 0%, #001529 100%);
  border: 1px solid #1f2d3d;
  border-radius: 12px;
  padding: 24px;
  display: flex;
  align-items: center;
  gap: 20px;
  position: relative;
  overflow: hidden;
  transition: all 0.3s ease;
}

.status-card::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  background: #409eff;
}

.status-card.status-online::before { background: #67c23a; }
.status-card.status-offline::before { background: #909399; }
.status-card.status-warning::before { background: #e6a23c; }
.status-card.status-error::before { background: #f56c6c; }
.status-card.status-normal::before { background: #409eff; }

.status-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
  border-color: #409eff;
}

.card-icon {
  width: 64px;
  height: 64px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(64, 158, 255, 0.1);
  color: #409eff;
}

.status-online .card-icon {
  background: rgba(103, 194, 58, 0.1);
  color: #67c23a;
}

.status-offline .card-icon {
  background: rgba(144, 147, 153, 0.1);
  color: #909399;
}

.status-warning .card-icon {
  background: rgba(230, 162, 60, 0.1);
  color: #e6a23c;
}

.status-error .card-icon {
  background: rgba(245, 108, 108, 0.1);
  color: #f56c6c;
}

.card-content {
  flex: 1;
}

.card-value {
  font-size: 32px;
  font-weight: 700;
  color: #fff;
  line-height: 1.2;
}

.card-label {
  font-size: 13px;
  color: #8b9aae;
  margin-top: 4px;
}

.card-trend {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #67c23a;
}

.card-trend .trend-down {
  color: #f56c6c;
}
</style>
