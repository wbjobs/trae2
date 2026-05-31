const logger = require('../utils/logger');
const redisClient = require('../utils/redis');

const BUCKET_PREFIX = 'ratelimit:bucket:';
const WINDOW_PREFIX = 'ratelimit:window:';

const DEFAULT_CONFIG = {
  defaultCapacity: 1000,
  defaultRate: 100,
  windowMs: 60000,
  burstMultiplier: 2,
  levels: {
    critical: { capacity: 200, rate: 50, priority: 1 },
    high: { capacity: 500, rate: 100, priority: 2 },
    normal: { capacity: 1000, rate: 200, priority: 3 },
    low: { capacity: 2000, rate: 500, priority: 4 }
  }
};

class TokenBucketRateLimiter {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.buckets = new Map();
    this.localBuckets = new Map();
    this.useRedis = false;
  }

  async init() {
    try {
      await redisClient.getClient().ping();
      this.useRedis = true;
      logger.info('Token bucket rate limiter initialized with Redis backend');
    } catch (err) {
      this.useRedis = false;
      logger.warn('Redis unavailable, using in-memory rate limiter');
    }
  }

  getClientIdentifier(req) {
    const deviceId = req.headers['x-device-id'];
    if (deviceId) {
      return `device:${deviceId}`;
    }

    const apiKey = req.headers['x-api-key'];
    if (apiKey) {
      return `apikey:${apiKey.substring(0, 8)}`;
    }

    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    return `ip:${ip}`;
  }

  getRequestLevel(req) {
    if (req.path.includes('/immediate') || req.path.includes('/alert')) {
      return 'critical';
    }
    if (req.path.includes('/batch')) {
      return 'high';
    }
    if (req.path.includes('/data')) {
      return 'normal';
    }
    return 'low';
  }

  async consumeToken(identifier, level = 'normal') {
    const levelConfig = this.config.levels[level] || this.config.levels.normal;
    const key = `${BUCKET_PREFIX}${identifier}:${level}`;

    if (!this.useRedis) {
      return this.consumeLocal(identifier, levelConfig);
    }

    try {
      const result = await redisClient.getClient().eval(`
        local key = KEYS[1]
        local capacity = tonumber(ARGV[1])
        local rate = tonumber(ARGV[2])
        local now = tonumber(ARGV[3])
        
        local bucket = redis.call('HMGET', key, 'tokens', 'last_refill')
        local tokens = tonumber(bucket[1])
        local last_refill = tonumber(bucket[2])
        
        if tokens == nil then
          tokens = capacity
          last_refill = now
        end
        
        local elapsed = now - last_refill
        if elapsed > 0 then
          tokens = math.min(capacity, tokens + elapsed * rate / 1000)
        end
        
        if tokens < 1 then
          return {0, tokens, last_refill}
        end
        
        tokens = tokens - 1
        redis.call('HMSET', key, 'tokens', tokens, 'last_refill', now)
        redis.call('EXPIRE', key, 3600)
        
        return {1, tokens, now}
      `, 1, key, levelConfig.capacity, levelConfig.rate, Date.now());

      return {
        allowed: result[0] === 1,
        remainingTokens: Math.floor(result[1]),
        lastRefill: result[2]
      };
    } catch (err) {
      logger.error('Redis rate limit error, falling back to local:', err);
      return this.consumeLocal(identifier, levelConfig);
    }
  }

  consumeLocal(identifier, levelConfig) {
    const now = Date.now();
    let bucket = this.localBuckets.get(identifier);

    if (!bucket) {
      bucket = {
        tokens: levelConfig.capacity,
        lastRefill: now
      };
    }

    const elapsed = now - bucket.lastRefill;
    if (elapsed > 0) {
      bucket.tokens = Math.min(
        levelConfig.capacity,
        bucket.tokens + elapsed * levelConfig.rate / 1000
      );
      bucket.lastRefill = now;
    }

    if (bucket.tokens < 1) {
      return {
        allowed: false,
        remainingTokens: Math.floor(bucket.tokens),
        lastRefill: bucket.lastRefill
      };
    }

    bucket.tokens -= 1;
    this.localBuckets.set(identifier, bucket);

    return {
      allowed: true,
      remainingTokens: Math.floor(bucket.tokens),
      lastRefill: bucket.lastRefill
    };
  }

  async checkWindowLimit(identifier, level = 'normal') {
    const windowKey = `${WINDOW_PREFIX}${identifier}:${level}`;
    const windowMs = this.config.windowMs;

    try {
      const count = await redisClient.getClient().incr(windowKey);
      if (count === 1) {
        await redisClient.getClient().expire(windowKey, windowMs / 1000);
      }

      const windowLimit = this.config.levels[level]?.capacity * this.config.burstMultiplier || 2000;

      return {
        withinLimit: count <= windowLimit,
        currentCount: count,
        windowLimit
      };
    } catch (err) {
      return { withinLimit: true, currentCount: 0, windowLimit: 999999 };
    }
  }

  middleware() {
    return async (req, res, next) => {
      const identifier = this.getClientIdentifier(req);
      const level = this.getRequestLevel(req);

      try {
        const tokenResult = await this.consumeToken(identifier, level);

        res.setHeader('X-RateLimit-Limit', this.config.levels[level]?.capacity || 1000);
        res.setHeader('X-RateLimit-Remaining', tokenResult.remainingTokens);
        res.setHeader('X-RateLimit-Level', level);

        if (!tokenResult.allowed) {
          const retryAfter = Math.ceil((1 - tokenResult.remainingTokens) / (this.config.levels[level]?.rate || 100) * 1000);
          res.setHeader('Retry-After', retryAfter);

          logger.warn(`Rate limit exceeded for ${identifier}, level: ${level}`);

          return res.status(429).json({
            success: false,
            message: 'Rate limit exceeded',
            rateLimit: {
              limit: this.config.levels[level]?.capacity,
              remaining: 0,
              retryAfter
            }
          });
        }

        const windowResult = await this.checkWindowLimit(identifier, level);
        if (!windowResult.withinLimit) {
          logger.warn(`Window rate limit exceeded for ${identifier}, level: ${level}`);

          return res.status(429).json({
            success: false,
            message: 'Rate limit window exceeded',
            rateLimit: {
              windowLimit: windowResult.windowLimit,
              currentCount: windowResult.currentCount,
              retryAfter: 60
            }
          });
        }

        next();
      } catch (err) {
        logger.error('Rate limiter error:', err);
        next();
      }
    };
  }

  async getStatus(identifier) {
    const status = {};

    for (const [level, config] of Object.entries(this.config.levels)) {
      const key = `${BUCKET_PREFIX}${identifier}:${level}`;

      if (this.useRedis) {
        const bucket = await redisClient.getClient().hmget(key, 'tokens', 'last_refill');
        status[level] = {
          tokens: parseFloat(bucket[0]) || config.capacity,
          capacity: config.capacity,
          rate: config.rate
        };
      } else {
        const bucket = this.localBuckets.get(`${identifier}:${level}`);
        status[level] = {
          tokens: bucket?.tokens || config.capacity,
          capacity: config.capacity,
          rate: config.rate
        };
      }
    }

    return status;
  }

  cleanupExpiredBuckets() {
    const now = Date.now();
    for (const [key, bucket] of this.localBuckets.entries()) {
      if (now - bucket.lastRefill > 3600000) {
        this.localBuckets.delete(key);
      }
    }
  }
}

const rateLimiter = new TokenBucketRateLimiter();

module.exports = rateLimiter;
module.exports.TokenBucketRateLimiter = TokenBucketRateLimiter;
