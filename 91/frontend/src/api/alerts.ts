import request from './request'
import type { AlertEvent, AlertRule, AlertStats, AlertLevel } from '@/types'

export const alertsApi = {
  getAlerts(limit: number = 100, level?: AlertLevel): Promise<{ data: AlertEvent[]; total: number }> {
    const params: Record<string, any> = { limit }
    if (level) params.level = level
    return request.get('/alerts', { params })
  },

  getStats(): Promise<AlertStats> {
    return request.get('/alerts/stats')
  },

  acknowledgeAlert(id: string): Promise<{ success: boolean }> {
    return request.post(`/alerts/${id}/acknowledge`)
  },

  getRules(): Promise<{ data: AlertRule[]; total: number }> {
    return request.get('/alerts/rules')
  },

  createRule(rule: Partial<AlertRule>): Promise<{ success: boolean; data: AlertRule }> {
    return request.post('/alerts/rules', rule)
  },

  updateRule(id: string, updates: Partial<AlertRule>): Promise<{ success: boolean; data: AlertRule }> {
    return request.put(`/alerts/rules/${id}`, updates)
  },

  deleteRule(id: string): Promise<{ success: boolean }> {
    return request.delete(`/alerts/rules/${id}`)
  },

  enableRule(id: string): Promise<{ success: boolean }> {
    return request.post(`/alerts/rules/${id}/enable`)
  },

  disableRule(id: string): Promise<{ success: boolean }> {
    return request.post(`/alerts/rules/${id}/disable`)
  }
}
