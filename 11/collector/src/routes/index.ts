import { Router, Request, Response } from 'express'
import { elasticsearchService } from '../services/elasticsearch'
import { redisService } from '../services/redis'
import { fileLogCollector } from '../services/fileCollector'
import { metricsCollector } from '../services/metrics'
import { LogParser } from '../utils/logParser'
import { traceContextManager } from '../utils/traceContext'
import { createLogger } from '../utils/logger'
import type { LogFilter, LogEntry } from '../types'

const logger = createLogger('routes')

const router = Router()

const extractTraceHeaders = (req: Request): { traceId?: string; spanId?: string; parentSpanId?: string } => {
  return {
    traceId: req.headers['x-trace-id'] as string,
    spanId: req.headers['x-span-id'] as string,
    parentSpanId: req.headers['x-parent-span-id'] as string
  }
}

router.get('/health', async (req: Request, res: Response) => {
  const metrics = metricsCollector.getMetrics()

  res.json({
    success: true,
    message: 'Log collector is running',
    data: {
      nodeName: process.env.NODE_NAME,
      platform: process.platform,
      timestamp: new Date().toISOString(),
      elasticsearch: elasticsearchService.isConnected(),
      redis: redisService.isConnected(),
      watchedFiles: fileLogCollector.getWatchedFiles(),
      bufferSize: fileLogCollector.getBufferSize(),
      metrics
    }
  })
})

router.post('/logs/query', async (req: Request, res: Response) => {
  try {
    const filter: LogFilter = req.body
    const page = filter.page || 1
    const pageSize = filter.pageSize || 20

    const cacheKey = JSON.stringify(filter)
    const cachedResult = await redisService.getCachedLogStats(cacheKey)
    if (cachedResult && filter.traceId) {
    }

    const result = await elasticsearchService.queryLogs(filter)
    const hasMore = (page * pageSize) < result.total

    res.json({
      success: true,
      data: result.data,
      total: result.total,
      page,
      pageSize,
      hasMore,
      took: result.took
    })
  } catch (error) {
    logger.error('Query logs failed:', error)
    res.status(500).json({
      success: false,
      message: '查询日志失败'
    })
  }
})

router.get('/logs/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const result = await elasticsearchService.queryLogs({ traceId: id })

    if (result.data.length === 0) {
      return res.status(404).json({
        success: false,
        message: '日志不存在'
      })
    }

    res.json({
      success: true,
      data: result.data[0]
    })
  } catch (error) {
    logger.error('Get log failed:', error)
    res.status(500).json({
      success: false,
      message: '获取日志失败'
    })
  }
})

router.post('/logs/stats', async (req: Request, res: Response) => {
  try {
    const filter: LogFilter = req.body
    const stats = await elasticsearchService.getLogStats(filter)

    res.json({
      success: true,
      data: stats
    })
  } catch (error) {
    logger.error('Get log stats failed:', error)
    res.status(500).json({
      success: false,
      message: '获取日志统计失败'
    })
  }
})

router.get('/logs/levels', (req: Request, res: Response) => {
  res.json(['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'])
})

router.get('/logs/services', async (req: Request, res: Response) => {
  // In production, this would query Elasticsearch for distinct services
  res.json([
    'gateway-service',
    'log-collector',
    'storage-service',
    'auth-service',
    'user-service',
    'order-service'
  ])
})

router.get('/logs/nodes', async (req: Request, res: Response) => {
  res.json([
    'node-01',
    'node-02',
    'node-03'
  ])
})

