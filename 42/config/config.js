require('dotenv').config();

module.exports = {
  system: {
    name: 'Railway Communication Monitor System',
    version: '1.0.0',
    env: process.env.NODE_ENV || 'development'
  },
  server: {
    port: process.env.SERVER_PORT || 3000,
    signalingPort: process.env.SIGNALING_PORT || 8080,
    wsPort: process.env.WS_PORT || 6001,
    host: process.env.HOST || '0.0.0.0'
  },
  ground: {
    serverUrl: process.env.GROUND_SERVER_URL || 'http://ground-server:8080',
    syncInterval: process.env.GROUND_SYNC_INTERVAL || 5000,
    maxRetry: process.env.GROUND_MAX_RETRY || 3
  },
  database: {
    mongodb: {
      uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/railway_monitor',
      options: {
        useNewUrlParser: true,
        useUnifiedTopology: true
      }
    },
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379
    }
  },
  signaling: {
    protocols: ['LTE-M', 'GSM-R', '5G-R', 'TETRA'],
    frequencyBands: ['450MHz', '800MHz', '900MHz', '1800MHz', '2600MHz', '3500MHz'],
    packetTypes: ['SIGNALING', 'DATA', 'VOICE', 'HANDSHAKE', 'KEEPALIVE'],
    sampleRate: process.env.SIGNALING_SAMPLE_RATE || 1000,
    bufferSize: process.env.SIGNALING_BUFFER_SIZE || 10000,
    priorityBufferSize: process.env.PRIORITY_BUFFER_SIZE || 2000,
    highPriorityPacketTypes: ['HANDSHAKE', 'KEEPALIVE', 'SIGNALING'],
    persistenceEnabled: true,
    persistenceDir: process.env.PERSISTENCE_DIR || './logs/signaling',
    persistenceInterval: process.env.PERSISTENCE_INTERVAL || 5000,
    lossDetectionEnabled: true,
    maxLostPackets: 10,
    recoveryEnabled: true,
    recoveryBatchSize: 50,
    batchInterval: process.env.BATCH_INTERVAL || 50,
    minEmitInterval: process.env.MIN_EMIT_INTERVAL || 100,
    adaptiveSampling: true,
    memoryThreshold: 0.8,
    cpuThreshold: 0.8,
    deduplicationWindow: 1000
  },
  playback: {
    enabled: true,
    dir: process.env.PLAYBACK_DIR || './logs/playback',
    compression: true,
    maxRecordedSessions: 100,
    maxDataPoints: 10000,
    autoRecord: false,
    autoRecordDuration: 60000
  },
  export: {
    enabled: true,
    dir: process.env.EXPORT_DIR || './logs/exports',
    maxSize: 52428800,
    maxConcurrent: 3,
    cleanupDays: 7,
    cleanupInterval: 86400000
  },
  analysis: {
    snr: {
      excellent: 30,
      good: 20,
      fair: 10,
      poor: 0
    },
    packetLoss: {
      excellent: 0.01,
      good: 0.1,
      fair: 1,
      poor: 5
    },
    latency: {
      excellent: 50,
      good: 100,
      fair: 200,
      poor: 500
    },
    jitter: {
      excellent: 10,
      good: 30,
      fair: 50,
      poor: 100
    },
    anomalyThreshold: {
      consecutiveErrors: 5,
      snrDrop: 15,
      packetLossSpike: 2
    }
  },
  nodes: {
    syncInterval: process.env.NODE_SYNC_INTERVAL || 3000,
    heartbeatInterval: process.env.HEARTBEAT_INTERVAL || 2000,
    timeoutThreshold: process.env.TIMEOUT_THRESHOLD || 10000,
    incrementalSync: true,
    incrementalSyncInterval: process.env.INCREMENTAL_SYNC_INTERVAL || 1000,
    prioritySync: true,
    maxParallelSyncs: 4,
    priorityNodes: ['NODE-001', 'NODE-002', 'NODE-003'],
    syncBatchSize: 50,
    deltaSyncEnabled: true,
    fastSyncOnStartup: true
  },
  ruleEngine: {
    enabled: true,
    evaluationInterval: 1000,
    defaultCooldown: 5000,
    handoverZones: [
      { station: '北京南站', startKm: 0, endKm: 5 },
      { station: '天津站', startKm: 100, endKm: 105 },
      { station: '济南西站', startKm: 400, endKm: 405 },
      { station: '徐州东站', startKm: 700, endKm: 705 },
      { station: '南京南站', startKm: 1000, endKm: 1005 },
      { station: '上海虹桥站', startKm: 1300, endKm: 1305 }
    ],
    speedThresholds: {
      low: 30,
      medium: 100,
      high: 200
    }
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    maxSize: '20m',
    maxFiles: '14d',
    dir: process.env.LOG_DIR || './logs',
    audit: {
      enabled: true,
      retentionDays: 90,
      categories: ['SYSTEM', 'USER', 'CONFIG', 'ANALYSIS', 'SYNC', 'ALERT']
    }
  }
};
