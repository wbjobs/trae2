import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../../config';
import { DataStore } from '../../utils/dataStore';

export interface AuthRequest extends Request {
  userId?: string;
  userRole?: string;
  userDepartmentId?: string | null;
}

const store = DataStore.getInstance();

export const authenticateToken = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') 
    ? authHeader.slice(7) 
    : null;

  if (!token) {
    res.status(401).json({ success: false, message: '未提供认证令牌' });
    return;
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret) as {
      userId: string;
      role: string;
      departmentId: string | null;
    };

    const user = store.users.get(decoded.userId);
    if (!user || user.status !== 'active') {
      res.status(401).json({ success: false, message: '用户不存在或已被禁用' });
      return;
    }

    req.userId = decoded.userId;
    req.userRole = decoded.role;
    req.userDepartmentId = decoded.departmentId;

    next();
  } catch (error) {
    res.status(401).json({ success: false, message: '令牌无效或已过期' });
  }
};

export const authorizeRoles = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.userRole || !roles.includes(req.userRole)) {
      res.status(403).json({ success: false, message: '权限不足，无法执行此操作' });
      return;
    }
    next();
  };
};

export const checkDepartmentAccess = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  if (req.userRole === 'admin') {
    next();
    return;
  }

  const targetDepartmentId = req.params.departmentId || req.body.departmentId;
  
  if (targetDepartmentId && req.userDepartmentId !== targetDepartmentId) {
    res.status(403).json({ success: false, message: '跨部门访问被拒绝' });
    return;
  }

  next();
};
