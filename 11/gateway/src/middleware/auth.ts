import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { config } from '../config'
import { createLogger } from '../utils/logger'

const logger = createLogger('auth')

export interface AuthRequest extends Request {
  userId?: string
  user?: {
    id: string
    username: string
    role: string
  }
}

export const authMiddleware = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      logger.warn('Missing or invalid authorization header')
      return res.status(401).json({
        success: false,
        message: '未提供认证令牌'
      })
    }

    const token = authHeader.split(' ')[1]

    try {
      const decoded = jwt.verify(token, config.jwt.secret) as any
      req.userId = decoded.id
      req.user = {
        id: decoded.id,
        username: decoded.username,
        role: decoded.role
      }
      next()
    } catch (error) {
      logger.warn('Invalid or expired token:', error)
      return res.status(401).json({
        success: false,
        message: '令牌无效或已过期'
      })
    }
  } catch (error) {
    logger.error('Auth middleware error:', error)
    return res.status(500).json({
      success: false,
      message: '认证服务异常'
    })
  }
}

export const optionalAuthMiddleware = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1]
    try {
      const decoded = jwt.verify(token, config.jwt.secret) as any
      req.userId = decoded.id
      req.user = {
        id: decoded.id,
        username: decoded.username,
        role: decoded.role
      }
    } catch (error) {
      // Token is invalid but optional, so we continue
    }
  }
  next()
}

export const generateToken = (user: {
  id: string
  username: string
  role: string
}) => {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role
    },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  )
}