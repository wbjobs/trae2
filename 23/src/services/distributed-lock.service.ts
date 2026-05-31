import Redis from 'ioredis';
import { config } from '../config/environment';
import logger from '../utils/logger';

interface LockHolder {
  lockKey: string;
  lockValue: string;
  ttl: number;
  acquiredAt: number;
  renewInterval: NodeJS.Timeout | null;
}

export class DistributedLockService {
  private redis: Redis;
  private lockTTL: number;
  private lockHolders: Map<string, LockHolder>;
  private localFallbackLocks: Map<string, { value: string; expiresAt: number }>;
  private redisAvailable: boolean;
  private idempotencyCache: Map<string, number>;
  private idempotencyCleanup: NodeJS.Timeout;

  constructor() {
    this.redis = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password || undefined,
      db: config.redis.db,
      enableReadyCheck: true,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
    this.lockTTL = config.redis.lockTTL;
    this.lockHolders = new Map();
    this.localFallbackLocks = new Map();
    this.redisAvailable = false;
    this.idempotencyCache = new Map();

    this.redis.on('error', (err) => {
      logger.error('Redis connection error:', err);
      this.redisAvailable = false;
    });

    this.redis.on('connect', () => {
      logger.info('Distributed lock service connected to Redis');
      this.redisAvailable = true;
    });

    this.redis.on('ready', () => {
      this.redisAvailable = true;
    });

    this.idempotencyCleanup = setInterval(() => {
      const now = Date.now();
      for (const [key, expiresAt] of this.idempotencyCache.entries()) {
        if (expiresAt < now) {
          this.idempotencyCache.delete(key);
        }
      }
    }, 60000);

    this.redis.connect().catch((err) => {
      logger.warn('Initial Redis connection failed, using local fallback:', err);
      this.redisAvailable = false;
    });
  }

  public async checkIdempotency(
    requestKey: string,
    ttlMs: number = 10000
  ): Promise<boolean> {
    const cacheKey = `idempotency:${requestKey}`;
    const now = Date.now();

    if (this.redisAvailable) {
      try {
        const result = await this.redis.set(
          cacheKey,
          now.toString(),
          'PX',
          ttlMs,
          'NX'
        );
        return result === 'OK';
      } catch (err) {
        logger.warn('Redis idempotency check failed, using local fallback:', err);
      }
    }

    const existing = this.idempotencyCache.get(cacheKey);
    if (existing && existing > now) {
      return false;
    }
    this.idempotencyCache.set(cacheKey, now + ttlMs);
    return true;
  }

  public async acquireLock(
    lockKey: string,
    lockValue: string,
    ttl: number = this.lockTTL
  ): Promise<boolean> {
    if (this.redisAvailable) {
      try {
        const result = await this.redis.set(lockKey, lockValue, 'PX', ttl, 'NX');
        if (result === 'OK') {
          this.startLockRenewal(lockKey, lockValue, ttl);
          return true;
        }
        return false;
      } catch (err) {
        logger.warn('Redis acquire lock failed, using local fallback:', {
          lockKey,
          error: err,
        });
      }
    }

    return this.acquireLocalLock(lockKey, lockValue, ttl);
  }

  private acquireLocalLock(
    lockKey: string,
    lockValue: string,
    ttl: number
  ): boolean {
    const existing = this.localFallbackLocks.get(lockKey);
    const now = Date.now();

    if (existing && existing.expiresAt > now) {
      return false;
    }

    this.localFallbackLocks.set(lockKey, {
      value: lockValue,
      expiresAt: now + ttl,
    });
    this.startLockRenewal(lockKey, lockValue, ttl);
    return true;
  }

  private startLockRenewal(
    lockKey: string,
    lockValue: string,
    ttl: number
  ): void {
    const renewalInterval = Math.floor(ttl / 3);
    const renewInterval = setInterval(async () => {
      const holder = this.lockHolders.get(lockKey);
      if (!holder) {
        clearInterval(renewInterval);
        return;
      }

      const renewed = await this.extendLock(lockKey, lockValue, ttl);
      if (!renewed) {
        logger.warn('Lock renewal failed, lock may have expired:', { lockKey });
      }
    }, renewalInterval);

    this.lockHolders.set(lockKey, {
      lockKey,
      lockValue,
      ttl,
      acquiredAt: Date.now(),
      renewInterval,
    });
  }

