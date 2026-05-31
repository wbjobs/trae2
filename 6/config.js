require('dotenv').config();

module.exports = {
  blockchain: {
    rpcUrl: process.env.ETH_RPC_URL || 'https://mainnet.infura.io/v3/your-infura-key',
    startBlock: parseInt(process.env.START_BLOCK) || 0,
    confirmations: parseInt(process.env.CONFIRMATIONS) || 12,
    pollInterval: parseInt(process.env.POLL_INTERVAL) || 15000,
    maxBlockRange: parseInt(process.env.MAX_BLOCK_RANGE) || 5000,
    concurrency: parseInt(process.env.CONCURRENCY) || 3,
  },
  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || '',
    db: parseInt(process.env.REDIS_DB) || 0,
    keyPrefix: process.env.REDIS_PREFIX || 'eth_listener:',
  },
  database: {
    mongodbUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/eth_events',
  },
  contracts: process.env.CONTRACT_ADDRESSES
    ? process.env.CONTRACT_ADDRESSES.split(',').map(a => a.trim()).filter(Boolean)
    : [],
  alert: {
    webhookUrl: process.env.ALERT_WEBHOOK_URL || '',
    enabled: process.env.ALERT_ENABLED === 'true',
    events: process.env.ALERT_EVENTS
      ? process.env.ALERT_EVENTS.split(',').map(e => e.trim()).filter(Boolean)
      : [],
    useLegacyAlert: process.env.USE_LEGACY_ALERT === 'true',
    rateLimit: parseInt(process.env.ALERT_RATE_LIMIT) || 10,
  },
  logger: {
    level: process.env.LOG_LEVEL || 'info',
  },
};
