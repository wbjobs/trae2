import winston from 'winston'
import { config } from '../config'

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
)

const transports = [
  new winston.transports.Console({
    level: 'debug',
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.printf(
        ({ timestamp, level, message, ...meta }) => {
          return `${timestamp} ${level} [${config.serviceName}] ${message} ${
            Object.keys(meta).length ? JSON.stringify(meta) : ''
          }`
        }
      )
    )
  })
]

export const logger = winston.createLogger({
  level: 'debug',
  format: logFormat,
  transports,
  defaultMeta: { service: config.serviceName }
})

export const createLogger = (module: string) => {
  return logger.child({ module })
}