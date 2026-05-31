const Redis = require('ioredis');
const { config } = require('../config');
const logger = require('./logger');

class RedisClient {
  constructor() {
    this.client = null;
    this.init();
  }

  init() {
    try {
      this.client = new Redis({
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password,
        db: config.redis.db,
        keyPrefix: config.redis.keyPrefix,
        enableReadyCheck: true,
        maxRetriesPerRequest: 3,
        retryDelayOnFailover: 100
      });

      this.client.on('connect', () => {
        logger.info('Redis connected successfully');
      });

      this.client.on('error', (err) => {
        logger.error('Redis connection error:', err);
      });

      this.client.on('close', () => {
        logger.warn('Redis connection closed');
      });
    } catch (err) {
      logger.error('Failed to initialize Redis:', err);
    }
  }

  getClient() {
    return this.client;
  }

  async get(key) {
    try {
      return await this.client.get(key);
    } catch (err) {
      logger.error('Redis get error:', err);
      return null;
    }
  }

  async set(key, value, ttl = 3600) {
    try {
      if (ttl > 0) {
        return await this.client.setex(key, ttl, value);
      }
      return await this.client.set(key, value);
    } catch (err) {
      logger.error('Redis set error:', err);
      return null;
    }
  }

  async del(key) {
    try {
      return await this.client.del(key);
    } catch (err) {
      logger.error('Redis del error:', err);
      return null;
    }
  }

  async incr(key) {
    try {
      return await this.client.incr(key);
    } catch (err) {
      logger.error('Redis incr error:', err);
      return null;
    }
  }

  async hgetall(key) {
    try {
      return await this.client.hgetall(key);
    } catch (err) {
      logger.error('Redis hgetall error:', err);
      return null;
    }
  }

  async hset(key, field, value) {
    try {
      return await this.client.hset(key, field, value);
    } catch (err) {
      logger.error('Redis hset error:', err);
      return null;
    }
  }

  async sadd(key, member) {
    try {
      return await this.client.sadd(key, member);
    } catch (err) {
      logger.error('Redis sadd error:', err);
      return null;
    }
  }

  async smembers(key) {
    try {
      return await this.client.smembers(key);
    } catch (err) {
      logger.error('Redis smembers error:', err);
      return [];
    }
  }

  async acquireLock(lockKey, timeout = 5000) {
    const lockValue = Date.now() + timeout + 1;
    const result = await this.client.set(lockKey, lockValue, 'NX', 'PX', timeout);
    return result === 'OK';
  }

  async releaseLock(lockKey) {
    return await this.client.del(lockKey);
  }

  disconnect() {
    if (this.client) {
      this.client.disconnect();
    }
  }
}

module.exports = new RedisClient();
