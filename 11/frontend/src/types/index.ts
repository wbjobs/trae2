export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL'
export type OSType = 'Linux' | 'Windows'
export type LogStatus = 'success' | 'error' | 'pending' | 'timeout' | 'broken'

export interface LogEntry {
  id: string
  traceId: string
  spanId: string
  parentSpanId: string
  timestamp: string
  level: LogLevel
  service: string
  node: string
  os: OSType
  message: string
  stackTrace?: string
  metadata?: Record<string, any>
  tags?: string[]
}

export interface LogFilter {
  traceId?: string
  level?: LogLevel[]
  service?: string
  node?: string
  os?: OSType[]
  startTime?: string
  endTime?: string
  keyword?: string
  tags?: string[]
  page?: number
  pageSize?: number
  scrollId?: string
}

export interface TraceNode {
  spanId: string
  parentSpanId: string
  service: string
  timestamp: string
  duration: number
  status: LogStatus
  logEntry?: LogEntry
  isBreakpoint?: boolean
  breakpointReason?: string
  selfTime?: number
  childrenCount?: number
}

export interface TraceLink {
  nodes: TraceNode[]
  edges: { from: string; to: string; duration: number; networkLatency?: number }[]
  totalDuration: number
  status: LogStatus
  breakpoints?: { spanId: string; reason: string; timestamp: string }[]
  serviceStats?: {
    service: string
    totalDuration: number
    callCount: number
    errorCount: number
    avgDuration: number
    maxDuration: number
    minDuration: number
  }[]
  criticalPath?: string[]
}

export interface BatchQueryResult<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  scrollId?: string
  hasMore: boolean
  took?: number
}

export interface AnomalyCluster {
  clusterId: string
  pattern: string
  count: number
  severity: 'low' | 'medium' | 'high' | 'critical'
  sampleLogs: LogEntry[]
  firstSeen: string
  lastSeen: string
  affectedServices: string[]
}

export interface DataSource {
  id: string
  name: string
  type: 'file' | 'database' | 'api' | 'syslog'
  config: Record<string, any>
  connected: boolean
  lastSync?: string
}

export interface LowCodeComponent {
  id: string
  type: 'filter' | 'chart' | 'table' | 'trace-view' | 'cluster-view'
  config: Record<string, any>
  position: { x: number; y: number }
  size: { width: number; height: number }
  dataSource?: string
}

export interface DashboardConfig {
  id: string
  name: string
  components: LowCodeComponent[]
  layout: 'grid' | 'free'
  filters: LogFilter
}