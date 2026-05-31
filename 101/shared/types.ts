export type SignalType = 'video' | 'audio' | 'data'
export type SignalProtocol = 'ST2110' | 'SDI' | 'NDI'
export type SignalStatus = 'active' | 'standby' | 'offline' | 'error'
export type TargetType = 'encoder' | 'decoder' | 'router' | 'monitor'
export type TargetStatus = 'online' | 'offline'
export type Severity = 'info' | 'warning' | 'critical'
export type AlertType = 'black_frame' | 'freeze_frame' | 'silence' | 'bandwidth_anomaly' | 'latency_anomaly' | 'packet_loss'
export type AlertAction = 'alert' | 'switch' | 'alert_and_switch'
export type SwitchReason = 'manual' | 'emergency' | 'auto-failover'

export interface SignalSource {
  id: string
  name: string
  type: SignalType
  protocol: SignalProtocol
  status: SignalStatus
  bandwidth: number
  latency: number
  packetLoss: number
  targetIds: string[]
}

export interface SignalTarget {
  id: string
  name: string
  type: TargetType
  status: TargetStatus
  sourceId: string | null
  maxBandwidth: number
}

export interface RouteConfig {
  id: string
  sourceId: string
  targetId: string
  bandwidth: number
  priority: number
  isActive: boolean
  createdAt: string
}

export interface RouteSwitchRequest {
  routeId: string
  newSourceId: string
  reason: SwitchReason
}

export interface RouteSwitchResponse {
  success: boolean
  message: string
  previousState: RouteConfig
  newState: RouteConfig
}

export interface RouteHistory {
  id: string
  routeId: string
  fromSourceId: string
  toSourceId: string
  reason: SwitchReason
  operator: string
  timestamp: string
}

export interface AlertRule {
  id: string
  name: string
  type: AlertType
  threshold: number
  duration: number
  severity: Severity
  enabled: boolean
  action: AlertAction
}

export interface AlertEvent {
  id: string
  ruleId: string
  signalId: string
  type: AlertType
  severity: Severity
  message: string
  value: number
  threshold: number
  timestamp: string
  resolved: boolean
}

export interface TimeSeriesQuery {
  measurement: string
  signalId?: string
  startTime: string
  endTime: string
  aggregation?: 'mean' | 'max' | 'min' | 'sum'
  groupBy?: '1m' | '5m' | '1h' | '1d'
}

export interface TimeSeriesDataPoint {
  time: string
  value: number
}

export interface TimeSeriesData {
  measurement: string
  tags: Record<string, string>
  values: TimeSeriesDataPoint[]
}

export interface DashboardKPI {
  totalSignals: number
  activeSignals: number
  averageBandwidth: number
  averageLatency: number
  alertCount: number
  onlineTargets: number
}

export interface WSMessage {
  type: 'status_update' | 'alert' | 'route_change' | 'kpi_update' | 'priority_schedule' | 'stream_interrupt'
  payload: unknown
}

export interface PriorityScheduleResult {
  targetId: string
  maxBandwidth: number
  allocated: { routeId: string; priority: number; bandwidth: number; preempted: boolean }[]
  totalAllocated: number
  overBudget: boolean
}

export interface StreamInterruptEvent {
  signalId: string
  signalName: string
  reason: 'offline' | 'error' | 'zero_bandwidth' | 'high_latency' | 'high_packet_loss'
  previousStatus: SignalStatus
  backupSourceId: string | null
  backupSourceName: string | null
  switchInitiated: boolean
  timestamp: string
}

export interface TopologyNode {
  id: string
  label: string
  type: 'source' | 'target' | 'router'
  status: SignalStatus | TargetStatus
  x: number
  y: number
}

export interface TopologyEdge {
  id: string
  from: string
  to: string
  bandwidth: number
  maxBandwidth: number
  isActive: boolean
}
