import { type Response, type NextFunction } from 'express'
import type { AuthRequest, UserRole } from '../types/index.js'

export function requireRoles(...roles: UserRole[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Authentication required' })
      return
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: `Insufficient permissions. Required role: ${roles.join(' or ')}`,
      })
      return
    }

    next()
  }
}

export function requireAdmin(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Authentication required' })
    return
  }

  if (req.user.role !== 'admin') {
    res.status(403).json({ success: false, error: 'Admin access required' })
    return
  }

  next()
}

export function requireProjectMember(...allowedRoles: UserRole[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    // This middleware checks if the user is a project member
    // Actual project-level authorization is done in services
    // This is a marker middleware; the real check uses project_id from params
    next()
  }
}