router.post('/logs/ingest', async (req: Request, res: Response) => {
  try {
    const logData = req.body
    const traceHeaders = extractTraceHeaders(req)
    let logEntries: LogEntry[] = []

    if (Array.isArray(logData)) {
      logEntries = logData.map((log) => {
        const entry = LogParser.normalizeLogEntry({
          ...log,
          traceId: log.traceId || traceHeaders.traceId,
          spanId: log.spanId || traceHeaders.spanId,
          parentSpanId: log.parentSpanId || traceHeaders.parentSpanId
        })
        return entry
      })
    } else {
      logEntries = [LogParser.normalizeLogEntry({
        ...logData,
        traceId: logData.traceId || traceHeaders.traceId,
        spanId: logData.spanId || traceHeaders.spanId,
        parentSpanId: logData.parentSpanId || traceHeaders.parentSpanId
      })]
    }

    await elasticsearchService.bulkIndexLogs(logEntries)

    logger.info(`Ingested ${logEntries.length} logs`, {
      traceId: traceHeaders.traceId
    })

    res.json({
      success: true,
      message: `成功接收 ${logEntries.length} 条日志`,
      count: logEntries.length,
      traceId: traceHeaders.traceId
    })
  } catch (error) {
    logger.error('Ingest logs failed:', error)
    res.status(500).json({
      success: false,
      message: '日志接收失败'
    })
  }
})

router.get('/trace/:traceId', async (req: Request, res: Response) => {
  try {
    const { traceId } = req.params

    const cachedTrace = await redisService.getCachedTrace(traceId)
    if (cachedTrace) {
      return res.json({
        success: true,
        data: cachedTrace,
        cached: true
      })
    }

    const trace = await elasticsearchService.getTraceByTraceId(traceId)

    if (!trace) {
      return res.status(404).json({
        success: false,
        message: 'Trace ID 不存在'
      })
    }

    await redisService.cacheTrace(traceId, trace, 3600)

    res.json({
      success: true,
      data: trace
    })
  } catch (error) {
    logger.error('Get trace failed:', error)
    res.status(500).json({
      success: false,
      message: '获取链路追踪失败'
    })
  }
})

router.post('/trace/list', async (req: Request, res: Response) => {
  try {
    const filter: LogFilter = req.body

    const result = await elasticsearchService.queryLogs({
      ...filter,
      level: undefined
    })

    const traceIds = [...new Set(result.data.map((log) => log.traceId))]
    const traces = []

    for (const traceId of traceIds.slice(0, 20)) {
      const trace = await elasticsearchService.getTraceByTraceId(traceId)
      if (trace) {
        traces.push(trace)
      }
    }

    res.json({
      success: true,
      data: traces,
      total: traces.length
    })
  } catch (error) {
    logger.error('Get trace list failed:', error)
    res.status(500).json({
      success: false,
      message: '获取链路列表失败'
    })
  }
})

router.get('/trace/:traceId/timeline', async (req: Request, res: Response) => {
  try {
    const { traceId } = req.params
    const trace = await elasticsearchService.getTraceByTraceId(traceId)

    if (!trace) {
      return res.status(404).json({
        success: false,
        message: 'Trace ID 不存在'
      })
    }

    const timeline = trace.nodes
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .map((node) => ({
        spanId: node.spanId,
        service: node.service,
        timestamp: node.timestamp,
        status: node.status,
        duration: node.duration
      }))

    res.json({
      success: true,
      data: timeline
    })
  } catch (error) {
    logger.error('Get trace timeline failed:', error)
    res.status(500).json({
      success: false,
      message: '获取时间线失败'
    })
  }
})

router.post('/trace/compare', async (req: Request, res: Response) => {
  try {
    const { traceIds } = req.body

    if (!Array.isArray(traceIds) || traceIds.length < 2) {
      return res.status(400).json({
        success: false,
        message: '需要至少两个 Trace ID 进行比较'
      })
    }

    const traces = []

    for (const traceId of traceIds) {
      const trace = await elasticsearchService.getTraceByTraceId(traceId)
      if (trace) {
        traces.push(trace)
      }
    }

    res.json({
      success: true,
      data: traces
    })
  } catch (error) {
    logger.error('Compare traces failed:', error)
    res.status(500).json({
      success: false,
      message: '链路比较失败'
    })
  }
})

router.get('/clusters', async (req: Request, res: Response) => {
  try {
    const { timeRange, severity } = req.query as any
    const clusters = await elasticsearchService.getAnomalyClusters(timeRange, severity)

    res.json({
      success: true,
      data: clusters
    })
  } catch (error) {
    logger.error('Get clusters failed:', error)
    res.status(500).json({
      success: false,
      message: '获取异常聚类失败'
    })
  }
})

