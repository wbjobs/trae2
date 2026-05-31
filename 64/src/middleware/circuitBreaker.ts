import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';
import { redisClient } from '../cache/redis';

const CIRCUIT_BREAKER_PREFIX = 'circuit:';
const DEFAULT_FAILURE_THRESHOLD = 5;
const DEFAULT_TIMEOUT = 30000;
const DEFAULT_HALF_OPEN_ATTEMPTS = 3;

export enum CircuitState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half_open',
}

interface CircuitConfig {
  failureThreshold: number;
  timeout: number;
  halfOpenAttempts: number;
}

interface CircuitStatus {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  openAt: number;
  lastAttemptAt: number;
}

class CircuitBreaker {
  private config: CircuitConfig;
  private statuses: Map<string, CircuitStatus> = new Map();

  constructor(config?: Partial<CircuitConfig>) {
    this.config = {
      failureThreshold: DEFAULT_FAILURE_THRESHOLD,
      timeout: DEFAULT_TIMEOUT,
      halfOpenAttempts: DEFAULT_HALF_OPEN_ATTEMPTS,
      ...config,
    };
  }

  private getStatus(key: string): CircuitStatus {
    if (!this.statuses.has(key)) {
      this.statuses.set(key, {
        state: CircuitState.CLOSED,
        failureCount: 0,
        successCount: 0,
        openAt: 0,
        lastAttemptAt: 0,
      });
    }
    return this.statuses.get(key)!;
  }

  async isOpen(key: string): Promise<boolean> {
    const status = this.getStatus(key);
    const now = Date.now();

    if (status.state === CircuitState.OPEN) {
      if (now - status.openAt >= this.config.timeout) {
        status.state = CircuitState.HALF_OPEN;
        status.successCount = 0;
        logger.info('熔断器进入半开状态', { key });
        return false;
      }
      return true;
    }

    return false;
  }

  async recordSuccess(key: string): Promise<void> {
    const status = this.getStatus(key);
    const now = Date.now();

    if (status.state === CircuitState.HALF_OPEN) {
      status.successCount++;
      if (status.successCount >= this.config.halfOpenAttempts) {
        status.state = CircuitState.CLOSED;
        status.failureCount = 0;
        status.successCount = 0;
        logger.info('熔断器已关闭，服务恢复正常', { key });
      }
    } else {
      status.failureCount = Math.max(0, status.failureCount - 1);
    }

    status.lastAttemptAt = now;
  }

  async recordFailure(key: string): Promise<void> {
    const status = this.getStatus(key);
    const now = Date.now();

    status.failureCount++;
    status.lastAttemptAt = now;

    if (status.state === CircuitState.HALF_OPEN) {
      status.state = CircuitState.OPEN;
      status.openAt = now;
      logger.warn('半开状态下请求失败，熔断器重新打开', { key, failureCount: status.failureCount });
      return;
    }

    if (status.failureCount >= this.config.failureThreshold && status.state === CircuitState.CLOSED) {
      status.state = CircuitState.OPEN;
      status.openAt = now;
      logger.warn('熔断器已打开，服务暂时不可用', { key, failureCount: status.failureCount });
    }
  }

  getState(key: string): CircuitState {
    return this.getStatus(key).state;
  }

  getStats(key: string): CircuitStatus {
    return { ...this.getStatus(key) };
  }

  reset(key: string): void {
    this.statuses.delete(key);
    logger.info('熔断器状态已重置', { key });
  }
}

export const globalCircuitBreaker = new CircuitBreaker({
  failureThreshold: 10,
  timeout: 60000,
  halfOpenAttempts: 5,
});

export const createCircuitBreakerMiddleware = (
  circuitBreaker: CircuitBreaker,
  keyExtractor: (req: Request) => string = (req) => req.path,
) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const key = keyExtractor(req);

    if (await circuitBreaker.isOpen(key)) {
      logger.warn('请求被熔断，服务暂时不可用', { key, path: req.path });
      res.status(503).json({
        success: false,
        message: '服务暂时不可用，请稍后再试',
        code: 503,
      });
      return;
    }

    const originalSend = res.send.bind(res);
    const originalJson = res.json.bind(res);
    let responseSent = false;

    const handleResponse = (success: boolean) => {
      if (responseSent) return;
      responseSent = true;

      if (success) {
        circuitBreaker.recordSuccess(key);
      } else {
        circuitBreaker.recordFailure(key);
      }
    };

    res.send = (body: any) => {
      handleResponse(res.statusCode < 400);
      return originalSend(body);
    };

    res.json = (body: any) => {
      handleResponse(res.statusCode < 400);
      return originalJson(body);
    };

    res.on('finish', () => {
      if (!responseSent) {
        handleResponse(res.statusCode < 400);
      }
    });

    res.on('close', () => {
      if (!responseSent) {
        handleResponse(false);
      }
    });

    next();
  };
};

export const globalCircuitBreakerMiddleware = createCircuitBreakerMiddleware(globalCircuitBreaker);
