export type DeviceStatus = 'online' | 'offline' | 'warning' | 'error'

export type SignalingType = 'SIP' | 'H.323' | 'MGCP' | 'MEGACO' | 'SCTP' | 'Diameter' | 'RADIUS' | 'Other'

export interface Device {
  id: string
  name: string
  ip: string
  type: string
  status: DeviceStatus
  location: string
  lastHeartbeat: string
  signalingCount: number
  cpuUsage: number
  memoryUsage: number
}

export interface SignalingMessage {
  id: string
  deviceId: string
  deviceName: string
  type: SignalingType
  method: string
  from: string
  to: string
  timestamp: number
  status: 'success' | 'failed' | 'pending'
  duration?: number
  payload?: Record<string, any>
}

export interface ThroughputData {
  timestamp: string
  count: number
  success: number
  failed: number
}

export interface SignalingDistribution {
  type: SignalingType
  count: number
  percentage: number
}

export interface TraceQueryParams {
  deviceId?: string
  startTime?: string
  endTime?: string
  signalingTypes?: SignalingType[]
  status?: string
  page?: number
  pageSize?: number
}

export interface PaginatedResult<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
}

export interface MetricsData {
  timestamp: string
  totalSignaling: number
  successRate: number
  avgLatency: number
  errorRate: number
}

export interface DeviceMetrics {
  deviceId: string
  deviceName: string
  signalingCount: number
  successCount: number
  failedCount: number
  avgLatency: number
}

export interface TimeRange {
  startTime: string
  endTime: string
}

export type AlertLevel = 'info' | 'warning' | 'error' | 'critical'
export type AlertType = 'anomaly' | 'threshold' | 'pattern' | 'rate' | 'custom'

export interface AlertRule {
  id: string
  name: string
  type: AlertType
  level: AlertLevel
  enabled: boolean
  conditions: AlertCondition[]
  actions: AlertAction[]
  description?: string
  createdAt: number
  updatedAt: number
}

export interface AlertCondition {
  field: string
  operator: 'gt' | 'lt' | 'eq' | 'neq' | 'contains' | 'regex' | 'rate_exceeds'
  value: number | string
  windowMs?: number
}

export interface AlertAction {
  type: 'websocket' | 'webhook' | 'email' | 'slack'
  config: Record<string, any>
}

export interface AlertEvent {
  id: string
  ruleId: string
  ruleName: string
  level: AlertLevel
  type: AlertType
  message: string
  details: Record<string, any>
  timestamp: number
  acknowledged: boolean
  acknowledgedBy?: string
  acknowledgedAt?: number
}

export interface AlertStats {
  totalAlerts: number
  byLevel: Record<AlertLevel, number>
  byType: Record<AlertType, number>
  activeAlerts: number
  acknowledgedAlerts: number
  lastAlertAt: number | null
}
