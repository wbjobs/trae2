export interface DataSource {
  id: string
  name: string
  type: 'file' | 'database' | 'api' | 'syslog'
  config: Record<string, any>
  connected: boolean
  lastSync?: string
  createdAt: string
  updatedAt: string
}

export interface DashboardConfig {
  id: string
  name: string
  components: any[]
  layout: 'grid' | 'free'
  filters: Record<string, any>
  createdBy?: string
  createdAt: string
  updatedAt: string
}

export interface ShardInfo {
  shardId: number
  tableName: string
  recordCount: number
  sizeBytes: number
}

export interface TableInfo {
  baseName: string
  shardCount: number
  shards: ShardInfo[]
  totalRecords: number
  totalSizeBytes: number
}

export interface QueryResult<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
}

export interface HealthStatus {
  database: 'online' | 'offline' | 'degraded'
  redis: 'online' | 'offline'
  diskUsage: number
  memoryUsage: number
  shardStatus: ShardInfo[]
}