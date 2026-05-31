import * as dotenv from 'dotenv';

dotenv.config();

export const config = {
  server: {
    port: parseInt(process.env.SERVER_PORT || '3000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
    clusterMode: process.env.CLUSTER_MODE === 'true',
    clusterWorkers: parseInt(process.env.CLUSTER_WORKERS || '4', 10),
  },
  mysql: {
    host: process.env.MYSQL_HOST || 'localhost',
    port: parseInt(process.env.MYSQL_PORT || '3306', 10),
    username: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'power_inspection',
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || '',
    db: parseInt(process.env.REDIS_DB || '0', 10),
    lockTTL: parseInt(process.env.REDIS_LOCK_TTL || '5000', 10),
  },
  rabbitmq: {
    host: process.env.RABBITMQ_HOST || 'localhost',
    port: parseInt(process.env.RABBITMQ_PORT || '5672', 10),
    username: process.env.RABBITMQ_USER || 'guest',
    password: process.env.RABBITMQ_PASSWORD || 'guest',
    alarmQueue: process.env.RABBITMQ_QUEUE_ALARM || 'alarm_queue',
    dataQueue: process.env.RABBITMQ_QUEUE_DATA || 'data_queue',
  },
  alarm: {
    webhookUrl: process.env.ALARM_WEBHOOK_URL || '',
    emailHost: process.env.ALARM_EMAIL_HOST || '',
    smsGateway: process.env.ALARM_SMS_GATEWAY || '',
  },
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
    max: parseInt(process.env.RATE_LIMIT_MAX || '1000', 10),
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE || './logs/app.log',
  },
};

export type ConfigType = typeof config;
