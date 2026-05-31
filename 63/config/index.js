require('dotenv').config();

const config = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  
  cluster: {
    workers: parseInt(process.env.CLUSTER_WORKERS) || 4,
    enabled: process.env.ENABLE_CLUSTER === 'true',
    maxMemoryPerWorker: parseInt(process.env.MAX_MEMORY_PER_WORKER) || 512,
    maxWorkers: parseInt(process.env.MAX_WORKERS) || 8
  },

  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB) || 0,
    keyPrefix: 'pipeline:',
    maxRetriesPerRequest: parseInt(process.env.REDIS_MAX_RETRIES) || 3,
    enableReadyCheck: process.env.REDIS_READY_CHECK !== 'false',
    connectionName: 'pipeline-monitor-api'
  },

  kafka: {
    brokers: (process.env.KAFKA_BROKERS || '127.0.0.1:9092').split(','),
    clientId: process.env.KAFKA_CLIENT_ID || 'pipeline-monitor',
    rawDataTopic: process.env.KAFKA_RAW_DATA_TOPIC || 'pipeline_raw_data',
    alertTopic: process.env.KAFKA_ALERT_TOPIC || 'pipeline_alerts',
    groupId: process.env.KAFKA_GROUP_ID || 'pipeline-consumer-group',
    maxRetries: parseInt(process.env.KAFKA_MAX_RETRIES) || 3,
    retryDelay: parseInt(process.env.KAFKA_RETRY_DELAY) || 1000
  },

  influxdb: {
    url: process.env.INFLUXDB_URL || 'http://127.0.0.1:8086',
    token: process.env.INFLUXDB_TOKEN || 'your-token',
    org: process.env.INFLUXDB_ORG || 'pipeline-org',
    bucket: process.env.INFLUXDB_BUCKET || 'pipeline-data',
    batchSize: parseInt(process.env.INFLUXDB_BATCH_SIZE) || 1000,
    flushInterval: parseInt(process.env.INFLUXDB_FLUSH_INTERVAL) || 5000
  },

  alertThresholds: {
    potential: {
      warning: parseFloat(process.env.ALERT_POTENTIAL_WARNING) || -850,
      critical: parseFloat(process.env.ALERT_POTENTIAL_CRITICAL) || -1000,
      emergency: parseFloat(process.env.ALERT_POTENTIAL_EMERGENCY) || -1150
    },
    thickness: {
      warning: parseFloat(process.env.ALERT_THICKNESS_WARNING) || 10,
      critical: parseFloat(process.env.ALERT_THICKNESS_CRITICAL) || 20,
      emergency: parseFloat(process.env.ALERT_THICKNESS_EMERGENCY) || 30
    }
  },

  rateLimit: {
    max: parseInt(process.env.RATE_LIMIT_MAX) || 1000,
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000,
    burstMultiplier: parseInt(process.env.RATE_LIMIT_BURST_MULTIPLIER) || 2,
    defaultCapacity: parseInt(process.env.RATE_LIMIT_CAPACITY) || 2000
  },

  deviceMonitor: {
    heartbeatTTL: parseInt(process.env.DEVICE_HEARTBEAT_TTL) || 300,
    offlineThreshold: parseInt(process.env.OFFLINE_THRESHOLD) || 300000,
    warningThreshold: parseInt(process.env.WARNING_THRESHOLD) || 120000,
    criticalThreshold: parseInt(process.env.CRITICAL_THRESHOLD) || 600000,
    checkInterval: parseInt(process.env.MONITOR_CHECK_INTERVAL) || 30000
  },

  taskQueue: {
    corrosionConcurrency: parseInt(process.env.CORROSION_QUEUE_CONCURRENCY) || 50,
    alertConcurrency: parseInt(process.env.ALERT_QUEUE_CONCURRENCY) || 20,
    batchConcurrency: parseInt(process.env.BATCH_QUEUE_CONCURRENCY) || 10,
    maxStalledCount: parseInt(process.env.QUEUE_MAX_STALLED) || 1
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE || 'logs/app.log',
    maxSize: parseInt(process.env.LOG_MAX_SIZE) || 5242880,
    maxFiles: parseInt(process.env.LOG_MAX_FILES) || 5
  }
};

const AlertLevel = {
  NORMAL: 'normal',
  WARNING: 'warning',
  CRITICAL: 'critical',
  EMERGENCY: 'emergency'
};

const AlertLevelPriority = {
  [AlertLevel.NORMAL]: 0,
  [AlertLevel.WARNING]: 1,
  [AlertLevel.CRITICAL]: 2,
  [AlertLevel.EMERGENCY]: 3
};

module.exports = {
  config,
  AlertLevel,
  AlertLevelPriority
};
