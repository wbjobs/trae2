import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { AlertRule, AlertEvent, AlertLevel } from '@/types'

const DEFAULT_RULES: AlertRule[] = [
  {
    rule_id: 'cpu-usage-high',
    name: 'CPU 使用率过高',
    hardware_type: 'Cpu',
    metric: 'usage_percent',
    operator: 'gte',
    threshold: 90,
    duration_secs: 30,
    enabled: true,
    level: 'Critical',
  },
  {
    rule_id: 'cpu-usage-warn',
    name: 'CPU 使用率偏高',
    hardware_type: 'Cpu',
    metric: 'usage_percent',
    operator: 'gte',
    threshold: 70,
    duration_secs: 60,
    enabled: true,
    level: 'Warning',
  },
  {
    rule_id: 'cpu-temp-high',
    name: 'CPU 温度过高',
    hardware_type: 'Cpu',
    metric: 'temperature_celsius',
    operator: 'gte',
    threshold: 80,
    duration_secs: 10,
    enabled: true,
    level: 'Critical',
  },
  {
    rule_id: 'memory-usage-high',
    name: '内存使用率过高',
    hardware_type: 'Memory',
    metric: 'usage_percent',
    operator: 'gte',
    threshold: 90,
    duration_secs: 30,
    enabled: true,
    level: 'Critical',
  },
  {
    rule_id: 'memory-usage-warn',
    name: '内存使用率偏高',
    hardware_type: 'Memory',
    metric: 'usage_percent',
    operator: 'gte',
    threshold: 75,
    duration_secs: 60,
    enabled: true,
    level: 'Warning',
  },
  {
    rule_id: 'disk-usage-high',
    name: '磁盘使用率过高',
    hardware_type: 'Disk',
    metric: 'usage_percent',
    operator: 'gte',
    threshold: 90,
    duration_secs: 0,
    enabled: true,
    level: 'Critical',
  },
]

export const useAlertStore = defineStore('alert', () => {
  const rules = ref<AlertRule[]>([...DEFAULT_RULES])
  const activeAlerts = ref<AlertEvent[]>([])
  const alertHistory = ref<AlertEvent[]>([])
  const showPopup = ref(false)
  const suppressedRuleIds = ref<Set<string>>(new Set())

  const criticalCount = computed(() =>
    activeAlerts.value.filter(a => a.level === 'Critical').length
  )
  const warningCount = computed(() =>
    activeAlerts.value.filter(a => a.level === 'Warning').length
  )
  const infoCount = computed(() =>
    activeAlerts.value.filter(a => a.level === 'Info').length
  )
  const hasActiveAlerts = computed(() => activeAlerts.value.length > 0)

  function checkAlerts(
    cpuUsage?: number,
    cpuTemp?: number,
    memoryUsage?: number,
    diskUsages?: number[],
    sensorValues?: Array<{ type: string; value: number }>
  ) {
    const newAlerts: AlertEvent[] = []
    const now = new Date().toISOString()

    for (const rule of rules.value) {
      if (!rule.enabled) continue
      if (suppressedRuleIds.value.has(rule.rule_id)) continue

      const values: number[] = []

      if (rule.hardware_type === 'Cpu' && rule.metric === 'usage_percent' && cpuUsage !== undefined) {
        values.push(cpuUsage)
      } else if (rule.hardware_type === 'Cpu' && rule.metric === 'temperature_celsius' && cpuTemp !== undefined) {
        values.push(cpuTemp)
      } else if (rule.hardware_type === 'Memory' && rule.metric === 'usage_percent' && memoryUsage !== undefined) {
        values.push(memoryUsage)
      } else if (rule.hardware_type === 'Disk' && rule.metric === 'usage_percent' && diskUsages) {
        values.push(...diskUsages)
      } else if (rule.hardware_type === 'Sensor' && sensorValues) {
        for (const sv of sensorValues) {
          if (sv.type === rule.metric) values.push(sv.value)
        }
      }

      for (const value of values) {
        const triggered = matchOperator(rule.operator, value, rule.threshold)
        if (triggered) {
          newAlerts.push({
            rule_id: rule.rule_id,
            rule_name: rule.name,
            hardware_type: rule.hardware_type,
            metric: rule.metric,
            current_value: value,
            threshold: rule.threshold,
            level: rule.level,
            message: `${rule.metric} ${rule.operator} ${rule.threshold} (当前: ${value.toFixed(1)})`,
            triggered_at: now,
          })
        }
      }
    }

    if (newAlerts.length > 0) {
      activeAlerts.value = newAlerts
      alertHistory.value.push(...newAlerts)
      if (alertHistory.value.length > 200) {
        alertHistory.value = alertHistory.value.slice(-200)
      }
      const hasCritical = newAlerts.some(a => a.level === 'Critical')
      const hasWarning = newAlerts.some(a => a.level === 'Warning')
      if (hasCritical || hasWarning) {
        showPopup.value = true
      }
    } else {
      activeAlerts.value = []
    }
  }

  function matchOperator(op: string, value: number, threshold: number): boolean {
    switch (op) {
      case 'gt': return value > threshold
      case 'gte': return value >= threshold
      case 'lt': return value < threshold
      case 'lte': return value <= threshold
      case 'eq': return Math.abs(value - threshold) < Number.EPSILON
      default: return false
    }
  }

  function addRule(rule: AlertRule) {
    const idx = rules.value.findIndex(r => r.rule_id === rule.rule_id)
    if (idx >= 0) {
      rules.value[idx] = rule
    } else {
      rules.value.push(rule)
    }
  }

  function removeRule(ruleId: string) {
    rules.value = rules.value.filter(r => r.rule_id !== ruleId)
  }

  function suppressRule(ruleId: string) {
    suppressedRuleIds.value.add(ruleId)
  }

  function unsuppressRule(ruleId: string) {
    suppressedRuleIds.value.delete(ruleId)
  }

  function dismissAll() {
    activeAlerts.value = []
    showPopup.value = false
  }

  function closePopup() {
    showPopup.value = false
  }

  function clearHistory() {
    alertHistory.value = []
  }

  return {
    rules,
    activeAlerts,
    alertHistory,
    showPopup,
    suppressedRuleIds,
    criticalCount,
    warningCount,
    infoCount,
    hasActiveAlerts,
    checkAlerts,
    addRule,
    removeRule,
    suppressRule,
    unsuppressRule,
    dismissAll,
    closePopup,
    clearHistory,
  }
})
