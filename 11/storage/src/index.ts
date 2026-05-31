import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { config } from './config'
import { createLogger } from './utils/logger'
import { databaseService } from './services/database'
import { redisService } from './services/redis'
import routes from './routes'
import cron from 'node-cron'

const logger = createLogger('app')

const app = express()

app.use(helmet())
app.use(cors())
app.use(express.json({ limit: '10mb' }))
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
    await redisService.disconnect()
    await databaseService.disconnect()
    logger.info('Shutdown complete')
    process.exit(0)
  } catch (error) {
    logger.error('Error during shutdown:', error)
    process.exit(1)
  }
}

const initServices = async () => {
  logger.info('Initializing services...')

  const dbConnected = await databaseService.connect()
  if (dbConnected) {
    logger.info('Database connected successfully')
    try {
      await databaseService.initializeSchema()
      logger.info('Database schema initialized')
    } catch (error) {
      logger.error('Failed to initialize database schema:', error)
    }
  } else {
    logger.warn('Failed to connect to database. Some features may be unavailable.')
  }

  const redisConnected = await redisService.connect()
  if (redisConnected) {
    logger.info('Redis connected successfully')
  } else {
    logger.warn('Failed to connect to Redis. Caching will be disabled.')
  }

  cron.schedule('0 0 4 * * *', async () => {
    logger.info('Running scheduled cleanup of old data...')
    try {
      const deletedCount = await databaseService.cleanupOldData()
      logger.info(`Cleanup complete. Deleted ${deletedCount} old records.`)
    } catch (error) {
      logger.error('Scheduled cleanup failed:', error)
    }
  })

  logger.info('Services initialization complete')
}

const server = app.listen(config.port, async () => {
  logger.info(`Storage server started on port ${config.port}`)
  logger.info(`Environment: ${config.env}`)
  logger.info(`Platform: ${config.platform}`)
  logger.info(`Table shard count: ${config.tableShardCount}`)

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