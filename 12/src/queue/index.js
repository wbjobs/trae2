const { Queue, Worker, QueueEvents, FlowProducer } = require('bullmq');
const IORedis = require('ioredis');
const config = require('../config');
const logger = require('../utils/logger');

const redisConnection = new IORedis({
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  db: config.redis.db,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  reconnectOnError: (err) => {
    logger.error(`Redis连接错误: ${err.message}`);
    return true;
  }
});

redisConnection.on('connect', () => {
  logger.info('Redis连接成功');
});

redisConnection.on('error', (err) => {
  logger.error(`Redis连接错误: ${err.message}`);
});

const deviceDataQueue = new Queue(config.queue.name, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: config.queue.maxRetries,
    backoff: {
      type: 'exponential',
      delay: config.queue.backoffDelay
    },
    removeOnComplete: 1000,
    removeOnFail: 5000,
    timeout: 30000
  }
});

const queueEvents = new QueueEvents(config.queue.name, {
  connection: redisConnection
});

queueEvents.on('completed', ({ jobId }) => {
  logger.debug(`任务完成: ${jobId}`);
});

queueEvents.on('failed', ({ jobId, failedReason }) => {
  logger.error(`任务失败: ${jobId}, 原因: ${failedReason}`);
});

queueEvents.on('stalled', ({ jobId }) => {
  logger.warn(`任务卡住: ${jobId}`);
});

const queueService = {
  async addDeviceData(data) {
    try {
      const job = await deviceDataQueue.add('device_data', data, {
        priority: data.priority || 10,
        jobId: `${data.deviceId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      });
      logger.debug(`数据已加入队列: ${job.id}, 设备: ${data.deviceId}`);
      return job;
    } catch (error) {
      logger.error(`加入队列失败: ${error.message}`);
      throw error;
    }
  },

  async addBatchDeviceData(dataArray) {
    try {
      const jobs = await deviceDataQueue.addBulk(
        dataArray.map((data, index) => ({
          name: 'device_data',
          data,
          opts: {
            priority: data.priority || 10,
            jobId: `${data.deviceId}_${Date.now()}_${index}`
          }
        }))
      );
      logger.debug(`批量数据已加入队列: ${jobs.length} 条`);
      return jobs;
    } catch (error) {
      logger.error(`批量加入队列失败: ${error.message}`);
      throw error;
    }
  },

  async getQueueStats() {
    try {
      const counts = await deviceDataQueue.getJobCounts(
        'active',
        'waiting',
        'completed',
        'failed',
        'delayed',
        'paused'
      );

      const waitingCount = counts.waiting || 0;
      const activeCount = counts.active || 0;
      const totalPending = waitingCount + activeCount;

      let status = 'healthy';
      if (totalPending > config.monitoring.queueDepthThreshold) {
        status = 'critical';
      } else if (totalPending > config.monitoring.queueDepthWarning) {
        status = 'warning';
      }

      return {
        ...counts,
        totalPending,
        status,
        queueName: config.queue.name,
        concurrency: config.queue.concurrency,
        timestamp: Date.now()
      };
    } catch (error) {
      logger.error(`获取队列状态失败: ${error.message}`);
      throw error;
    }
  },

  async monitorQueueHealth() {
    try {
      const stats = await this.getQueueStats();

      if (stats.status === 'critical') {
        logger.error(`队列深度告警: ${stats.totalPending} 条待处理任务`, {
          stats
        });
      } else if (stats.status === 'warning') {
        logger.warn(`队列深度警告: ${stats.totalPending} 条待处理任务`, {
          stats
        });
      }

      return stats;
    } catch (error) {
      logger.error(`队列健康检查失败: ${error.message}`);
      throw error;
    }
  },

  async getFailedJobs(limit = 100) {
    try {
      const jobs = await deviceDataQueue.getFailed(0, limit - 1);
      return jobs.map(job => ({
        id: job.id,
        data: job.data,
        failedReason: job.failedReason,
        attemptsMade: job.attemptsMade,
        processedOn: job.processedOn
      }));
    } catch (error) {
      logger.error(`获取失败任务列表失败: ${error.message}`);
      throw error;
    }
  },

  async retryFailedJobs(jobIds) {
    try {
      const results = [];
      for (const jobId of jobIds) {
        try {
          const job = await deviceDataQueue.getJob(jobId);
          if (job) {
            await job.retry();
            results.push({ id: jobId, status: 'retried' });
          } else {
            results.push({ id: jobId, status: 'not_found' });
          }
        } catch (err) {
          results.push({ id: jobId, status: 'error', error: err.message });
        }
      }
      return results;
    } catch (error) {
      logger.error(`重试失败任务失败: ${error.message}`);
      throw error;
    }
  },

  async pauseQueue() {
    await deviceDataQueue.pause();
    logger.info('队列已暂停');
  },

  async resumeQueue() {
    await deviceDataQueue.resume();
    logger.info('队列已恢复');
  },

  async clearQueue() {
    await deviceDataQueue.drain();
    logger.info('队列已清空');
  },

  async removeCompletedJobs() {
    await deviceDataQueue.clean(1000, 10000);
    logger.info('已清理完成的任务');
  },

  createWorker(processor) {
    const worker = new Worker(config.queue.name, processor, {
      connection: redisConnection,
      concurrency: config.queue.concurrency,
      stalledInterval: config.queue.stalledInterval,
      maxStalledCount: config.queue.maxStalledCount,
      lockDuration: 30000,
      lockRenewTime: 15000
    });

    worker.on('error', (err) => {
      logger.error(`Worker错误: ${err.message}`);
    });

    worker.on('stalled', (jobId) => {
      logger.warn(`Worker检测到卡住的任务: ${jobId}`);
    });

    return worker;
  },

  async createBulkProcessor(processor, options = {}) {
    const {
      batchSize = config.queue.batchSize,
      groupBy = 'deviceId'
    } = options;

    const flowProducer = new FlowProducer({ connection: redisConnection });

    const processBatch = async (jobs) => {
      const grouped = {};

      for (const job of jobs) {
        const key = job.data[groupBy] || 'default';
        if (!grouped[key]) {
          grouped[key] = [];
        }
        grouped[key].push(job.data);
      }

      const results = [];
      for (const [key, dataArray] of Object.entries(grouped)) {
        try {
          const result = await processor(dataArray, key);
          results.push({ key, status: 'success', result });
        } catch (error) {
          results.push({ key, status: 'error', error: error.message });
        }
      }

      return results;
    };

    return { flowProducer, processBatch };
  },

  getQueue() {
    return deviceDataQueue;
  },

  getRedisConnection() {
    return redisConnection;
  },

  async close() {
    await deviceDataQueue.close();
    await queueEvents.close();
    await redisConnection.quit();
    logger.info('队列服务已关闭');
  }
};

const startHealthMonitor = () => {
  setInterval(async () => {
    try {
      await queueService.monitorQueueHealth();
    } catch (error) {
      logger.error(`队列健康监控失败: ${error.message}`);
    }
  }, config.monitoring.healthCheckInterval);
};

if (process.env.NODE_ENV === 'production') {
  startHealthMonitor();
}

module.exports = queueService;
