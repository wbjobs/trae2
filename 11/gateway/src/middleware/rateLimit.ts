import { Request, Response, NextFunction } from 'express'
import { RateLimiterMemory } from 'rate-limiter-flexible'
import { config } from '../config'
import { createLogger } from '../utils/logger'

const logger = createLogger('rate-limit')

const rateLimiter = new RateLimiterMemory({
  points: config.rateLimit.max,
  duration: config.rateLimit.windowMs / 1000
})

export const rateLimitMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const key = req.ip || 'unknown'

  try {
    await rateLimiter.consume(key)
    next()
  } catch (error) {
    logger.warn(`Rate limit exceeded for IP: ${key}`)
    res.status(429).json({
      success: false,
      message: '请求过于频繁，请稍后再试'
    })
  }
}

export const createRateLimiter = (points: number, duration: number) => {
  const limiter = new RateLimiterMemory({
    points,
    duration
  })

  return async (req: Request, res: Response, next: NextFunction) => {
    const key = `${req.ip}-${req.path}`
    try {
      await limiter.consume(key)
      next()
    } catch (error) {
      res.status(429).json({
        success: false,
        message: '操作过于频繁，请稍后再试'
      })
    }
  }
}