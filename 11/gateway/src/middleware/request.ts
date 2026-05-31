import { Request, Response, NextFunction } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { createLogger } from '../utils/logger'

const logger = createLogger('request')

export interface RequestContext {
  requestId: string
  timestamp: number
}

export interface RequestWithContext extends Request {
  context?: RequestContext
}

export const requestContextMiddleware = (
  req: RequestWithContext,
  res: Response,
  next: NextFunction
) => {
  const requestId = req.headers['x-request-id'] as string || uuidv4()

  req.context = {
    requestId,
    timestamp: Date.now()
  }

  res.setHeader('X-Request-Id', requestId)

  logger.info(`${req.method} ${req.url}`, {
    requestId,
    ip: req.ip,
    userAgent: req.headers['user-agent']
  })

  next()
}

export const errorHandler = (
  error: Error,
  req: RequestWithContext,
  res: Response,
  next: NextFunction
) => {
  const requestId = req.context?.requestId || 'unknown'
  const duration = req.context ? Date.now() - req.context.timestamp : 0

  logger.error(`Request failed: ${req.method} ${req.url}`, {
    requestId,
    error: error.message,
    stack: error.stack,
    duration: `${duration}ms`
  })

  res.status(500).json({
    success: false,
    message: '服务器内部错误',
    requestId,
    error: process.env.NODE_ENV === 'development' ? error.message : undefined
  })
}

export const notFoundHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  res.status(404).json({
    success: false,
    message: `接口不存在: ${req.method} ${req.originalUrl}`
  })
}

export const responseTimeMiddleware = (
  req: RequestWithContext,
  res: Response,
  next: NextFunction
) => {
  res.on('finish', () => {
    const duration = req.context ? Date.now() - req.context.timestamp : 0
    logger.info(`${req.method} ${req.url} completed`, {
      requestId: req.context?.requestId,
      status: res.statusCode,
      duration: `${duration}ms`
    })
  })
  next()
}