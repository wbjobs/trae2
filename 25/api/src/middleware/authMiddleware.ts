import { type Request, type Response, type NextFunction } from 'express'
import jwt, { type SignOptions } from 'jsonwebtoken'
import config from '../config/index.js'
import type { AuthPayload, AuthRequest } from '../types/index.js'

export function authenticateToken(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null

  if (!token) {
    res.status(401).json({ success: false, error: 'Authentication required' })
    return
  }

  try {
    const decoded = jwt.verify(token, config.jwt.secret) as AuthPayload
    req.user = decoded
    next()
  } catch {
    res.status(401).json({ success: false, error: 'Invalid or expired token' })
  }
}

export function generateToken(payload: AuthPayload): string {
  const options: SignOptions = { expiresIn: config.jwt.expiresIn as SignOptions['expiresIn'] }
  return jwt.sign(payload, config.jwt.secret, options)
}

export function optionalAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null

  if (token) {
    try {
      const decoded = jwt.verify(token, config.jwt.secret) as AuthPayload
      req.user = decoded
    } catch {
      // token invalid but not required
    }
  }
  next()
}
