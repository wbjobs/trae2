const config = require('../config');
const logger = require('../utils/logger');
const IORedis = require('ioredis');

const redisClient = new IORedis({
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  db: config.redis.db,
  maxRetriesPerRequest: null,
  enableReadyCheck: false
});

const requestCounts = new Map();
const dynamicLimits = new Map();
const tieredLimits = {
  gold: { device: 500, batch: 200, query: 200 },
  silver: { device: 200, batch: 100, query: 100 },
  bronze: { device: 100, batch: 50, query: 60 },
  default: { device: 50, batch: 20, query: 30 }
};

const deviceTierMap = new Map();

const rateLimiter = {
  setDeviceTier(deviceId, tier) {
    if (tieredLimits[tier]) {
      deviceTierMap.set(deviceId, tier);
      logger.info(`设备 ${deviceId} 限流等级设置为: ${tier}`);
    }
  },

  getDeviceTier(deviceId) {
    return deviceTierMap.get(deviceId) || 'default';
  },

  getTierLimits(tier) {
    return tieredLimits[tier] || tieredLimits.default;
  },

  setDynamicLimit(key, limit, windowMs = 60000) {
    dynamicLimits.set(key, { limit, windowMs, updatedAt: Date.now() });
  },

  getDynamicLimit(key) {
    return dynamicLimits.get(key);
  },

  async getCurrentCount(key) {
    const count = await redisClient.get(`rate_limit:${key}`);
    return parseInt(count, 10) || 0;
  },

  async checkLimit(key, max, windowMs) {
    const current = await redisClient.incr(`rate_limit:${key}`);

    if (current === 1) {
      await redisClient.expire(`rate_limit:${key}`, Math.ceil(windowMs / 1000));
    }

    const ttl = await redisClient.ttl(`rate_limit:${key}`);

    return {
      current,
      remaining: Math.max(0, max - current),
      reset: Date.now() + ttl * 1000,
      exceeded: current > max
    };
  },

  createWindowLimit(options = {}) {
    const {
      windowMs = config.rateLimit.windowMs,
      max = config.rateLimit.max,
      message = config.rateLimit.message,
      keyGenerator = (req) => req.ip || req.headers['x-api-key'] || 'unknown',
      skip = () => false,
      headers = true
    } = options;

    return async (req, res, next) => {
      if (skip(req)) {
        return next();
      }

      const key = keyGenerator(req);
      const dynamicLimit = this.getDynamicLimit(key);
      const actualLimit = dynamicLimit ? dynamicLimit.limit : max;
      const actualWindow = dynamicLimit ? dynamicLimit.windowMs : windowMs;

      const result = await this.checkLimit(key, actualLimit, actualWindow);

      if (headers) {
        res.setHeader('X-RateLimit-Limit', actualLimit);
        res.setHeader('X-RateLimit-Remaining', result.remaining);
        res.setHeader('X-RateLimit-Reset', result.reset);
        res.setHeader('X-RateLimit-Window', actualWindow);
      }

      if (result.exceeded) {
        logger.warn(`请求超限: ${key}, 计数: ${result.current}, 限制: ${actualLimit}`, {
          requestId: req.requestId,
          path: req.path
        });

        return res.status(429).json({
          success: false,
          message: message || '请求过于频繁，请稍后再试',
          code: 'RATE_LIMIT_EXCEEDED',
          data: {
            limit: actualLimit,
            current: result.current,
            remaining: result.remaining,
            resetTime: new Date(result.reset).toISOString(),
            retryAfter: Math.ceil((result.reset - Date.now()) / 1000)
          },
          requestId: req.requestId
        });
      }

      next();
    };
  },

  createDeviceRateLimit() {
    return async (req, res, next) => {
      const apiKey = req.headers['x-api-key'] || req.query.api_key;
      const deviceId = req.headers['x-device-id'] || (req.body && req.body.deviceId);

      const tier = this.getDeviceTier(deviceId || apiKey);
      const limits = this.getTierLimits(tier);

      const key = `device:${deviceId || 'unknown'}:${apiKey || 'unknown'}`;

      const result = await this.checkLimit(key, limits.device, config.rateLimit.windowMs);

      res.setHeader('X-RateLimit-Limit', limits.device);
      res.setHeader('X-RateLimit-Remaining', result.remaining);
      res.setHeader('X-RateLimit-Tier', tier);

      if (result.exceeded) {
        logger.warn(`设备限流触发: ${deviceId}, 等级: ${tier}`, {
          requestId: req.requestId
        });

        return res.status(429).json({
          success: false,
          message: '设备上报频率超限，请稍后重试',
          code: 'RATE_LIMIT_EXCEEDED',
          data: {
            deviceId,
            tier,
            limit: limits.device,
            current: result.current,
            retryAfter: 60
          },
          requestId: req.requestId
        });
      }

      next();
    };
  },

  createBatchRateLimit() {
    return async (req, res, next) => {
      const apiKey = req.headers['x-api-key'] || req.query.api_key;
      const tier = this.getDeviceTier(apiKey);
      const limits = this.getTierLimits(tier);

      const key = `batch:${apiKey || 'unknown'}`;

      const result = await this.checkLimit(key, limits.batch, config.rateLimit.windowMs);

      res.setHeader('X-RateLimit-Limit', limits.batch);
      res.setHeader('X-RateLimit-Remaining', result.remaining);

      if (result.exceeded) {
        logger.warn(`批量上报限流触发: ${apiKey}`, {
          requestId: req.requestId
        });

        return res.status(429).json({
          success: false,
          message: '批量上报频率超限，请稍后重试',
          code: 'RATE_LIMIT_EXCEEDED',
          data: {
            limit: limits.batch,
            current: result.current,
            retryAfter: 60
          },
          requestId: req.requestId
        });
      }

      next();
    };
  },

  createQueryRateLimit() {
    return async (req, res, next) => {
      const apiKey = req.headers['x-api-key'] || req.query.api_key;
      const tier = this.getDeviceTier(apiKey);
      const limits = this.getTierLimits(tier);

      const key = `query:${apiKey || req.ip || 'unknown'}`;

      const result = await this.checkLimit(key, limits.query, config.rateLimit.windowMs);

      res.setHeader('X-RateLimit-Limit', limits.query);
      res.setHeader('X-RateLimit-Remaining', result.remaining);

      if (result.exceeded) {
        return res.status(429).json({
          success: false,
          message: '查询频率超限，请稍后重试',
          code: 'RATE_LIMIT_EXCEEDED',
          data: {
            limit: limits.query,
            current: result.current,
            retryAfter: 60
          },
          requestId: req.requestId
        });
      }

      next();
    };
  },

  createMemoryRateLimit(options = {}) {
    const {
      windowMs = 1000,
      max = 100,
      message = '请求过于频繁',
      keyGenerator = (req) => req.ip || 'unknown'
    } = options;

    return (req, res, next) => {
      const key = keyGenerator(req);
      const now = Date.now();
      const windowStart = now - windowMs;

      if (!requestCounts.has(key)) {
        requestCounts.set(key, []);
      }

      const requests = requestCounts.get(key).filter(time => time > windowStart);

      if (requests.length >= max) {
        logger.warn(`内存限流触发: ${key}, 计数: ${requests.length}`);

        return res.status(429).json({
          success: false,
          message,
          code: 'RATE_LIMIT_EXCEEDED',
          requestId: req.requestId
        });
      }

      requests.push(now);
      requestCounts.set(key, requests.filter(time => time > windowStart));

      next();
    };
  },

  async checkQueueDepth() {
    const { Queue } = require('bullmq');
    const queue = new Queue(config.queue.name, { connection: redisClient });
    const counts = await queue.getJobCounts('waiting', 'active');
    await queue.close();
    return counts;
  },

  createAdaptiveRateLimit(baseLimit = 100) {
    return async (req, res, next) => {
      try {
        const stats = await this.checkQueueDepth();
        const waiting = stats.waiting || 0;
        const active = stats.active || 0;
        const total = waiting + active;

        let dynamicLimit = baseLimit;
        let status = 'normal';

        if (total > config.monitoring.queueDepthThreshold) {
          dynamicLimit = Math.max(10, Math.floor(baseLimit * 0.3));
          status = 'critical';
          logger.warn(`队列深度过高，限流阈值降低: ${dynamicLimit}`, {
            queueDepth: total,
            threshold: config.monitoring.queueDepthThreshold
          });
        } else if (total > config.monitoring.queueDepthWarning) {
          dynamicLimit = Math.floor(baseLimit * 0.7);
          status = 'warning';
        }

        res.setHeader('X-System-Status', status);
        res.setHeader('X-Queue-Depth', total);

        const key = `adaptive:${req.ip || 'unknown'}`;
        const result = await this.checkLimit(key, dynamicLimit, 60000);

        if (result.exceeded) {
          return res.status(429).json({
            success: false,
            message: '服务繁忙，请稍后再试',
            code: 'SERVICE_BUSY',
            data: {
              queueDepth: total,
              status,
              retryAfter: 30
            },
            requestId: req.requestId
          });
        }

        next();
      } catch (error) {
        next();
      }
    };
  },

  async getStats() {
    const keys = await redisClient.keys('rate_limit:*');
    const stats = {};

    for (const key of keys) {
      const count = await redisClient.get(key);
      const ttl = await redisClient.ttl(key);
      stats[key.replace('rate_limit:', '')] = {
        count: parseInt(count, 10),
        ttl
      };
    }

    return {
      totalKeys: keys.length,
      stats,
      tiers: Object.fromEntries(deviceTierMap.entries()),
      tieredLimits
    };
  },

  async resetLimit(key) {
    await redisClient.del(`rate_limit:${key}`);
  },

  async resetAllLimits() {
    const keys = await redisClient.keys('rate_limit:*');
    if (keys.length > 0) {
      await redisClient.del(keys);
    }
    return keys.length;
  }
};

module.exports = rateLimiter;
