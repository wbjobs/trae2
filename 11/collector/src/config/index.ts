import dotenv from 'dotenv'
import os from 'os'

dotenv.config()

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '8081', 10),
  elasticsearch: {
    host: process.env.ELASTICSEARCH_HOST || 'localhost:9200',
    user: process.env.ELASTICSEARCH_USER || 'elastic',
    password: process.env.ELASTICSEARCH_PASSWORD || 'changeme'
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined
  },
  rabbitmq: {
    url: process.env.RABBITMQ_URL || 'amqp://localhost:5672'
  },
  logRetentionDays: parseInt(process.env.LOG_RETENTION_DAYS || '30', 10),
  logBatchSize: parseInt(process.env.LOG_BATCH_SIZE || '100', 10),
  logFlushInterval: parseInt(process.env.LOG_FLUSH_INTERVAL || '5000', 10),
  nodeName: process.env.NODE_NAME || `node-${os.hostname()}`,
  serviceName: process.env.SERVICE_NAME || 'log-collector',
  platform: os.platform() as 'linux' | 'win32' | 'darwin'
}