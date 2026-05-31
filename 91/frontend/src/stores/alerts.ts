import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { ElNotification } from 'element-plus'
import type { AlertEvent, AlertRule, AlertStats, AlertLevel } from '@/types'

const MAX_ALERTS = 200
const WS_URL = import.meta.env.VITE_WS_URL

let ws: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null

const API_BASE = import.meta.env.VITE_API_QUERY?.replace('/api/query', '') || ''

function getAlertLevelColor(level: AlertLevel): string {
  switch (level) {
    case 'info': return '#409eff'
    case 'warning': return '#e6a23c'
    case 'error': return '#f56c6c'
    case 'critical': return '#c00000'
    default: return '#909399'
  }
}

function getAlertLevelTitle(level: AlertLevel): string {
  switch (level) {
    case 'info': return '信息'
    case 'warning': return '警告'
    case 'error': return '错误'
    case 'critical': return '严重'
    default: return '未知'
  }
}

export const useAlertsStore = defineStore('alerts', () => {
  const alerts = ref<AlertEvent[]>([])
  const rules = ref<AlertRule[]>([])
  const stats = ref<AlertStats | null>(null)
  const loading = ref(false)
  const wsConnected = ref(false)
  const alertsSubscribed = ref(false)

  const activeAlerts = computed(() => alerts.value.filter(a => !a.acknowledged))
  const acknowledgedAlerts = computed(() => alerts.value.filter(a => a.acknowledged))
  const criticalCount = computed(() => alerts.value.filter(a => a.level === 'critical' && !a.acknowledged).length)
  const errorCount = computed(() => alerts.value.filter(a => a.level === 'error' && !a.acknowledged).length)
  const warningCount = computed(() => alerts.value.filter(a => a.level === 'warning' && !a.acknowledged).length)

  function sortAlertsByTimestamp(alertList: AlertEvent[]): AlertEvent[] {
    return [...alertList].sort((a, b) => b.timestamp - a.timestamp)
  }

  function showAlertNotification(alert: AlertEvent): void {
    ElNotification({
      title: getAlertLevelTitle(alert.level),
      message: alert.message,
      type: alert.level === 'critical' || alert.level === 'error' ? 'error' : alert.level === 'warning' ? 'warning' : 'info',
      duration: alert.level === 'critical' ? 0 : 5000,
      position: 'top-right',
      offset: 50
    })
  }

  function addAlert(alert: AlertEvent): void {
    if (alerts.value.some(a => a.id === alert.id)) {
      return
    }

    alerts.value.push(alert)
    alerts.value = sortAlertsByTimestamp(alerts.value)

    if (alerts.value.length > MAX_ALERTS) {
      alerts.value = alerts.value.slice(0, MAX_ALERTS)
    }

    showAlertNotification(alert)
  }

  function connectWebSocket(): void {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      return
    }

    ws = new WebSocket(WS_URL)

    ws.onopen = () => {
      wsConnected.value = true
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
      if (alertsSubscribed.value) {
        subscribeToAlerts()
      }
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.type === 'alert') {
          addAlert(data.data)
        }
      } catch {
        // ignore non-JSON messages
      }
    }

    ws.onclose = () => {
      wsConnected.value = false
      reconnectTimer = setTimeout(() => {
        connectWebSocket()
      }, 3000)
    }

    ws.onerror = () => {
      ws?.close()
    }
  }

  function disconnectWebSocket(): void {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    if (ws) {
      ws.onclose = null
      ws.close()
      ws = null
    }
    wsConnected.value = false
    alertsSubscribed.value = false
  }

  function subscribeToAlerts(): void {
    alertsSubscribed.value = true
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'subscribe_alerts' }))
    }
  }

  function unsubscribeFromAlerts(): void {
    alertsSubscribed.value = false
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'unsubscribe_alerts' }))
    }
  }

  async function fetchAlerts(limit?: number, level?: AlertLevel): Promise<void> {
    loading.value = true
    try {
      const params = new URLSearchParams()
      if (limit) params.set('limit', String(limit))
      if (level) params.set('level', level)

      const response = await fetch(`${API_BASE}/api/alerts?${params}`)
      const result = await response.json()

      if (result.success) {
        alerts.value = sortAlertsByTimestamp(result.data || [])
      }
    } catch (error) {
      console.error('Failed to fetch alerts:', error)
    } finally {
      loading.value = false
    }
  }

  async function fetchStats(): Promise<void> {
    try {
      const response = await fetch(`${API_BASE}/api/alerts/stats`)
      const result = await response.json()

      if (result.success) {
        stats.value = result.data
      }
    } catch (error) {
      console.error('Failed to fetch alert stats:', error)
    }
  }

  async function acknowledgeAlert(alertId: string, userId?: string): Promise<boolean> {
    try {
      const response = await fetch(`${API_BASE}/api/alerts/${alertId}/acknowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      })
      const result = await response.json()

      if (result.success) {
        const alert = alerts.value.find(a => a.id === alertId)
        if (alert) {
          alert.acknowledged = true
          alert.acknowledgedBy = userId
          alert.acknowledgedAt = Date.now()
        }
        return true
      }
    } catch (error) {
      console.error('Failed to acknowledge alert:', error)
    }
    return false
  }

  async function fetchRules(): Promise<void> {
    try {
      const response = await fetch(`${API_BASE}/api/alerts/rules`)
      const result = await response.json()

      if (result.success) {
        rules.value = result.data || []
      }
    } catch (error) {
      console.error('Failed to fetch alert rules:', error)
    }
  }

  async function createRule(rule: Partial<AlertRule>): Promise<AlertRule | null> {
    try {
      const response = await fetch(`${API_BASE}/api/alerts/rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rule)
      })
      const result = await response.json()

      if (result.success) {
        rules.value.push(result.data)
        return result.data
      }
    } catch (error) {
      console.error('Failed to create alert rule:', error)
    }
    return null
  }

  async function updateRule(ruleId: string, updates: Partial<AlertRule>): Promise<AlertRule | null> {
    try {
      const response = await fetch(`${API_BASE}/api/alerts/rules/${ruleId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      })
      const result = await response.json()

      if (result.success) {
        const index = rules.value.findIndex(r => r.id === ruleId)
        if (index !== -1) {
          rules.value[index] = result.data
        }
        return result.data
      }
    } catch (error) {
      console.error('Failed to update alert rule:', error)
    }
    return null
  }

  async function deleteRule(ruleId: string): Promise<boolean> {
    try {
      const response = await fetch(`${API_BASE}/api/alerts/rules/${ruleId}`, {
        method: 'DELETE'
      })
      const result = await response.json()

      if (result.success) {
        rules.value = rules.value.filter(r => r.id !== ruleId)
        return true
      }
    } catch (error) {
      console.error('Failed to delete alert rule:', error)
    }
    return false
  }

  async function enableRule(ruleId: string): Promise<boolean> {
    try {
      const response = await fetch(`${API_BASE}/api/alerts/rules/${ruleId}/enable`, {
        method: 'POST'
      })
      const result = await response.json()

      if (result.success) {
        const rule = rules.value.find(r => r.id === ruleId)
        if (rule) rule.enabled = true
        return true
      }
    } catch (error) {
      console.error('Failed to enable alert rule:', error)
    }
    return false
  }

  async function disableRule(ruleId: string): Promise<boolean> {
    try {
      const response = await fetch(`${API_BASE}/api/alerts/rules/${ruleId}/disable`, {
        method: 'POST'
      })
      const result = await response.json()

      if (result.success) {
        const rule = rules.value.find(r => r.id === ruleId)
        if (rule) rule.enabled = false
        return true
      }
    } catch (error) {
      console.error('Failed to disable alert rule:', error)
    }
    return false
  }

  function clearAlerts(): void {
    alerts.value = []
  }

  return {
    alerts,
    rules,
    stats,
    loading,
    wsConnected,
    alertsSubscribed,
    activeAlerts,
    acknowledgedAlerts,
    criticalCount,
    errorCount,
    warningCount,
    connectWebSocket,
    disconnectWebSocket,
    subscribeToAlerts,
    unsubscribeFromAlerts,
    fetchAlerts,
    fetchStats,
    acknowledgeAlert,
    fetchRules,
    createRule,
    updateRule,
    deleteRule,
    enableRule,
    disableRule,
    clearAlerts,
    getAlertLevelColor,
    getAlertLevelTitle
  }
})
