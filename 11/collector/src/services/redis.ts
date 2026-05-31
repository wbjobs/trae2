import { createClient, RedisClientType } from 'redis'
import { config } from '../config'
import { createLogger } from '../utils/logger'

const logger = createLogger('redis')

class RedisService {
  private client: RedisClientType | null = null
  private connected: boolean = false

  async connect(): Promise<boolean> {
    try {
      this.client = createClient({
        url: `redis://${config.redis.host}:${config.redis.port}`,
        password: config.redis.password
      })

      this.client.on('error', (error) => {
        logger.error('Redis client error:', error)
        this.connected = false
      })

      this.client.on('connect', () => {
        logger.info('Connected to Redis')
        this.connected = true
      })

      await this.client.connect()
      return true
    } catch (error) {
      logger.error('Failed to connect to Redis:', error)
      return false
    }
  }

  isConnected(): boolean {
    return this.connected && this.client !== null
  }

  async cacheTrace(traceId: string, data: any, ttl: number = 3600): Promise<void> {
    if (!this.isConnected()) return

    try {
      await this.client!.setEx(`trace:${traceId}`, JSON.stringify(data), {
        EX: ttl
      } as any)
    } catch (error) {
      logger.error('Failed to cache trace:', error)
    }
  }

  async getCachedTrace(traceId: string): Promise<any | null> {
    if (!this.isConnected()) return null

    try {
      const data = await this.client!.get(`trace:${traceId}`)
      return data ? JSON.parse(data) : null
    } catch (error) {
      logger.error('Failed to get cached trace:', error)
      return null
    }
  }

  async cacheLogStats(key: string, stats: any, ttl: number = 60): Promise<void> {
    if (!this.isConnected()) return

    try {
      await this.client!.setEx(`stats:${key}`, JSON.stringify(stats), {
        EX: ttl
      } as any)
    } catch (error) {
      logger.error('Failed to cache log stats:', error)
    }
  }

  async getCachedLogStats(key: string): Promise<any | null> {
    if (!this.isConnected()) return null

    try {
      const data = await this.client!.get(`stats:${key}`)
      return data ? JSON.parse(data) : null
    } catch (error) {
      logger.error('Failed to get cached stats:', error)
      return null
    }
  }

  async incrementCounter(key: string, value: number = 1): Promise<number> {
    if (!this.isConnected()) return 0

    try {
      return await this.client!.incrBy(`counter:${key}`, value)
    } catch (error) {
      logger.error('Failed to increment counter:', error)
      return 0
    }
  }

  async addToLogQueue(logData: string): Promise<void> {
    if (!this.isConnected()) return

    try {
      await this.client!.lPush('log:queue', logData)
    } catch (error) {
      logger.error('Failed to add to log queue:', error)
    }
  }

  async getFromLogQueue(count: number = 10): Promise<string[]> {
    if (!this.isConnected()) return []

    try {
      const logs = await this.client!.lRange('log:queue', 0, count - 1)
      if (logs.length > 0) {
        await this.client!.lTrim('log:queue', logs.length, -1)
      }
      return logs
    } catch (error) {
      logger.error('Failed to get from log queue:', error)
      return []
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit()
      this.connected = false
      logger.info('Disconnected from Redis')
    }
  }
}

export const redisService = new RedisService()
export default redisService