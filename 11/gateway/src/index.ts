import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import fs from 'fs'
import path from 'path'
import { config } from './config'
import { createLogger } from './utils/logger'
import {
  requestContextMiddleware,
  errorHandler,
  notFoundHandler,
  responseTimeMiddleware
} from './middleware/request'
import routes from './routes'

const logger = createLogger('app')

const app = express()

app.use(helmet())
app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

const logsDir = path.join(__dirname, '..', 'logs')
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true })
}

app.use(
  morgan('combined', {
    stream: fs.createWriteStream(path.join(logsDir, 'access.log'), {
      flags: 'a'
    })
  })
)

app.use(requestContextMiddleware)
app.use(responseTimeMiddleware)

app.use('/api', routes)

app.use(notFoundHandler)
app.use(errorHandler)

const server = app.listen(config.port, () => {
  logger.info(`Gateway server started on port ${config.port}`)
  logger.info(`Environment: ${config.env}`)
  logger.info(`Platform: ${config.platform}`)
  logger.info(`Collector service: ${config.services.collector}`)
  logger.info(`Storage service: ${config.services.storage}`)
})

const gracefulShutdown = (signal: string) => {
  logger.info(`Received ${signal}. Starting graceful shutdown...`)

  server.close((err) => {
    if (err) {
      logger.error('Error during server shutdown:', err)
      process.exit(1)
    }
    logger.info('Server closed successfully')
    process.exit(0)
  })

  setTimeout(() => {
    logger.error('Forced shutdown after timeout')
    process.exit(1)
  }, 10000)
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error)
  process.exit(1)
})

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection at:', promise, 'reason:', reason)
})

export default app