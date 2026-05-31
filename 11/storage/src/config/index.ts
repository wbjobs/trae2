import dotenv from 'dotenv'
import os from 'os'

dotenv.config()

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '8082', 10),
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    name: process.env.DB_NAME || 'log_trace_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres'
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined
  },
  tableShardCount: parseInt(process.env.TABLE_SHARD_COUNT || '4', 10),
  logRetentionDays: parseInt(process.env.LOG_RETENTION_DAYS || '90', 10),
  serviceName: process.env.SERVICE_NAME || 'storage-service',
  platform: os.platform() as 'linux' | 'win32' | 'darwin'
}