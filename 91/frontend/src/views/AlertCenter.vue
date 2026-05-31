<template>
  <div class="alerts-page">
    <div class="alerts-header">
      <div class="header-left">
        <h2>告警中心</h2>
        <div class="alert-stats">
          <el-tag type="danger" effect="dark" v-if="alertsStore.criticalCount > 0">
            严重: {{ alertsStore.criticalCount }}
          </el-tag>
          <el-tag type="danger" v-if="alertsStore.errorCount > 0">
            错误: {{ alertsStore.errorCount }}
          </el-tag>
          <el-tag type="warning" v-if="alertsStore.warningCount > 0">
            警告: {{ alertsStore.warningCount }}
          </el-tag>
        </div>
      </div>
      <div class="header-right">
        <el-radio-group v-model="levelFilter" size="small" @change="handleFilterChange">
          <el-radio-button value="">全部</el-radio-button>
          <el-radio-button value="critical">严重</el-radio-button>
          <el-radio-button value="error">错误</el-radio-button>
          <el-radio-button value="warning">警告</el-radio-button>
          <el-radio-button value="info">信息</el-radio-button>
        </el-radio-group>
        <el-button @click="fetchAlerts" :loading="loading" size="small">
          <el-icon><Refresh /></el-icon> 刷新
        </el-button>
      </div>
    </div>

    <div class="alerts-content">
      <div class="alerts-list" v-loading="loading">
        <div
          v-for="alert in filteredAlerts"
          :key="alert.id"
          class="alert-item"
          :class="[`alert-${alert.level}`, { acknowledged: alert.acknowledged }]"
        >
          <div class="alert-level-badge">
            <el-icon :size="20">
              <WarningFilled v-if="alert.level === 'critical'" />
              <CircleCloseFilled v-else-if="alert.level === 'error'" />
              <Warning v-else-if="alert.level === 'warning'" />
              <InfoFilled v-else />
            </el-icon>
          </div>
          <div class="alert-body">
            <div class="alert-title-row">
              <span class="alert-name">{{ alert.ruleName }}</span>
              <el-tag :type="getLevelTagType(alert.level)" size="small" effect="dark">
                {{ getLevelLabel(alert.level) }}
              </el-tag>
              <el-tag size="small" type="info">{{ alert.type }}</el-tag>
            </div>
            <p class="alert-message">{{ alert.message }}</p>
            <div class="alert-meta">
              <span class="alert-time">{{ formatTime(alert.timestamp) }}</span>
              <span v-if="alert.acknowledged" class="ack-info">
                已确认 by {{ alert.acknowledgedBy || '系统' }}
              </span>
            </div>
          </div>
          <div class="alert-actions">
            <el-button
              v-if="!alert.acknowledged"
              type="primary"
              size="small"
              @click="handleAcknowledge(alert.id)"
            >
              确认
            </el-button>
          </div>
        </div>

        <el-empty v-if="filteredAlerts.length === 0 && !loading" description="暂无告警" />
      </div>
    </div>

    <div class="rules-section">
      <div class="section-header">
        <h3>告警规则</h3>
        <el-button type="primary" size="small" @click="showRuleDialog = true">
          <el-icon><Plus /></el-icon> 新增规则
        </el-button>
      </div>

      <el-table :data="alertsStore.rules" style="width: 100%" size="small" stripe>
        <el-table-column prop="name" label="规则名称" min-width="150" />
        <el-table-column prop="type" label="类型" width="100">
          <template #default="{ row }">
            <el-tag size="small">{{ row.type }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="level" label="级别" width="80">
          <template #default="{ row }">
            <el-tag :type="getLevelTagType(row.level)" size="small" effect="dark">
              {{ getLevelLabel(row.level) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="enabled" label="状态" width="80">
          <template #default="{ row }">
            <el-switch
              :model-value="row.enabled"
              size="small"
              @change="toggleRule(row.id, row.enabled)"
            />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button type="danger" link size="small" @click="handleDeleteRule(row.id)">
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="showRuleDialog" title="新增告警规则" width="600px" :close-on-click-modal="false">
      <el-form :model="newRule" label-width="80px" size="default">
        <el-form-item label="规则名称" required>
          <el-input v-model="newRule.name" placeholder="输入规则名称" />
        </el-form-item>
        <el-form-item label="类型" required>
          <el-select v-model="newRule.type" style="width: 100%">
            <el-option label="异常检测" value="anomaly" />
            <el-option label="阈值告警" value="threshold" />
            <el-option label="模式匹配" value="pattern" />
            <el-option label="速率告警" value="rate" />
            <el-option label="自定义" value="custom" />
          </el-select>
        </el-form-item>
        <el-form-item label="级别" required>
          <el-select v-model="newRule.level" style="width: 100%">
            <el-option label="信息" value="info" />
            <el-option label="警告" value="warning" />
            <el-option label="错误" value="error" />
            <el-option label="严重" value="critical" />
          </el-select>
        </el-form-item>
        <el-form-item label="条件">
          <div class="condition-row" v-for="(cond, idx) in newRule.conditions" :key="idx">
            <el-input v-model="cond.field" placeholder="字段" style="width: 30%" />
            <el-select v-model="cond.operator" style="width: 25%">
              <el-option label="大于" value="gt" />
              <el-option label="小于" value="lt" />
              <el-option label="等于" value="eq" />
              <el-option label="包含" value="contains" />
              <el-option label="正则" value="regex" />
              <el-option label="速率超限" value="rate_exceeds" />
            </el-select>
            <el-input v-model="cond.value" placeholder="值" style="width: 35%" />
            <el-button type="danger" link @click="newRule.conditions.splice(idx, 1)">
              <el-icon><Delete /></el-icon>
            </el-button>
          </div>
          <el-button type="primary" link @click="newRule.conditions.push({ field: '', operator: 'gt', value: '' })">
            + 添加条件
          </el-button>
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="newRule.description" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showRuleDialog = false">取消</el-button>
        <el-button type="primary" @click="handleCreateRule" :loading="creating">创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useAlertsStore } from '@/stores/alerts'
import {
  Refresh, WarningFilled, CircleCloseFilled, Warning,
  InfoFilled, Plus, Delete
} from '@element-plus/icons-vue'
import type { AlertLevel } from '@/types'

const alertsStore = useAlertsStore()
const loading = ref(false)
const levelFilter = ref<AlertLevel | ''>('')
const showRuleDialog = ref(false)
const creating = ref(false)

const newRule = ref({
  name: '',
  type: 'threshold' as const,
  level: 'warning' as AlertLevel,
  conditions: [{ field: '', operator: 'gt' as const, value: '' }],
  description: ''
})

const filteredAlerts = computed(() => {
  if (!levelFilter.value) return alertsStore.alerts
  return alertsStore.alerts.filter(a => a.level === levelFilter.value)
})

function getLevelTagType(level: AlertLevel): 'info' | 'warning' | 'danger' {
  const map: Record<AlertLevel, 'info' | 'warning' | 'danger'> = {
    info: 'info',
    warning: 'warning',
    error: 'danger',
    critical: 'danger'
  }
  return map[level] || 'info'
}

function getLevelLabel(level: AlertLevel): string {
  const map: Record<AlertLevel, string> = {
    info: '信息',
    warning: '警告',
    error: '错误',
    critical: '严重'
  }
  return map[level] || level
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

async function fetchAlerts() {
  loading.value = true
  try {
    await alertsStore.fetchAlerts()
  } finally {
    loading.value = false
  }
}

function handleFilterChange() {
  fetchAlerts()
}

async function handleAcknowledge(id: string) {
  await alertsStore.acknowledgeAlert(id)
}

async function toggleRule(ruleId: string, currentlyEnabled: boolean) {
  if (currentlyEnabled) {
    await alertsStore.disableRule(ruleId)
  } else {
    await alertsStore.enableRule(ruleId)
  }
}

async function handleDeleteRule(ruleId: string) {
  await alertsStore.deleteRule(ruleId)
}

async function handleCreateRule() {
  creating.value = true
  try {
    await alertsStore.createRule({
      name: newRule.value.name,
      type: newRule.value.type,
      level: newRule.value.level,
      conditions: newRule.value.conditions.filter(c => c.field && c.value !== ''),
      actions: [{ type: 'websocket', config: {} }],
      description: newRule.value.description,
      enabled: true
    } as any)
    showRuleDialog.value = false
    newRule.value = {
      name: '',
      type: 'threshold',
      level: 'warning',
      conditions: [{ field: '', operator: 'gt', value: '' }],
      description: ''
    }
  } finally {
    creating.value = false
  }
}

onMounted(() => {
  fetchAlerts()
  alertsStore.fetchRules()
  alertsStore.connectWebSocket()
  alertsStore.subscribeToAlerts()
})

onBeforeUnmount(() => {
  alertsStore.unsubscribeFromAlerts()
})
</script>

<style scoped>
.alerts-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.alerts-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.alerts-header h2 {
  color: #fff;
  margin: 0;
  font-size: 18px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.alert-stats {
  display: flex;
  gap: 8px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.alerts-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 500px;
  overflow-y: auto;
}

.alert-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 16px;
  background: #001529;
  border: 1px solid #1f2d3d;
  border-radius: 8px;
  transition: all 0.2s;
}

.alert-item:hover {
  border-color: #409eff;
}

.alert-item.alert-critical {
  border-left: 3px solid #c00000;
}

.alert-item.alert-error {
  border-left: 3px solid #f56c6c;
}

.alert-item.alert-warning {
  border-left: 3px solid #e6a23c;
}

.alert-item.alert-info {
  border-left: 3px solid #409eff;
}

.alert-item.acknowledged {
  opacity: 0.6;
}

.alert-level-badge {
  flex-shrink: 0;
  padding-top: 2px;
}

.alert-critical .alert-level-badge { color: #c00000; }
.alert-error .alert-level-badge { color: #f56c6c; }
.alert-warning .alert-level-badge { color: #e6a23c; }
.alert-info .alert-level-badge { color: #409eff; }

.alert-body {
  flex: 1;
  min-width: 0;
}

.alert-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.alert-name {
  color: #fff;
  font-weight: 600;
  font-size: 14px;
}

.alert-message {
  color: #b9c0cc;
  font-size: 13px;
  margin: 4px 0;
  line-height: 1.5;
}

.alert-meta {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: #8b9aae;
}

.ack-info {
  color: #67c23a;
}

.alert-actions {
  flex-shrink: 0;
}

.rules-section {
  background: #001529;
  border: 1px solid #1f2d3d;
  border-radius: 8px;
  padding: 20px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.section-header h3 {
  color: #fff;
  margin: 0;
  font-size: 15px;
}

.condition-row {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
  align-items: center;
}

:deep(.el-table) {
  --el-table-bg-color: #001529;
  --el-table-tr-bg-color: #001529;
  --el-table-header-bg-color: #0a192f;
  --el-table-row-hover-bg-color: #0a192f;
  --el-table-border-color: #1f2d3d;
  --el-table-text-color: #b9c0cc;
  --el-table-header-text-color: #fff;
}
</style>
