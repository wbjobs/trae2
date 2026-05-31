import { Client } from '@elastic/elasticsearch'
import { config } from '../config'
import { createLogger } from '../utils/logger'
import type { LogEntry, LogFilter, TraceLink, AnomalyCluster } from '../types'

const logger = createLogger('elasticsearch')

const BULK_RETRY_LIMIT = 3
const BULK_RETRY_DELAY = 1000
const BULK_MAX_SIZE = 500

class ElasticsearchService {
  private client: Client
  private connected: boolean = false
  private processedIds: Set<string> = new Set()
  private maxProcessedIds: number = 50000

  constructor() {
    this.client = new Client({
      node: `http://${config.elasticsearch.host}`,
      auth: {
        username: config.elasticsearch.user,
        password: config.elasticsearch.password
      },
      maxRetries: 3,
      requestTimeout: 30000,
      sniffOnStart: false,
      sniffInterval: false
    })
  }

  async connect(): Promise<boolean> {
    try {
      await this.client.ping()
      this.connected = true
      logger.info('Connected to Elasticsearch')
      return true
    } catch (error) {
      logger.error('Failed to connect to Elasticsearch:', error)
      this.connected = false
      return false
    }
  }

  isConnected(): boolean {
    return this.connected
  }

  private checkIdempotent(id: string): boolean {
    if (this.processedIds.has(id)) {
      return false
    }

    this.processedIds.add(id)

    if (this.processedIds.size > this.maxProcessedIds) {
      const entries = Array.from(this.processedIds)
      this.processedIds = new Set(entries.slice(entries.length / 2))
      logger.debug(`Trimmed processed IDs cache to ${this.processedIds.size}`)
    }

    return true
  }

  async ensureIndex(index: string): Promise<void> {
    const exists = await this.client.indices.exists({ index })
    if (!exists) {
      await this.client.indices.create({
        index,
        body: {
          settings: {
            number_of_shards: 3,
            number_of_replicas: 1,
            refresh_interval: '5s'
          },
          mappings: {
            properties: {
              id: { type: 'keyword' },
              traceId: { type: 'keyword' },
              spanId: { type: 'keyword' },
              parentSpanId: { type: 'keyword' },
              timestamp: { type: 'date' },
              level: { type: 'keyword' },
              service: { type: 'keyword' },
              node: { type: 'keyword' },
              os: { type: 'keyword' },
              message: {
                type: 'text',
                analyzer: 'standard',
                fields: {
                  keyword: { type: 'keyword', ignore_above: 256 }
                }
              },
              stackTrace: { type: 'text' },
              metadata: { type: 'object', enabled: true },
              tags: { type: 'keyword' }
            }
          }
        }
      })
      logger.info(`Created index: ${index}`)
    }
  }

  getLogIndex(date: Date = new Date()): string {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `logs-${year}.${month}.${day}`
  }

  async indexLog(logEntry: LogEntry): Promise<void> {
    const index = this.getLogIndex(new Date(logEntry.timestamp))
    await this.ensureIndex(index)

    if (!this.checkIdempotent(logEntry.id)) {
      logger.debug(`Skipping duplicate log: ${logEntry.id}`)
      return
    }

    await this.client.index({
      index,
      id: logEntry.id,
      body: logEntry,
      op_type: 'create'
    })
  }

  async bulkIndexLogs(logEntries: LogEntry[]): Promise<void> {
    if (logEntries.length === 0) return

    const filteredEntries = logEntries.filter(entry => this.checkIdempotent(entry.id))
    if (filteredEntries.length === 0) {
      logger.debug('All entries are duplicates, skipping bulk index')
      return
    }

    const chunks: LogEntry[][] = []
    for (let i = 0; i < filteredEntries.length; i += BULK_MAX_SIZE) {
      chunks.push(filteredEntries.slice(i, i + BULK_MAX_SIZE))
    }

    for (const chunk of chunks) {
      await this.bulkIndexChunk(chunk)
    }
  }

