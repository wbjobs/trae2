import { Request, Response, NextFunction } from 'express';
import { error } from '../utils/response';
import { redisClient } from '../cache/redis';
import logger from '../utils/logger';
import { verifyToken, JwtPayload } from './jwt';

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
      requestId?: string;
    }
  }
}

const TOKEN_CACHE_PREFIX = 'auth:token:';
const TOKEN_CACHE_TTL = 300;
const RATE_LIMIT_PREFIX = 'ratelimit:';
const RATE_LIMIT_WINDOW = 60;
const RATE_LIMIT_MAX_REQUESTS = 100;
const AUTH_FAILURE_LIMIT = 5;
const AUTH_FAILURE_WINDOW = 300;
const AUTH_FAILURE_PREFIX = 'auth:failure:';

const WHITELIST_IPS = [
  '127.0.0.1',
  '::1',
  'localhost',
];

const WHITELIST_PATHS = [
  '/api/auth/login',
  '/api/auth/health',
  '/health',
];

class TokenCache {
  private cache = new Map<string, { payload: JwtPayload; expiresAt: number }>();
  private maxSize = 1000;

  get(token: string): JwtPayload | null {
    const entry = this.cache.get(token);
    if (!entry) return null;
    
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(token);
      return null;
    }
    
    return entry.payload;
  }

  set(token: string, payload: JwtPayload, ttl: number): void {
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }
    
    this.cache.set(token, {
      payload,
      expiresAt: Date.now() + ttl * 1000,
    });
  }

  invalidate(token: string): void {
    this.cache.delete(token);
  }
}

const tokenCache = new TokenCache();

export const isWhitelisted = (req: Request): boolean => {
  const ip = req.ip || req.connection.remoteAddress || '';
  if (WHITELIST_IPS.includes(ip) || WHITELIST_IPS.some(whiteIp => ip.includes(whiteIp))) {
    return true;
  }

  const path = req.path;
  if (WHITELIST_PATHS.some(whitePath => path.startsWith(whitePath))) {
    return true;
  }

  return false;
};

const checkRateLimit = async (key: string, window: number, maxRequests: number): Promise<{ allowed: boolean; remaining: number; reset: number }> => {
  try {
    const client = redisClient.getClient();
    if (!client) {
      return { allowed: true, remaining: maxRequests, reset: Date.now() + window * 1000 };
    }

    const now = Date.now();
    const windowStart = Math.floor(now / 1000) - window;
    
    await client.zremrangebyscore(key, 0, windowStart);
    
    const count = await client.zcard(key);
    
    if (count >= maxRequests) {
      const oldest = await client.zrange(key, 0, 0, 'WITHSCORES');
      const resetTime = oldest[1] ? parseInt(oldest[1]) + window * 1000 : now + window * 1000;
      return { allowed: false, remaining: 0, reset: resetTime };
    }

    await client.zadd(key, now, `${now}-${Math.random()}`);
    await client.expire(key, window);

    return { allowed: true, remaining: maxRequests - count - 1, reset: now + window * 1000 };
  } catch (err) {
    logger.error('限流检查失败', { error: err });
    return { allowed: true, remaining: maxRequests, reset: Date.now() + window * 1000 };
  }
};

const checkAuthFailure = async (ip: string): Promise<boolean> => {
  try {
    const client = redisClient.getClient();
    if (!client) return true;

    const key = `${AUTH_FAILURE_PREFIX}${ip}`;
    const count = await client.get(key);
    
    if (count && parseInt(count) >= AUTH_FAILURE_LIMIT) {
      return false;
    }
    
    return true;
  } catch (err) {
    logger.error('认证失败检查失败', { error: err });
    return true;
  }
};

const recordAuthFailure = async (ip: string): Promise<void> => {
  try {
    const client = redisClient.getClient();
    if (!client) return;

    const key = `${AUTH_FAILURE_PREFIX}${ip}`;
    await client.incr(key);
    await client.expire(key, AUTH_FAILURE_WINDOW);
  } catch (err) {
    logger.error('记录认证失败失败', { error: err });
  }
};

