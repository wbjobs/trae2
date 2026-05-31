<template>
  <Teleport to="body">
    <div v-if="visible" class="alert-overlay" @click.self="$emit('close')">
      <div class="alert-card">
        <div class="alert-header">
          <h3 class="alert-title">Alerts ({{ alerts.length }})</h3>
          <button class="close-btn" @click="$emit('close')">&times;</button>
        </div>

        <div class="alert-list">
          <div
            v-for="alert in alerts"
            :key="alert.rule_id"
            class="alert-item"
            :class="`level-${alert.level.toLowerCase()}`"
          >
            <span class="level-badge" :class="`badge-${alert.level.toLowerCase()}`">
              {{ alert.level }}
            </span>
            <div class="alert-content">
              <div class="alert-rule-name">{{ alert.rule_name }}</div>
              <div class="alert-detail">
                <span class="metric-label">{{ alert.metric }}</span>
                <span class="vs-separator">vs</span>
                <span class="threshold-label">{{ alert.threshold }}</span>
              </div>
              <div class="alert-value">Current: {{ alert.current_value }}</div>
            </div>
            <div class="alert-time">{{ formatTime(alert.triggered_at) }}</div>
          </div>

          <div v-if="alerts.length === 0" class="no-alerts">
            No alerts to display
          </div>
        </div>

        <div class="alert-footer">
          <button class="btn btn-dismiss" @click="$emit('dismissAll')">Dismiss All</button>
          <button class="btn btn-close" @click="$emit('close')">Close</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
interface Alert {
  rule_id: string | number
  rule_name: string
  hardware_type: string
  metric: string
  current_value: number | string
  threshold: number | string
  level: 'Info' | 'Warning' | 'Critical'
  message: string
  triggered_at: string
}

defineProps<{
  visible: boolean
  alerts: Alert[]
}>()

defineEmits<{
  close: []
  dismissAll: []
}>()

function formatTime(triggeredAt: string): string {
  const date = new Date(triggeredAt)
  return date.toLocaleString()
}
</script>

<style scoped>
:root {
  --bg-primary: #1a1a2e;
  --bg-secondary: #16213e;
  --text-primary: #e2e8f0;
  --text-secondary: #94a3b8;
  --border: #2d3748;
}

.alert-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.alert-card {
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 12px;
  width: 640px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

.alert-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
}

.alert-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

.close-btn {
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: 24px;
  cursor: pointer;
  line-height: 1;
  padding: 0 4px;
}

.close-btn:hover {
  color: var(--text-primary);
}

.alert-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
}

.alert-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 14px;
  margin-bottom: 8px;
  background: var(--bg-secondary);
  border-radius: 8px;
  border-left: 4px solid var(--border);
  position: relative;
}

.alert-item.level-info {
  border-left-color: #3b82f6;
}

.alert-item.level-warning {
  border-left-color: #f59e0b;
}

.alert-item.level-critical {
  border-left-color: #ef4444;
}

.level-badge {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  padding: 2px 8px;
  border-radius: 4px;
  letter-spacing: 0.5px;
}

.badge-info {
  background: rgba(59, 130, 246, 0.2);
  color: #60a5fa;
}

.badge-warning {
  background: rgba(245, 158, 11, 0.2);
  color: #fbbf24;
}

.badge-critical {
  background: rgba(239, 68, 68, 0.2);
  color: #f87171;
}

.alert-content {
  flex: 1;
  min-width: 0;
}

.alert-rule-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.alert-detail {
  font-size: 13px;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 2px;
}

.metric-label {
  color: #60a5fa;
}

.vs-separator {
  color: var(--text-secondary);
  font-size: 12px;
}

.threshold-label {
  color: #f87171;
}

.alert-value {
  font-size: 13px;
  color: var(--text-secondary);
}

.alert-time {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
  margin-top: 2px;
}

.no-alerts {
  text-align: center;
  color: var(--text-secondary);
  padding: 32px 0;
  font-size: 14px;
}

.alert-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 20px;
  border-top: 1px solid var(--border);
}

.btn {
  padding: 8px 18px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid var(--border);
  transition: all 0.2s ease;
}

.btn-dismiss {
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
  border-color: rgba(239, 68, 68, 0.3);
}

.btn-dismiss:hover {
  background: rgba(239, 68, 68, 0.25);
}

.btn-close {
  background: var(--bg-secondary);
  color: var(--text-primary);
}

.btn-close:hover {
  background: var(--border);
}
</style>