  private async bulkIndexChunk(logEntries: LogEntry[]): Promise<void> {
    let lastError: Error | null = null

    for (let attempt = 0; attempt <= BULK_RETRY_LIMIT; attempt++) {
      try {
        const operations: any[] = []
        for (const log of logEntries) {
          const index = this.getLogIndex(new Date(log.timestamp))
          operations.push({ index: { _index: index, _id: log.id, op_type: 'create' } })
          operations.push(log)
        }

        const bulkResponse = await this.client.bulk({
          operations,
          refresh: 'false'
        })

        if (bulkResponse.errors) {
          const retryableErrors: any[] = []
          const fatalErrors: any[] = []

          bulkResponse.items.forEach((action: any, i: number) => {
            const operation = Object.keys(action)[0]
            if (action[operation].error) {
              const status = action[operation].status
              if (status === 409 || status === 404) {
                logger.debug(`Skipping document with status ${status}: ${action[operation].error?.reason}`)
              } else if (status >= 500 || status === 429) {
                retryableErrors.push({
                  status,
                  error: action[operation].error,
                  document: logEntries[Math.floor(i / 2)]
                })
              } else {
                fatalErrors.push({
                  status,
                  error: action[operation].error,
                  document: logEntries[Math.floor(i / 2)]
                })
              }
            }
          })

          if (retryableErrors.length > 0 && attempt < BULK_RETRY_LIMIT) {
            logger.warn(`Bulk index had ${retryableErrors.length} retryable errors, attempt ${attempt + 1}/${BULK_RETRY_LIMIT + 1}`)
            const retryDocuments = retryableErrors.map(e => e.document)
            if (retryDocuments.length > 0) {
              const delay = BULK_RETRY_DELAY * (attempt + 1)
              await this.delay(delay)
              logEntries = retryDocuments
              continue
            }
          }

          if (fatalErrors.length > 0) {
            logger.error(`Bulk index had ${fatalErrors.length} fatal errors`, {
              errors: fatalErrors.slice(0, 5)
            })
          }

          return
        }

        logger.debug(`Successfully indexed ${logEntries.length} documents`)
        return
      } catch (error: any) {
        lastError = error
        logger.warn(`Bulk index attempt ${attempt + 1}/${BULK_RETRY_LIMIT + 1} failed: ${error.message}`)

        if (attempt < BULK_RETRY_LIMIT) {
          const delay = BULK_RETRY_DELAY * (attempt + 1)
          await this.delay(delay)
        }
      }
    }

    throw lastError || new Error('Bulk index failed after all retries')
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  async queryLogs(filter: LogFilter): Promise<{ data: LogEntry[]; total: number; took?: number }> {
    const startTime = Date.now()
    const must: any[] = []
    const should: any[] = []

    if (filter.traceId) {
      must.push({ term: { traceId: filter.traceId } })
    }

    if (filter.level && filter.level.length > 0) {
      must.push({ terms: { level: filter.level } })
    }

    if (filter.service) {
      must.push({ term: { service: filter.service } })
    }

    if (filter.node) {
      must.push({ term: { node: filter.node } })
    }

    if (filter.os && filter.os.length > 0) {
      must.push({ terms: { os: filter.os } })
    }

    if (filter.startTime || filter.endTime) {
      const range: any = {}
      if (filter.startTime) range.gte = filter.startTime
      if (filter.endTime) range.lte = filter.endTime
      must.push({ range: { timestamp: range } })
    }

    if (filter.keyword) {
      should.push({
        match: { message: filter.keyword }
      })
      should.push({
        wildcard: { 'message.keyword': `*${filter.keyword}*` }
      })
    }

    const page = filter.page || 1
    const pageSize = filter.pageSize || 20
    const from = (page - 1) * pageSize

    const body: any = {
      query: {
        bool: {
          must,
          ...(should.length > 0 && { should, minimum_should_match: 1 })
        }
      },
      sort: [{ timestamp: { order: 'desc' } }],
      from,
      size: Math.min(pageSize, 100),
      track_total_hits: true
    }

    const indices = this.getDateRangeIndices(
      filter.startTime ? new Date(filter.startTime) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      filter.endTime ? new Date(filter.endTime) : new Date()
    )

    const response = await this.client.search({
      index: indices.length > 0 ? indices : undefined,
      body
    })

    const data = response.hits.hits.map((hit: any) => hit._source as LogEntry)
    const total = typeof response.hits.total === 'number'
      ? response.hits.total
      : response.hits.total?.value || 0

    return {
      data,
      total,
      took: Date.now() - startTime
    }
  }

  async getLogStats(filter: LogFilter): Promise<Record<string, number>> {
    const must: any[] = []

    if (filter.service) {
      must.push({ term: { service: filter.service } })
    }

    if (filter.node) {
      must.push({ term: { node: filter.node } })
    }

    if (filter.startTime || filter.endTime) {
      const range: any = {}
      if (filter.startTime) range.gte = filter.startTime
      if (filter.endTime) range.lte = filter.endTime
      must.push({ range: { timestamp: range } })
    }

    const body = {
      size: 0,
      query: { bool: { must } },
      aggs: {
        by_level: {
          terms: { field: 'level', size: 10 }
        }
      }
    }

    const indices = this.getDateRangeIndices(
      filter.startTime ? new Date(filter.startTime) : new Date(Date.now() - 24 * 60 * 60 * 1000),
      filter.endTime ? new Date(filter.endTime) : new Date()
    )

    const response = await this.client.search({
      index: indices.length > 0 ? indices : undefined,
      body
    })

    const stats: Record<string, number> = {
      DEBUG: 0,
      INFO: 0,
      WARN: 0,
      ERROR: 0,
      FATAL: 0
    }

    const aggregations: any = response.aggregations
    if (aggregations?.by_level?.buckets) {
      for (const bucket of aggregations.by_level.buckets) {
        stats[bucket.key] = bucket.doc_count
      }
    }

    return stats
  }

  async getTraceByTraceId(traceId: string): Promise<TraceLink | null> {
    const body = {
      query: { term: { traceId } },
      sort: [{ timestamp: { order: 'asc' } }],
      size: 1000
    }

    const response = await this.client.search({
      index: 'logs-*',
      body
    })

    const logs = response.hits.hits.map((hit: any) => hit._source as LogEntry)
    if (logs.length === 0) return null

    const nodes = logs.map((log) => ({
      spanId: log.spanId,
      parentSpanId: log.parentSpanId,
      service: log.service,
      timestamp: log.timestamp,
      duration: 0,
      status: (log.level === 'ERROR' || log.level === 'FATAL') ? 'error' : 'success' as 'success' | 'error',
      logEntry: log
    }))

    const nodeMap = new Map<string, typeof nodes[0]>()
    nodes.forEach((node) => nodeMap.set(node.spanId, node))

    const breakpoints: { spanId: string; reason: string; timestamp: string }[] = []
    const childrenMap = new Map<string, string[]>()

    nodes.forEach((node) => {
      if (node.parentSpanId && nodeMap.has(node.parentSpanId)) {
        const parent = nodeMap.get(node.parentSpanId)!
        const parentTime = new Date(parent.timestamp).getTime()
        const nodeTime = new Date(node.timestamp).getTime()
        node.duration = Math.max(0, nodeTime - parentTime)

        if (!childrenMap.has(node.parentSpanId)) {
          childrenMap.set(node.parentSpanId, [])
        }
        childrenMap.get(node.parentSpanId)!.push(node.spanId)
      }

      if (node.status === 'error') {
        breakpoints.push({
          spanId: node.spanId,
          reason: node.logEntry?.message || 'Error occurred',
          timestamp: node.timestamp
        })
      }
    })

    nodes.forEach((node) => {
      const children = childrenMap.get(node.spanId) || []
      node.childrenCount = children.length

      if (children.length > 0) {
        const childrenTotalDuration = children.reduce((sum, childId) => {
          const child = nodeMap.get(childId)
          return sum + (child?.duration || 0)
        }, 0)
        node.selfTime = Math.max(0, node.duration - childrenTotalDuration)
      } else {
        node.selfTime = node.duration
      }
    })

    const visited = new Set<string>()
    const spanToNode = new Map(nodes.map(n => [n.spanId, n]))

    const checkContinuity = (spanId: string): boolean => {
      if (visited.has(spanId)) return true
      visited.add(spanId)

      const node = spanToNode.get(spanId)
      if (!node) return false

      if (!node.parentSpanId) return true

      const parent = spanToNode.get(node.parentSpanId)
      if (!parent) {
        if (!breakpoints.find(b => b.spanId === spanId)) {
          breakpoints.push({
            spanId,
            reason: '链路断裂：父节点不存在',
            timestamp: node.timestamp
          })
          node.isBreakpoint = true
          node.breakpointReason = '父节点不存在'
        }
        return false
      }

      const timeGap = new Date(node.timestamp).getTime() - new Date(parent.timestamp).getTime()
      if (timeGap > 30000) {
        if (!breakpoints.find(b => b.spanId === spanId)) {
          breakpoints.push({
            spanId,
            reason: `超时：与父节点时间差 ${timeGap}ms 超过阈值`,
            timestamp: node.timestamp
          })
          node.isBreakpoint = true
          node.breakpointReason = `调用超时 ${timeGap}ms`
          node.status = 'timeout'
        }
      }

      return checkContinuity(node.parentSpanId)
    }

    nodes.forEach(node => checkContinuity(node.spanId))

    const edges: { from: string; to: string; duration: number; networkLatency?: number }[] = []
    nodes.forEach((node) => {
      if (node.parentSpanId && nodeMap.has(node.parentSpanId)) {
        const parent = nodeMap.get(node.parentSpanId)!
        const networkLatency = parent.service !== node.service
          ? Math.max(0, Math.floor(node.duration * 0.1))
          : undefined

        edges.push({
          from: node.parentSpanId,
          to: node.spanId,
          duration: node.duration,
          networkLatency
        })
      }
    })

    const totalDuration = nodes.length > 0
      ? new Date(nodes[nodes.length - 1].timestamp).getTime() - new Date(nodes[0].timestamp).getTime()
      : 0

    const hasError = nodes.some((n) => n.status === 'error')
    const hasTimeout = nodes.some((n) => n.status === 'timeout')
    const hasBroken = breakpoints.length > 0

    let status: 'success' | 'error' | 'timeout' | 'broken' = 'success'
    if (hasError) status = 'error'
    else if (hasTimeout) status = 'timeout'
    else if (hasBroken) status = 'broken'

    const serviceStatsMap = new Map<string, {
      totalDuration: number
      callCount: number
      errorCount: number
      durations: number[]
    }>()

    nodes.forEach((node) => {
      if (!serviceStatsMap.has(node.service)) {
        serviceStatsMap.set(node.service, {
          totalDuration: 0,
          callCount: 0,
          errorCount: 0,
          durations: []
        })
      }
      const stats = serviceStatsMap.get(node.service)!
      stats.totalDuration += node.duration
      stats.callCount++
      if (node.status === 'error') stats.errorCount++
      stats.durations.push(node.duration)
    })

    const serviceStats = Array.from(serviceStatsMap.entries()).map(([service, stats]) => ({
      service,
      totalDuration: stats.totalDuration,
      callCount: stats.callCount,
      errorCount: stats.errorCount,
      avgDuration: Math.round(stats.totalDuration / stats.callCount),
      maxDuration: Math.max(...stats.durations),
      minDuration: Math.min(...stats.durations)
    }))

    const criticalPath = this.findCriticalPath(nodes, edges)

    return {
      nodes,
      edges,
      totalDuration,
      status,
      breakpoints: breakpoints.length > 0 ? breakpoints : undefined,
      serviceStats: serviceStats.length > 0 ? serviceStats : undefined,
      criticalPath: criticalPath.length > 0 ? criticalPath : undefined
    }
  }

  private findCriticalPath(
    nodes: TraceNode[],
    edges: { from: string; to: string; duration: number }[]
  ): string[] {
    if (nodes.length === 0) return []

    const nodeMap = new Map(nodes.map(n => [n.spanId, n]))
    const adjMap = new Map<string, { to: string; duration: number }[]>()

    edges.forEach(edge => {
      if (!adjMap.has(edge.from)) {
        adjMap.set(edge.from, [])
      }
      adjMap.get(edge.from)!.push({ to: edge.to, duration: edge.duration })
    })

    let maxPath: string[] = []
    let maxDuration = 0

    const dfs = (spanId: string, path: string[], duration: number) => {
      const children = adjMap.get(spanId) || []
      if (children.length === 0) {
        if (duration > maxDuration) {
          maxDuration = duration
          maxPath = [...path]
        }
        return
      }

      children.forEach(child => {
        dfs(child.to, [...path, child.to], duration + child.duration)
      })
    }

    const roots = nodes.filter(n => !n.parentSpanId || !nodeMap.has(n.parentSpanId))
    roots.forEach(root => {
      dfs(root.spanId, [root.spanId], 0)
    })

    return maxPath
  }

  async getAnomalyClusters(timeRange?: string, severity?: string): Promise<AnomalyCluster[]> {
    const must: any[] = [
      { terms: { level: ['ERROR', 'FATAL'] } }
    ]

    if (timeRange) {
      const now = Date.now()
      const ranges: Record<string, number> = {
        '1h': 60 * 60 * 1000,
        '6h': 6 * 60 * 60 * 1000,
        '24h': 24 * 60 * 60 * 1000,
        '7d': 7 * 24 * 60 * 60 * 1000
      }
      const rangeMs = ranges[timeRange] || 24 * 60 * 60 * 1000
      must.push({
        range: {
          timestamp: { gte: new Date(now - rangeMs).toISOString() }
        }
      })
    }

    const body = {
      size: 0,
      query: { bool: { must } },
      aggs: {
        by_pattern: {
          terms: {
            script: {
              source: "def msg = doc['message.keyword'].value; if (msg != null) { return msg.replaceAll('\\\\d+', 'N').replaceAll('[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}', 'UUID').substring(0, Math.min(msg.length(), 100)); } return 'unknown';",
              lang: 'painless'
            },
            size: 50
          },
          aggs: {
            sample_logs: {
              top_hits: {
                size: 5,
                sort: [{ timestamp: { order: 'desc' } }]
              }
            },
            first_seen: { min: { field: 'timestamp' } },
            last_seen: { max: { field: 'timestamp' } },
            services: { terms: { field: 'service', size: 10 } }
          }
        }
      }
    }

    const response = await this.client.search({
      index: 'logs-*',
      body
    })

    const clusters: AnomalyCluster[] = []
    const aggregations: any = response.aggregations

    if (aggregations?.by_pattern?.buckets) {
      for (const bucket of aggregations.by_pattern.buckets) {
        const sampleLogs = bucket.sample_logs.hits.hits.map((hit: any) => hit._source as LogEntry)
        const count = bucket.doc_count

        let clusterSeverity: 'low' | 'medium' | 'high' | 'critical' = 'low'
        if (count > 100) clusterSeverity = 'critical'
        else if (count > 50) clusterSeverity = 'high'
        else if (count > 10) clusterSeverity = 'medium'

        if (severity && clusterSeverity !== severity) continue

        clusters.push({
          clusterId: `cluster-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          pattern: bucket.key,
          count,
          severity: clusterSeverity,
          sampleLogs,
          firstSeen: bucket.first_seen.value_as_string,
          lastSeen: bucket.last_seen.value_as_string,
          affectedServices: bucket.services.buckets.map((b: any) => b.key)
        })
      }
    }

    return clusters.sort((a, b) => b.count - a.count)
  }

  private getDateRangeIndices(startDate: Date, endDate: Date): string[] {
    const indices: string[] = []
    const current = new Date(startDate)

    while (current <= endDate) {
      indices.push(this.getLogIndex(current))
      current.setDate(current.getDate() + 1)
    }

    return indices
  }

  async cleanupOldIndices(): Promise<number> {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - config.logRetentionDays)

    const indices = await this.client.cat.indices({
      format: 'json',
      index: 'logs-*'
    })

    let deletedCount = 0

    for (const indexInfo of indices as any[]) {
      const indexName = indexInfo.index
      const match = indexName.match(/logs-(\d{4})\.(\d{2})\.(\d{2})/)
      if (match) {
        const indexDate = new Date(
          parseInt(match[1]),
          parseInt(match[2]) - 1,
          parseInt(match[3])
        )
        if (indexDate < cutoffDate) {
          await this.client.indices.delete({ index: indexName })
          deletedCount++
          logger.info(`Deleted old index: ${indexName}`)
        }
      }
    }

    return deletedCount
  }

  async forceRefresh(): Promise<void> {
    try {
      await this.client.indices.refresh({ index: 'logs-*' })
      logger.info('Forced refresh of all log indices')
    } catch (error) {
      logger.error('Force refresh failed:', error)
    }
  }

  async getHealth(): Promise<any> {
    try {
      const health = await this.client.cluster.health()
      return health
    } catch (error) {
      logger.error('Failed to get cluster health:', error)
      return null
    }
  }
}

export const elasticsearchService = new ElasticsearchService()
export default elasticsearchService