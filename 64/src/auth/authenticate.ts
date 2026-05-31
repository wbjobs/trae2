import { Request, Response, NextFunction } from 'express';
import { verifyToken, JwtPayload } from './jwt';
import { error } from '../utils/response';
import logger from '../utils/logger';

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export const extractToken = (req: Request): string | null => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.substring(7);
};

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const token = extractToken(req);
  
  if (!token) {
    error(res, 401, '未提供有效的认证令牌', 401);
    return;
  }

  const payload = verifyToken(token);
  
  if (!payload) {
    error(res, 401, '认证令牌无效或已过期', 401);
    return;
  }

  req.user = payload;
  next();
};

export const optionalAuthenticate = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  const token = extractToken(req);
  
  if (token) {
    try {
      const payload = verifyToken(token);
      if (payload) {
        req.user = payload;
      }
    } catch (err) {
      logger.debug('可选认证失败，继续执行', { error: err });
    }
  }
  
  next();
};

export const requireAuth = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user) {
    error(res, 401, '需要认证', 401);
    return;
  }
  next();
};
