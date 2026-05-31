import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import User, { IUser, UserRole } from './user.model';
import { AppError } from '../middleware/error.middleware';

export interface AuthRequest extends Request {
  user?: IUser;
}

export const protect = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  let token;
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return next(new AppError('您还没有登录，请先登录', 401));
  }

  try {
    const decoded: any = jwt.verify(token, process.env.JWT_SECRET || 'fossil3d_secret_key_2024');
    const user = await User.findById(decoded.id);
    if (!user) {
      return next(new AppError('用户不存在或已被删除', 401));
    }
    if (!user.isActive) {
      return next(new AppError('账号已被禁用', 401));
    }
    req.user = user;
    next();
  } catch (err) {
    return next(new AppError('登录已过期，请重新登录', 401));
  }
};

export const restrictTo = (...roles: UserRole[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new AppError('您没有权限执行此操作', 403));
    }
    next();
  };
};