  private stopLockRenewal(lockKey: string): void {
    const holder = this.lockHolders.get(lockKey);
    if (holder?.renewInterval) {
      clearInterval(holder.renewInterval);
    }
    this.lockHolders.delete(lockKey);
  }

  public async releaseLock(lockKey: string, lockValue: string): Promise<boolean> {
    this.stopLockRenewal(lockKey);

    if (this.redisAvailable) {
      try {
        const unlockScript = `
          if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("del", KEYS[1])
          else
            return 0
          end
        `;
        const result = await this.redis.eval(
          unlockScript,
          1,
          lockKey,
          lockValue
        );
        if (result === 1) {
          return true;
        }
      } catch (err) {
        logger.warn('Redis release lock failed:', { lockKey, error: err });
      }
    }

    return this.releaseLocalLock(lockKey, lockValue);
  }

  private releaseLocalLock(lockKey: string, lockValue: string): boolean {
    const existing = this.localFallbackLocks.get(lockKey);
    if (existing && existing.value === lockValue) {
      this.localFallbackLocks.delete(lockKey);
      return true;
    }
    return false;
  }

  public async isLocked(lockKey: string): Promise<boolean> {
    if (this.redisAvailable) {
      try {
        const ttl = await this.redis.pttl(lockKey);
        if (ttl > 0) return true;
      } catch (err) {
        logger.warn('Redis isLocked check failed:', err);
      }
    }

    const existing = this.localFallbackLocks.get(lockKey);
    return !!(existing && existing.expiresAt > Date.now());
  }

  public async extendLock(
    lockKey: string,
    lockValue: string,
    ttl: number = this.lockTTL
  ): Promise<boolean> {
    if (this.redisAvailable) {
      try {
        const extendScript = `
          if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("pexpire", KEYS[1], ARGV[2])
          else
            return 0
          end
        `;
        const result = await this.redis.eval(
          extendScript,
          1,
          lockKey,
          lockValue,
          ttl.toString()
        );
        return result === 1;
      } catch (err) {
        logger.warn('Redis extend lock failed:', err);
      }
    }

    const existing = this.localFallbackLocks.get(lockKey);
    if (existing && existing.value === lockValue) {
      existing.expiresAt = Date.now() + ttl;
      return true;
    }
    return false;
  }

  public async withLock<T>(
    lockKey: string,
    lockValue: string,
    fn: () => Promise<T>,
    ttl: number = this.lockTTL
  ): Promise<T> {
    const acquired = await this.acquireLock(lockKey, lockValue, ttl);

    if (!acquired) {
      throw new Error(`Failed to acquire lock: ${lockKey}`);
    }

    try {
      return await fn();
    } finally {
      await this.releaseLock(lockKey, lockValue);
    }
  }

  public isRedisAvailable(): boolean {
    return this.redisAvailable;
  }

  public getStats(): {
    redisAvailable: boolean;
    activeLocks: number;
    localFallbackLocks: number;
    idempotencyCacheSize: number;
    lockHolders: number;
  } {
    return {
      redisAvailable: this.redisAvailable,
      activeLocks: this.localFallbackLocks.size,
      localFallbackLocks: this.localFallbackLocks.size,
      idempotencyCacheSize: this.idempotencyCache.size,
      lockHolders: this.lockHolders.size,
    };
  }

  public disconnect(): void {
    if (this.idempotencyCleanup) {
      clearInterval(this.idempotencyCleanup);
    }

    for (const [key, holder] of this.lockHolders.entries()) {
      if (holder.renewInterval) {
        clearInterval(holder.renewInterval);
      }
      this.lockHolders.delete(key);
    }

    this.localFallbackLocks.clear();
    this.idempotencyCache.clear();
    this.redis.disconnect();
    logger.info('Distributed lock service disconnected from Redis');
  }
}

export const distributedLockService = new DistributedLockService();