router.get('/clusters/:clusterId', async (req: Request, res: Response) => {
  try {
    const { clusterId } = req.params
    const clusters = await elasticsearchService.getAnomalyClusters()

    const cluster = clusters.find((c) => c.clusterId === clusterId)

    if (!cluster) {
      return res.status(404).json({
        success: false,
        message: '聚类不存在'
      })
    }

    res.json({
      success: true,
      data: cluster
    })
  } catch (error) {
    logger.error('Get cluster failed:', error)
    res.status(500).json({
      success: false,
      message: '获取聚类详情失败'
    })
  }
})

router.get('/clusters/:clusterId/logs', async (req: Request, res: Response) => {
  try {
    const { clusterId } = req.params
    const { page = 1, pageSize = 10 } = req.query as any

    const clusters = await elasticsearchService.getAnomalyClusters()
    const cluster = clusters.find((c) => c.clusterId === clusterId)

    if (!cluster) {
      return res.status(404).json({
        success: false,
        message: '聚类不存在'
      })
    }

    const startIndex = (page - 1) * pageSize
    const endIndex = startIndex + pageSize
    const pagedLogs = cluster.sampleLogs.slice(startIndex, endIndex)

    res.json({
      success: true,
      data: pagedLogs,
      total: cluster.sampleLogs.length
    })
  } catch (error) {
    logger.error('Get cluster logs failed:', error)
    res.status(500).json({
      success: false,
      message: '获取聚类日志失败'
    })
  }
})

router.get('/clusters/patterns', async (req: Request, res: Response) => {
  try {
    const { timeRange } = req.query as any
    const clusters = await elasticsearchService.getAnomalyClusters(timeRange)

    const patterns = clusters.map((cluster) => ({
      pattern: cluster.pattern,
      count: cluster.count,
      severity: cluster.severity
    }))

    res.json({
      success: true,
      data: patterns
    })
  } catch (error) {
    logger.error('Get patterns failed:', error)
    res.status(500).json({
      success: false,
      message: '获取异常模式失败'
    })
  }
})

router.get('/metrics', async (req: Request, res: Response) => {
  try {
    const metrics = await metricsCollector.collect()

    res.json({
      success: true,
      data: metrics
    })
  } catch (error) {
    logger.error('Get metrics failed:', error)
    res.status(500).json({
      success: false,
      message: '获取指标失败'
    })
  }
})

router.post('/collect/files', async (req: Request, res: Response) => {
  try {
    const { sources } = req.body

    if (!Array.isArray(sources)) {
      return res.status(400).json({
        success: false,
        message: '数据源格式错误'
      })
    }

    const results = []

    for (const source of sources) {
      try {
        await fileLogCollector.addFile(source)
        results.push({ source: source.name, success: true })
      } catch (error: any) {
        results.push({ source: source.name, success: false, error: error.message })
      }
    }

    res.json({
      success: true,
      data: results
    })
  } catch (error) {
    logger.error('Add file sources failed:', error)
    res.status(500).json({
      success: false,
      message: '添加文件数据源失败'
    })
  }
})

router.delete('/collect/files', async (req: Request, res: Response) => {
  try {
    const watchedFiles = fileLogCollector.getWatchedFiles()
    for (const filePath of watchedFiles) {
      await fileLogCollector.removeFile(filePath)
    }

    res.json({
      success: true,
      message: `已停止监控 ${watchedFiles.length} 个文件`
    })
  } catch (error) {
    logger.error('Remove file sources failed:', error)
    res.status(500).json({
      success: false,
      message: '移除文件数据源失败'
    })
  }
})

router.get('/collect/status', (req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      watchedFiles: fileLogCollector.getWatchedFiles(),
      bufferSize: fileLogCollector.getBufferSize(),
      elasticsearchConnected: elasticsearchService.isConnected(),
      redisConnected: redisService.isConnected()
    }
  })
})

export default router