import Redis from 'ioredis'
import { config } from '../config'
import { createLogger } from '../utils/logger'

const logger = createLogger('redis')

class RedisService {
  private client: Redis | null = null
  private connected: boolean = false

  async connect(): Promise<boolean> {
    try {
      this.client = new Redis({
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password,
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000)
          return delay
        }
      })

      this.client.on('error', (error) => {
        logger.error('Redis client error:', error)
        this.connected = false
      })

      this.client.on('connect', () => {
        logger.info('Connected to Redis')
        this.connected = true
      })

      this.client.on('ready', () => {
        logger.info('Redis client ready')
      })

      return true
    } catch (error) {
      logger.error('Failed to connect to Redis:', error)
      return false
    }
  }

  isConnected(): boolean {
    return this.connected && this.client !== null
  }

  async cacheDataSource(id: string, data: any, ttl: number = 300): Promise<void> {
    if (!this.isConnected()) return

    try {
      await this.client!.setex(`datasource:${id}`, ttl, JSON.stringify(data))
    } catch (error) {
      logger.error('Failed to cache data source:', error)
    }
  }

  async getCachedDataSource(id: string): Promise<any | null> {
    if (!this.isConnected()) return null

    try {
      const data = await this.client!.get(`datasource:${id}`)
      return data ? JSON.parse(data) : null
    } catch (error) {
      logger.error('Failed to get cached data source:', error)
      return null
    }
  }

  async invalidateDataSourceCache(id: string): Promise<void> {
    if (!this.isConnected()) return

    try {
      await this.client!.del(`datasource:${id}`)
    } catch (error) {
      logger.error('Failed to invalidate cache:', error)
    }
  }

  async cacheDashboard(id: string, data: any, ttl: number = 300): Promise<void> {
    if (!this.isConnected()) return

    try {
      await this.client!.setex(`dashboard:${id}`, ttl, JSON.stringify(data))
    } catch (error) {
      logger.error('Failed to cache dashboard:', error)
    }
  }

  async getCachedDashboard(id: string): Promise<any | null> {
    if (!this.isConnected()) return null

    try {
      const data = await this.client!.get(`dashboard:${id}`)
      return data ? JSON.stringify(data) : null
    } catch (error) {
      logger.error('Failed to get cached dashboard:', error)
      return null
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