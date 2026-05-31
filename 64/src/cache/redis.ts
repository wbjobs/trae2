import Redis from 'ioredis';
import { config } from '../config';
import logger from '../utils/logger';

class RedisClient {
  private client: Redis | null = null;

  connect(): void {
    try {
      this.client = new Redis({
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password,
        db: config.redis.db,
        retryStrategy: (times: number) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
      });

      this.client.on('connect', () => {
        logger.info('Redis 连接成功');
      });

      this.client.on('error', (err) => {
        logger.error('Redis 连接错误', { error: err.message });
      });

      this.client.on('close', () => {
        logger.warn('Redis 连接已关闭');
      });
    } catch (err) {
      logger.error('Redis 初始化失败', { error: err });
    }
  }

  getClient(): Redis | null {
    return this.client;
  }

  async get(key: string): Promise<string | null> {
    if (!this.client) return null;
    try {
      return await this.client.get(key);
    } catch (err) {
      logger.error('Redis GET 失败', { key, error: err });
      return null;
    }
  }

  async set(key: string, value: string, ttl?: number): Promise<boolean> {
    if (!this.client) return false;
    try {
      if (ttl) {
        await this.client.set(key, value, 'EX', ttl);
      } else {
        await this.client.set(key, value);
      }
      return true;
    } catch (err) {
      logger.error('Redis SET 失败', { key, error: err });
      return false;
    }
  }

  async del(key: string): Promise<boolean> {
    if (!this.client) return false;
    try {
      await this.client.del(key);
      return true;
    } catch (err) {
      logger.error('Redis DEL 失败', { key, error: err });
      return false;
    }
  }

  async hget(key: string, field: string): Promise<string | null> {
    if (!this.client) return null;
    try {
      return await this.client.hget(key, field);
    } catch (err) {
      logger.error('Redis HGET 失败', { key, field, error: err });
      return null;
    }
  }

  async hset(key: string, field: string, value: string): Promise<boolean> {
    if (!this.client) return false;
    try {
      await this.client.hset(key, field, value);
      return true;
    } catch (err) {
      logger.error('Redis HSET 失败', { key, field, error: err });
      return false;
    }
  }

  async hgetall(key: string): Promise<Record<string, string> | null> {
    if (!this.client) return null;
    try {
      return await this.client.hgetall(key);
    } catch (err) {
      logger.error('Redis HGETALL 失败', { key, error: err });
      return null;
    }
  }

  async lpush(key: string, value: string): Promise<boolean> {
    if (!this.client) return false;
    try {
      await this.client.lpush(key, value);
      return true;
    } catch (err) {
      logger.error('Redis LPUSH 失败', { key, error: err });
      return false;
    }
  }

  async rpop(key: string): Promise<string | null> {
    if (!this.client) return null;
    try {
      return await this.client.rpop(key);
    } catch (err) {
      logger.error('Redis RPOP 失败', { key, error: err });
      return null;
    }
  }

  async expire(key: string, seconds: number): Promise<boolean> {
    if (!this.client) return false;
    try {
      await this.client.expire(key, seconds);
      return true;
    } catch (err) {
      logger.error('Redis EXPIRE 失败', { key, error: err });
      return false;
    }
  }

  async exists(key: string): Promise<boolean> {
    if (!this.client) return false;
    try {
      const result = await this.client.exists(key);
      return result > 0;
    } catch (err) {
      logger.error('Redis EXISTS 失败', { key, error: err });
      return false;
    }
  }

  disconnect(): void {
    if (this.client) {
      this.client.disconnect();
      this.client = null;
    }
  }
}

export const redisClient = new RedisClient();
