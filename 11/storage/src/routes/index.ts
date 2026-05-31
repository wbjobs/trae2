import { Router, Request, Response } from 'express'
import { databaseService } from '../services/database'
import { redisService } from '../services/redis'
import { createLogger } from '../utils/logger'
import type { DataSource, DashboardConfig } from '../types'

const logger = createLogger('routes')

const router = Router()

router.get('/health', async (req: Request, res: Response) => {
  try {
    const shardInfo = await databaseService.getShardInfo()

    res.json({
      success: true,
      message: 'Storage service is running',
      data: {
        database: databaseService.isConnected(),
        redis: redisService.isConnected(),
        shards: shardInfo,
        platform: process.platform,
        timestamp: new Date().toISOString()
      }
    })
  } catch (error) {
    logger.error('Health check failed:', error)
    res.status(500).json({
      success: false,
      message: 'Storage service health check failed'
    })
  }
})

router.get('/sources', async (req: Request, res: Response) => {
  try {
    const sources = await databaseService.getDataSources()

    res.json({
      success: true,
      data: sources
    })
  } catch (error) {
    logger.error('Get data sources failed:', error)
    res.status(500).json({
      success: false,
      message: '获取数据源列表失败'
    })
  }
})

router.get('/sources/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    const cached = await redisService.getCachedDataSource(id)
    if (cached) {
      return res.json({
        success: true,
        data: cached,
        cached: true
      })
    }

    const source = await databaseService.getDataSourceById(id)

    if (!source) {
      return res.status(404).json({
        success: false,
        message: '数据源不存在'
      })
    }

    await redisService.cacheDataSource(id, source)

    res.json({
      success: true,
      data: source
    })
  } catch (error) {
    logger.error('Get data source failed:', error)
    res.status(500).json({
      success: false,
      message: '获取数据源失败'
    })
  }
})

router.post('/sources', async (req: Request, res: Response) => {
  try {
    const { name, type, config, connected } = req.body

    if (!name || !type) {
      return res.status(400).json({
        success: false,
        message: '名称和类型不能为空'
      })
    }

    const source = await databaseService.createDataSource({
      name,
      type,
      config: config || {},
      connected: connected || false
    })

    res.status(201).json({
      success: true,
      data: source,
      message: '数据源创建成功'
    })
  } catch (error) {
    logger.error('Create data source failed:', error)
    res.status(500).json({
      success: false,
      message: '创建数据源失败'
    })
  }
})

router.put('/sources/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { name, type, config, connected } = req.body

    const source = await databaseService.updateDataSource(id, {
      name,
      type,
      config,
      connected
    })

    if (!source) {
      return res.status(404).json({
        success: false,
        message: '数据源不存在'
      })
    }

    await redisService.invalidateDataSourceCache(id)

    res.json({
      success: true,
      data: source,
      message: '数据源更新成功'
    })
  } catch (error) {
    logger.error('Update data source failed:', error)
    res.status(500).json({
      success: false,
      message: '更新数据源失败'
    })
  }
})

router.delete('/sources/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    const deleted = await databaseService.deleteDataSource(id)

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: '数据源不存在'
      })
    }

    await redisService.invalidateDataSourceCache(id)

    res.json({
      success: true,
      message: '数据源删除成功'
    })
  } catch (error) {
    logger.error('Delete data source failed:', error)
    res.status(500).json({
      success: false,
      message: '删除数据源失败'
    })
  }
})

router.post('/sources/:id/test', async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const source = await databaseService.getDataSourceById(id)

    if (!source) {
      return res.status(404).json({
        success: false,
        message: '数据源不存在'
      })
    }

    let success = false
    let message = '连接测试成功'

    if (source.type === 'file') {
      const fs = require('fs-extra')
      success = fs.existsSync(source.config?.path)
      if (!success) message = '文件路径不存在'
    } else if (source.type === 'database') {
      try {
        const { Pool } = require('pg')
        const pool = new Pool({
          host: source.config?.host,
          port: source.config?.port,
          database: source.config?.database,
          user: source.config?.username,
          password: source.config?.password
        })
        await pool.query('SELECT 1')
        await pool.end()
        success = true
      } catch (error: any) {
        message = `连接失败: ${error.message}`
      }
    } else if (source.type === 'api') {
      try {
        const response = await fetch(source.config?.url, {
          method: 'GET',
          timeout: 5000
        })
        success = response.ok
        if (!success) message = `API 返回状态码: ${response.status}`
      } catch (error: any) {
        message = `请求失败: ${error.message}`
      }
    } else {
      success = true
    }

    res.json({
      success,
      message
    })
  } catch (error) {
    logger.error('Test connection failed:', error)
    res.status(500).json({
      success: false,
      message: '连接测试失败'
    })
  }
})

router.get('/dashboards', async (req: Request, res: Response) => {
  try {
    const dashboards = await databaseService.getDashboards()

    res.json({
      success: true,
      data: dashboards
    })
  } catch (error) {
    logger.error('Get dashboards failed:', error)
    res.status(500).json({
      success: false,
      message: '获取仪表板列表失败'
    })
  }
})

router.get('/dashboards/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    const cached = await redisService.getCachedDashboard(id)
    if (cached) {
      return res.json({
        success: true,
        data: cached,
        cached: true
      })
    }

    const dashboard = await databaseService.getDashboardById(id)

    if (!dashboard) {
      return res.status(404).json({
        success: false,
        message: '仪表板不存在'
      })
    }

    await redisService.cacheDashboard(id, dashboard)

    res.json({
      success: true,
      data: dashboard
    })
  } catch (error) {
    logger.error('Get dashboard failed:', error)
    res.status(500).json({
      success: false,
      message: '获取仪表板失败'
    })
  }
})

