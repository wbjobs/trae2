import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { distributedLockService } from '../services/distributed-lock.service';
import logger from '../utils/logger';

export const distributedLock = (
  lockPrefix: string,
  idField: string,
  ttl: number = 3000,
  idempotencyTtl: number = 5000
) => {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const idValue = req.body[idField] || req.params[idField];

    if (!idValue) {
      res.status(400).json({
        success: false,
        code: 400,
        message: `Missing required field: ${idField}`,
        timestamp: Date.now(),
        requestId: req.requestId,
      });
      return;
    }

    const idempotencyKey = `${lockPrefix}:${idValue}:${
      req.body.timestamp || Date.now()
    }`;
    const isNewRequest = await distributedLockService.checkIdempotency(
      idempotencyKey,
      idempotencyTtl
    );

    if (!isNewRequest) {
      logger.warn('Duplicate request detected via idempotency check:', {
        idempotencyKey,
        requestId: req.requestId,
        terminalId: idValue,
      });
      res.status(409).json({
        success: false,
        code: 409,
        message: 'Duplicate request detected, this data has already been processed',
        timestamp: Date.now(),
        requestId: req.requestId,
      });
      return;
    }

    const lockKey = `${lockPrefix}:${idValue}`;
    const lockValue = uuidv4();

    logger.debug('Attempting to acquire lock:', {
      lockKey,
      requestId: req.requestId,
      redisAvailable: distributedLockService.isRedisAvailable(),
    });

    const acquired = await distributedLockService.acquireLock(
      lockKey,
      lockValue,
      ttl
    );

    if (!acquired) {
      logger.warn('Lock acquisition failed, request deduplicated:', {
        lockKey,
        requestId: req.requestId,
      });
      res.status(429).json({
        success: false,
        code: 429,
        message: 'Request is being processed, please try again later',
        timestamp: Date.now(),
        requestId: req.requestId,
      });
      return;
    }

    logger.debug('Lock acquired:', {
      lockKey,
      requestId: req.requestId,
    });

    const cleanup = async (): Promise<void> => {
      await distributedLockService.releaseLock(lockKey, lockValue);
      logger.debug('Lock released:', {
        lockKey,
        requestId: req.requestId,
      });
    };

    res.on('finish', cleanup);
    res.on('close', cleanup);
    res.on('error', cleanup);

    next();
  };
};

export const terminalLockMiddleware = distributedLock('terminal:report', 'terminalId', 3000, 5000);
export const adminLockMiddleware = distributedLock('admin:operation', 'adminId', 5000, 10000);
