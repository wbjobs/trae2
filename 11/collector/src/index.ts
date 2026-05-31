import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { config } from './config'
import { createLogger } from './utils/logger'
import { elasticsearchService } from './services/elasticsearch'
import { redisService } from './services/redis'
import { metricsCollector } from './services/metrics'
import { fileLogCollector } from './services/fileCollector'
import { traceContextManager } from './utils/traceContext'
import routes from './routes'
import cron from 'node-cron'

const logger = createLogger('app')

const app = express()

app.use(helmet())
app.use(cors())
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ extended: true }))

app.use((req, res, next) => {
  logger.debug(`${req.method} ${req.url}`, {
    ip: req.ip,
    userAgent: req.headers['user-agent']
  })
  next()
})

app.use('/', routes)

const gracefulShutdown = async (signal: string) => {
  logger.info(`Received ${signal}. Starting graceful shutdown...`)

  try {
    traceContextManager.stop()
    await fileLogCollector.shutdown()
    await redisService.disconnect()
    metricsCollector.stopAutoCollect()
    logger.info('Shutdown complete')
    process.exit(0)
  } catch (error) {
    logger.error('Error during shutdown:', error)
    process.exit(1)
  }
}

const initServices = async () => {
  logger.info('Initializing services...')

  traceContextManager.start()
  logger.info('Trace context manager started')

  const esConnected = await elasticsearchService.connect()
  if (esConnected) {
    logger.info('Elasticsearch connected successfully')
  } else {
    logger.warn('Failed to connect to Elasticsearch. Some features may be unavailable.')
  }

  const redisConnected = await redisService.connect()
  if (redisConnected) {
    logger.info('Redis connected successfully')
  } else {
    logger.warn('Failed to connect to Redis. Caching will be disabled.')
  }

  metricsCollector.startAutoCollect(60000)
  logger.info('Metrics collection started')

  cron.schedule('0 0 3 * * *', async () => {
    logger.info('Running scheduled cleanup of old indices...')
    try {
      const deletedCount = await elasticsearchService.cleanupOldIndices()
      logger.info(`Cleanup complete. Deleted ${deletedCount} old indices.`)
    } catch (error) {
      logger.error('Scheduled cleanup failed:', error)
    }
  })

  cron.schedule('0 */5 * * * *', async () => {
    traceContextManager.cleanupExpired()
  })

  logger.info('Services initialization complete')
}

const server = app.listen(config.port, async () => {
  logger.info(`Log collector server started on port ${config.port}`)
  logger.info(`Environment: ${config.env}`)
  logger.info(`Platform: ${config.platform}`)
  logger.info(`Node name: ${config.nodeName}`)

  await initServices()
})

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error)
  gracefulShutdown('uncaughtException')
})

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection at:', promise, 'reason:', reason)
})

export default app