router.post('/dashboards', async (req: Request, res: Response) => {
  try {
    const { name, components, layout, filters } = req.body

    if (!name) {
      return res.status(400).json({
        success: false,
        message: '名称不能为空'
      })
    }

    const dashboard = await databaseService.createDashboard({
      name,
      components: components || [],
      layout: layout || 'grid',
      filters: filters || {}
    })

    res.status(201).json({
      success: true,
      data: dashboard,
      message: '仪表板创建成功'
    })
  } catch (error) {
    logger.error('Create dashboard failed:', error)
    res.status(500).json({
      success: false,
      message: '创建仪表板失败'
    })
  }
})

router.put('/dashboards/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { name, components, layout, filters } = req.body

    const dashboard = await databaseService.updateDashboard(id, {
      name,
      components,
      layout,
      filters
    })

    if (!dashboard) {
      return res.status(404).json({
        success: false,
        message: '仪表板不存在'
      })
    }

    res.json({
      success: true,
      data: dashboard,
      message: '仪表板更新成功'
    })
  } catch (error) {
    logger.error('Update dashboard failed:', error)
    res.status(500).json({
      success: false,
      message: '更新仪表板失败'
    })
  }
})

router.delete('/dashboards/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    const deleted = await databaseService.deleteDashboard(id)

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: '仪表板不存在'
      })
    }

    res.json({
      success: true,
      message: '仪表板删除成功'
    })
  } catch (error) {
    logger.error('Delete dashboard failed:', error)
    res.status(500).json({
      success: false,
      message: '删除仪表板失败'
    })
  }
})

router.get('/tables/info', async (req: Request, res: Response) => {
  try {
    const tables = await databaseService.getTableInfo()

    res.json({
      success: true,
      data: tables
    })
  } catch (error) {
    logger.error('Get table info failed:', error)
    res.status(500).json({
      success: false,
      message: '获取表信息失败'
    })
  }
})

router.get('/shards/info', async (req: Request, res: Response) => {
  try {
    const shards = await databaseService.getShardInfo()

    res.json({
      success: true,
      data: shards
    })
  } catch (error) {
    logger.error('Get shard info failed:', error)
    res.status(500).json({
      success: false,
      message: '获取分片信息失败'
    })
  }
})

router.post('/cleanup', async (req: Request, res: Response) => {
  try {
    const deletedCount = await databaseService.cleanupOldData()

    res.json({
      success: true,
      message: `已清理 ${deletedCount} 条过期数据`,
      deletedCount
    })
  } catch (error) {
    logger.error('Cleanup failed:', error)
    res.status(500).json({
      success: false,
      message: '数据清理失败'
    })
  }
})

router.post('/logs/batch', async (req: Request, res: Response) => {
  try {
    const { entries } = req.body

    if (!Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({
        success: false,
        message: '日志数据不能为空'
      })
    }

    if (entries.length > 500) {
      return res.status(400).json({
        success: false,
        message: '批量写入不能超过 500 条'
      })
    }

    const successCount = await databaseService.executeWithRetry(async () => {
      return await databaseService.executeInTransaction(async (client) => {
        let inserted = 0

        for (const entry of entries) {
          const shardId = databaseService.getShardId(entry.traceId || '')
          const tableName = databaseService.getShardTableName(shardId)

          await client.query(
            `INSERT INTO ${tableName} (id, trace_id, span_id, parent_span_id, timestamp, level, service, node, os, message, stack_trace, metadata, tags)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
             ON CONFLICT (id) DO NOTHING`,
            [
              entry.id,
              entry.traceId || null,
              entry.spanId || null,
              entry.parentSpanId || null,
              entry.timestamp ? new Date(entry.timestamp) : new Date(),
              entry.level,
              entry.service,
              entry.node,
              entry.os,
              entry.message,
              entry.stackTrace || null,
              entry.metadata ? JSON.stringify(entry.metadata) : '{}',
              entry.tags || []
            ]
          )
          inserted++
        }

        return inserted
      })
    }, 'batch insert logs')

    res.json({
      success: true,
      message: `成功写入 ${successCount} 条日志`,
      data: { inserted: successCount }
    })
  } catch (error: any) {
    logger.error('Batch insert logs failed:', error)
    res.status(500).json({
      success: false,
      message: `批量写入失败: ${error.message}`
    })
  }
})

router.get('/logs/trace/:traceId', async (req: Request, res: Response) => {
  try {
    const { traceId } = req.params
    const shardId = databaseService.getShardId(traceId)
    const tableName = databaseService.getShardTableName(shardId)

    const result = await databaseService.query(
      `SELECT * FROM ${tableName} WHERE trace_id = $1 ORDER BY timestamp ASC`,
      [traceId]
    )

    res.json({
      success: true,
      data: result.rows.map((row: any) => ({
        id: row.id,
        traceId: row.trace_id,
        spanId: row.span_id,
        parentSpanId: row.parent_span_id,
        timestamp: row.timestamp,
        level: row.level,
        service: row.service,
        node: row.node,
        os: row.os,
        message: row.message,
        stackTrace: row.stack_trace,
        metadata: row.metadata,
        tags: row.tags
      }))
    })
  } catch (error) {
    logger.error('Get trace logs failed:', error)
    res.status(500).json({
      success: false,
      message: '查询链路日志失败'
    })
  }
})

export default router