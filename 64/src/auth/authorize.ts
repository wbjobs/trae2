import { Request, Response, NextFunction } from 'express';
import { error } from '../utils/response';
import logger from '../utils/logger';
import { JwtPayload } from './jwt';

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

const ROLE_PERMISSIONS: Record<string, string[]> = {
  admin: ['admin:all', 'task:manage', 'device:control', 'data:upload', 'status:report', 'data:read'],
  operator: ['task:manage', 'device:control', 'data:read'],
  device: ['data:upload', 'status:report'],
};

export const checkPermission = (
  user: JwtPayload,
  requiredPermissions: string[]
): boolean => {
  if (!requiredPermissions || requiredPermissions.length === 0) {
    return true;
  }

  if (user.role === 'admin' && user.permissions.includes('admin:all')) {
    return true;
  }

  const rolePermissions = ROLE_PERMISSIONS[user.role] || [];
  const allPermissions = [...user.permissions, ...rolePermissions];

  return requiredPermissions.every((perm) =>
    allPermissions.includes(perm)
  );
};

export const authorize = (
  requiredPermissions?: string[]
) => (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (!requiredPermissions || requiredPermissions.length === 0) {
    next();
    return;
  }

  if (!req.user) {
    error(res, 401, '需要认证', 401);
    return;
  }

  const hasPermission = checkPermission(req.user, requiredPermissions);
  
  if (!hasPermission) {
    logger.warn('权限不足的访问尝试', {
      userId: req.user.userId,
      username: req.user.username,
      requiredPermissions,
      userPermissions: req.user.permissions,
      userRole: req.user.role,
      path: req.path,
      method: req.method,
    });
    error(res, 403, '权限不足，无法执行此操作', 403);
    return;
  }

  next();
};

export const requireRole = (
  ...roles: string[]
) => (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user) {
    error(res, 401, '需要认证', 401);
    return;
  }

  if (!roles.includes(req.user.role)) {
    logger.warn('角色不足的访问尝试', {
      userId: req.user.userId,
      username: req.user.username,
      requiredRoles: roles,
      userRole: req.user.role,
      path: req.path,
      method: req.method,
    });
    error(res, 403, '角色权限不足，无法执行此操作', 403);
    return;
  }

  next();
};

export const adminOnly = requireRole('admin');
export const operatorOnly = requireRole('operator', 'admin');
export const deviceOnly = requireRole('device', 'admin');

export const requireAdminPermission = authorize(['admin:all']);
export const requireTaskPermission = authorize(['task:manage']);
export const requireDevicePermission = authorize(['device:control']);
export const requireDataPermission = authorize(['data:upload']);
export const requireReadPermission = authorize(['data:read']);
