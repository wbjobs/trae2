require('dotenv').config();

const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,
  clusterInstances: parseInt(process.env.CLUSTER_INSTANCES, 10) || 4,

  jwt: {
    secret: process.env.JWT_SECRET || 'default-secret-key-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h'
  },

  apiKeys: (process.env.API_KEYS || '').split(',').filter(Boolean),

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 60000,
    max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 1000,
    message: '请求过于频繁，请稍后再试',
    skipSuccessfulRequests: process.env.RATE_LIMIT_SKIP_SUCCESS === 'true',
    deviceRateLimit: parseInt(process.env.DEVICE_RATE_LIMIT, 10) || 100,
    batchRateLimit: parseInt(process.env.BATCH_RATE_LIMIT, 10) || 50,
    queryRateLimit: parseInt(process.env.QUERY_RATE_LIMIT, 10) || 60,
    tiers: {
      gold: { device: 500, batch: 200, query: 200 },
      silver: { device: 200, batch: 100, query: 100 },
      bronze: { device: 100, batch: 50, query: 60 },
      default: { device: 50, batch: 20, query: 30 }
    }
  },

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB, 10) || 0
  },

  queue: {
    name: process.env.QUEUE_NAME || 'device_data_queue',
    concurrency: parseInt(process.env.QUEUE_CONCURRENCY, 10) || 20,
    batchSize: parseInt(process.env.QUEUE_BATCH_SIZE, 10) || 50,
    maxRetries: parseInt(process.env.QUEUE_MAX_RETRIES, 10) || 5,
    backoffDelay: parseInt(process.env.QUEUE_BACKOFF_DELAY, 10) || 2000,
    stalledInterval: parseInt(process.env.STALLED_INTERVAL, 10) || 30000,
    maxStalledCount: parseInt(process.env.MAX_STALLED_COUNT, 10) || 3
  },

  influxdb: {
    url: process.env.INFLUX_URL || 'http://localhost:8086',
    token: process.env.INFLUX_TOKEN || '',
    org: process.env.INFLUX_ORG || 'industrial-org',
    bucket: process.env.INFLUX_BUCKET || 'device_data',
    batchSize: parseInt(process.env.INFLUX_BATCH_SIZE, 10) || 500,
    flushInterval: parseInt(process.env.INFLUX_FLUSH_INTERVAL, 10) || 1000,
    maxBufferLines: parseInt(process.env.INFLUX_MAX_BUFFER_LINES, 10) || 10000,
    retryAttempts: parseInt(process.env.INFLUX_RETRY_ATTEMPTS, 10) || 3,
    retryDelay: parseInt(process.env.INFLUX_RETRY_DELAY, 10) || 1000
  },

  alerting: {
    enabled: process.env.ALERTING_ENABLED !== 'false',
    defaultCooldown: parseInt(process.env.ALERT_DEFAULT_COOLDOWN, 10) || 300000,
    maxAlertsPerRule: parseInt(process.env.ALERT_MAX_PER_RULE, 10) || 100,
    supportedConditions: [
      'threshold', 'range', 'change', 'quality',
      'missing', 'frozen', 'spike', 'trend'
    ],
    supportedSeverities: ['info', 'warning', 'critical', 'error'],
    supportedActions: ['webhook', 'email', 'sms', 'api', 'log']
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE || 'logs/app.log'
  },

  monitoring: {
    queueDepthThreshold: parseInt(process.env.QUEUE_DEPTH_THRESHOLD, 10) || 1000,
    queueDepthWarning: parseInt(process.env.QUEUE_DEPTH_WARNING, 10) || 500,
    healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL, 10) || 30000,
    metricsEnabled: process.env.METRICS_ENABLED !== 'false',
    metricsEndpoint: process.env.METRICS_ENDPOINT || '/api/monitoring/metrics',
    clusterHeartbeatInterval: parseInt(process.env.CLUSTER_HEARTBEAT_INTERVAL, 10) || 10000,
    clusterInstanceTimeout: parseInt(process.env.CLUSTER_INSTANCE_TIMEOUT, 10) || 60000
  }
};

module.exports = config;