const getTokenFromRedis = async (token: string): Promise<JwtPayload | null> => {
  try {
    const key = `${TOKEN_CACHE_PREFIX}${token}`;
    const cached = await redisClient.get(key);
    if (cached) {
      return JSON.parse(cached);
    }
    return null;
  } catch (err) {
    logger.error('从Redis获取Token缓存失败', { error: err });
    return null;
  }
};

const setTokenToRedis = async (token: string, payload: JwtPayload): Promise<void> => {
  try {
    const key = `${TOKEN_CACHE_PREFIX}${token}`;
    await redisClient.set(key, JSON.stringify(payload), TOKEN_CACHE_TTL);
  } catch (err) {
    logger.error('设置Token缓存到Redis失败', { error: err });
  }
};

export const rateLimitMiddleware = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  if (isWhitelisted(req)) {
    next();
    return;
  }

  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const key = `${RATE_LIMIT_PREFIX}${ip}`;
  
  const result = await checkRateLimit(key, RATE_LIMIT_WINDOW, RATE_LIMIT_MAX_REQUESTS);
  
  res.setHeader('X-RateLimit-Limit', RATE_LIMIT_MAX_REQUESTS.toString());
  res.setHeader('X-RateLimit-Remaining', result.remaining.toString());
  res.setHeader('X-RateLimit-Reset', Math.floor(result.reset / 1000).toString());

  if (!result.allowed) {
    res.setHeader('Retry-After', Math.ceil((result.reset - Date.now()) / 1000).toString());
    error(res, 429, '请求过于频繁，请稍后再试', 429);
    return;
  }

  next();
};

export const authMiddleware = (
  requiredPermissions?: string[],
) => async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  if (isWhitelisted(req)) {
    next();
    return;
  }

  const ip = req.ip || req.connection.remoteAddress || 'unknown';

  const canAttempt = await checkAuthFailure(ip);
  if (!canAttempt) {
    error(res, 429, '认证失败次数过多，请5分钟后再试', 429);
    return;
  }

  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    await recordAuthFailure(ip);
    error(res, 401, '未提供有效的认证令牌', 401);
    return;
  }

  const token = authHeader.substring(7);

  let payload = tokenCache.get(token);
  if (!payload) {
    payload = await getTokenFromRedis(token);
    if (!payload) {
      payload = verifyToken(token);
      if (payload) {
        tokenCache.set(token, payload, TOKEN_CACHE_TTL);
        await setTokenToRedis(token, payload);
      }
    } else {
      tokenCache.set(token, payload, TOKEN_CACHE_TTL);
    }
  }

  if (!payload) {
    await recordAuthFailure(ip);
    error(res, 401, '认证令牌无效或已过期', 401);
    return;
  }

  if (requiredPermissions && requiredPermissions.length > 0) {
    const hasPermission = requiredPermissions.every((perm) =>
      payload.permissions.includes(perm),
    );
    if (!hasPermission) {
      logger.warn('权限不足的访问尝试', {
        userId: payload.userId,
        username: payload.username,
        requiredPermissions,
        userPermissions: payload.permissions,
        path: req.path,
        method: req.method,
      });
      error(res, 403, '权限不足，无法执行此操作', 403);
      return;
    }
  }

  req.user = payload;
  next();
};

export const invalidateTokenCache = async (token: string): Promise<void> => {
  tokenCache.invalidate(token);
  try {
    const key = `${TOKEN_CACHE_PREFIX}${token}`;
    await redisClient.del(key);
  } catch (err) {
    logger.error('失效Token缓存失败', { error: err });
  }
};

export const adminAuth = authMiddleware(['admin:all']);
export const operatorAuth = authMiddleware(['task:manage', 'device:control']);
export const deviceAuth = authMiddleware(['data:upload', 'status:report']);
