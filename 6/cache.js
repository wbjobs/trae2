const Redis = require('ioredis');
const config = require('./config');

class BlockCache {
  constructor() {
    this.redis = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      db: config.redis.db,
      keyPrefix: config.redis.keyPrefix,
    });
    this.blockKey = 'last_processed_block';
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.redis.on('connect', () => {
        console.log('[Cache] Redis connected successfully');
        resolve();
      });
      this.redis.on('error', (err) => {
        console.error('[Cache] Redis connection error:', err);
        reject(err);
      });
    });
  }

  async getLastProcessedBlock() {
    const block = await this.redis.get(this.blockKey);
    return block ? parseInt(block, 10) : config.blockchain.startBlock;
  }

  async setLastProcessedBlock(blockNumber) {
    await this.redis.set(this.blockKey, blockNumber.toString());
  }

  async getEventStatus(eventId) {
    return await this.redis.get(`event:${eventId}`);
  }

  async markEventProcessed(eventId) {
    await this.redis.set(`event:${eventId}`, 'processed', 'EX', 86400 * 7);
  }

  async isEventProcessed(eventId) {
    const status = await this.getEventStatus(eventId);
    return status === 'processed';
  }

  async disconnect() {
    await this.redis.quit();
  }
}

module.exports = BlockCache;
