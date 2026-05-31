import { Request, Response, NextFunction } from 'express';
import Redis from 'ioredis';
import { config } from '../config/environment';
import logger from '../utils/logger';

export interface RateLimitConfig {
  capacity: number;
  rate: number;
  windowMs: number;
  keyPrefix?: string;
}

export interface TieredRateLimitConfig {
  [key: string]: RateLimitConfig;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  capacity: 1000,
  rate: 1000,
  windowMs: 60000,
  keyPrefix: 'ratelimit',
};

const TIERED_CONFIGS: TieredRateLimitConfig = {
  default: { capacity: 1000, rate: 1000, windowMs: 60000 },
  report: { capacity: 5000, rate: 5000, windowMs: 60000 },
  query: { capacity: 500, rate: 500, windowMs: 60000 },
  admin: { capacity: 100, rate: 100, windowMs: 60000 },
};

interface TokenBucketState {
  tokens: number;
  lastRefill: number;
}

export class DistributedRateLimiter {
  private redis: Redis;
  private localBuckets: Map<string, TokenBucketState>;
  private cleanupInterval: NodeJS.Timeout;
  private redisAvailable: boolean = false;

  constructor() {
    this.redis = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password || undefined,
      db: config.redis.db,
      lazyConnect: true,
      enableReadyCheck: true,
    });
    this.localBuckets = new Map();

    this.redis.on('connect', () => {
      this.redisAvailable = true;
      logger.info('Rate limiter connected to Redis');
    });

    this.redis.on('error', (err) => {
      this.redisAvailable = false;
      logger.warn('Rate limiter Redis connection error, falling back to local mode:', err);
    });

    this.redis.connect().catch(() => {
      this.redisAvailable = false;
    });

    this.cleanupInterval = setInterval(() => {
      this.cleanupLocalBuckets();
    }, 60000);
  }

  private cleanupLocalBuckets(): void {
    const now = Date.now();
    const expiryThreshold = 5 * 60 * 1000;

    for (const [key, state] of this.localBuckets.entries()) {
      if (now - state.lastRefill > expiryThreshold) {
        this.localBuckets.delete(key);
      }
    }
  }

  public async consume(
    key: string,
    tokens: number = 1,
    configOverride?: Partial<RateLimitConfig>
  ): Promise<{
    allowed: boolean;
    remaining: number;
    resetTime: number;
    limit: number;
  }> {
    const config = { ...DEFAULT_CONFIG, ...configOverride };
    const fullKey = `${config.keyPrefix || 'ratelimit'}:${key}`;

    if (this.redisAvailable) {
      return this.consumeDistributed(fullKey, tokens, config);
    } else {
      return this.consumeLocal(fullKey, tokens, config);
    }
  }

  private async consumeDistributed(
    key: string,
    tokens: number,
    config: RateLimitConfig
  ): Promise<{
    allowed: boolean;
    remaining: number;
    resetTime: number;
    limit: number;
  }> {
    try {
      const now = Date.now();
      const refillInterval = config.windowMs / config.rate;

      const script = `
        local key = KEYS[1]
        local tokens = tonumber(ARGV[1])
        local capacity = tonumber(ARGV[2])
        local rate = tonumber(ARGV[3])
        local windowMs = tonumber(ARGV[4])
        local now = tonumber(ARGV[5])
        
        local refillInterval = windowMs / rate
        
        local data = redis.call('HMGET', key, 'tokens', 'lastRefill')
        local currentTokens = tonumber(data[1])
        local lastRefill = tonumber(data[2])
        
        if currentTokens == nil then
          currentTokens = capacity
          lastRefill = now
        end
        
        local elapsed = now - lastRefill
        local tokensToAdd = math.floor(elapsed / refillInterval)
        currentTokens = math.min(capacity, currentTokens + tokensToAdd)
        lastRefill = lastRefill + tokensToAdd * refillInterval
        
        local allowed = currentTokens >= tokens
        if allowed then
          currentTokens = currentTokens - tokens
        end
        
        redis.call('HMSET', key, 'tokens', currentTokens, 'lastRefill', lastRefill)
        redis.call('PEXPIRE', key, windowMs * 2)
        
        return {allowed and 1 or 0, currentTokens, lastRefill + refillInterval * (capacity - currentTokens)}
      `;

      const result = await this.redis.eval(
        script,
        1,
        key,
        tokens,
        config.capacity,
        config.rate,
        config.windowMs,
        now
      ) as [number, number, number];

      return {
        allowed: result[0] === 1,
        remaining: result[1],
        resetTime: result[2],
        limit: config.capacity,
      };
    } catch (err) {
      logger.warn('Distributed rate limit failed, falling back to local:', err);
      return this.consumeLocal(key, tokens, config);
    }
  }

  private consumeLocal(
    key: string,
    tokens: number,
    config: RateLimitConfig
  ): Promise<{
    allowed: boolean;
    remaining: number;
    resetTime: number;
    limit: number;
  }> {
    const now = Date.now();
    const refillInterval = config.windowMs / config.rate;

    let state = this.localBuckets.get(key);
    if (!state) {
      state = { tokens: config.capacity, lastRefill: now };
    }

    const elapsed = now - state.lastRefill;
    const tokensToAdd = Math.floor(elapsed / refillInterval);
    state.tokens = Math.min(config.capacity, state.tokens + tokensToAdd);
    state.lastRefill = state.lastRefill + tokensToAdd * refillInterval;

    const allowed = state.tokens >= tokens;
    if (allowed) {
      state.tokens -= tokens;
    }

    this.localBuckets.set(key, state);

    const resetTime =
      state.lastRefill + refillInterval * (config.capacity - state.tokens);

    return Promise.resolve({
      allowed,
      remaining: state.tokens,
      resetTime,
      limit: config.capacity,
    });
  }

  public async getTokenCount(
    key: string,
    configOverride?: Partial<RateLimitConfig>
  ): Promise<number> {
    const config = { ...DEFAULT_CONFIG, ...configOverride };
    const fullKey = `${config.keyPrefix || 'ratelimit'}:${key}`;

    if (this.redisAvailable) {
      try {
        const data = await this.redis.hmget(fullKey, 'tokens');
        return data[0] ? parseInt(data[0], 10) : config.capacity;
      } catch {
        const state = this.localBuckets.get(fullKey);
        return state?.tokens ?? config.capacity;
      }
    } else {
      const state = this.localBuckets.get(fullKey);
      return state?.tokens ?? config.capacity;
    }
  }

  public async resetLimit(key: string, configOverride?: Partial<RateLimitConfig>): Promise<void> {
    const config = { ...DEFAULT_CONFIG, ...configOverride };
    const fullKey = `${config.keyPrefix || 'ratelimit'}:${key}`;

    if (this.redisAvailable) {
      await this.redis.del(fullKey);
    }
    this.localBuckets.delete(fullKey);
  }

  public getStats(): {
    redisAvailable: boolean;
    localBucketCount: number;
  } {
    return {
      redisAvailable: this.redisAvailable,
      localBucketCount: this.localBuckets.size,
    };
  }

  public dispose(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.redis.disconnect();
    this.localBuckets.clear();
  }
}

export const distributedRateLimiter = new DistributedRateLimiter();

export const createRateLimitMiddleware = (
  tier: keyof typeof TIERED_CONFIGS,
  keyExtractor?: (req: Request) => string
) => {
  const config = TIERED_CONFIGS[tier] || TIERED_CONFIGS.default;
  const extractor = keyExtractor || ((req: Request) => req.ip || 'unknown');

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const key = extractor(req);
    const result = await distributedRateLimiter.consume(key, 1, config);

    res.setHeader('X-RateLimit-Limit', result.limit);
    res.setHeader('X-RateLimit-Remaining', result.remaining);
    res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetTime / 1000));

    if (!result.allowed) {
      res.setHeader('Retry-After', Math.ceil((result.resetTime - Date.now()) / 1000));
      res.status(429).json({
        success: false,
        code: 429,
        message: 'Too many requests, please try again later.',
        retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000),
        timestamp: Date.now(),
        requestId: req.requestId,
      });
      return;
    }

    next();
  };
};

export const createTerminalRateLimitMiddleware = () => {
  return createRateLimitMiddleware(
    'report',
    (req: Request) => `terminal:${req.body.terminalId || req.params.terminalId || req.ip}`
  );
};
