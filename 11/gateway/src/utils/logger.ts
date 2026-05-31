import winston from 'winston'
import { config } from '../config'

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
)

const transports = [
  new winston.transports.Console({
    level: config.logLevel,
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.printf(
        ({ timestamp, level, message, traceId, ...meta }) => {
          const traceStr = traceId ? `[traceId:${traceId}]` : ''
          return `${timestamp} ${level} ${traceStr} ${message} ${
            Object.keys(meta).length ? JSON.stringify(meta) : ''
          }`
        }
      )
    )
  }),
  new winston.transports.File({
    filename: 'logs/error.log',
    level: 'error',
    maxsize: 1024 * 1024 * 50,
    maxFiles: 5
  }),
  new winston.transports.File({
    filename: 'logs/combined.log',
    maxsize: 1024 * 1024 * 100,
    maxFiles: 10
  })
]

export const logger = winston.createLogger({
  level: config.logLevel,
  format: logFormat,
  transports,
  defaultMeta: { service: 'gateway' }
})

export const createLogger = (module: string) => {
  return logger.child({ module })
}