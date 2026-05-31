const Queue = require('bull');
const { config, AlertLevel } = require('../config');
const logger = require('../utils/logger');
const redisClient = require('../utils/redis');
const alertThresholdService = require('./alertThreshold.service');
const kafkaProducerService = require('./kafkaProducer.service');
const influxDBService = require('./influxdb.service');

class TaskSchedulerService {
  constructor() {
    this.queues = {};
    this.workers = {};
    this.init();
  }

  init() {
    try {
      const redisConfig = {
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password,
        db: config.redis.db
      };

      this.queues.corrosionData = new Queue('corrosion-data-processing', {
        redis: redisConfig,
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 1000
          },
          removeOnComplete: true,
          removeOnFail: 100,
          timeout: 30000
        },
        settings: {
          maxStalledCount: 1,
          stalledInterval: 30000
        }
      });

      this.queues.alertProcessing = new Queue('alert-processing', {
        redis: redisConfig,
        defaultJobOptions: {
          attempts: 5,
          backoff: {
            type: 'exponential',
            delay: 2000
          },
          removeOnComplete: true,
          removeOnFail: 500,
          timeout: 30000
        },
        settings: {
          maxStalledCount: 2,
          stalledInterval: 30000
        }
      });

      this.queues.batchProcessing = new Queue('batch-processing', {
        redis: redisConfig,
        defaultJobOptions: {
          attempts: 2,
          backoff: {
            type: 'exponential',
            delay: 5000
          },
          removeOnComplete: true,
          removeOnFail: 100,
          timeout: 120000
        },
        settings: {
          maxStalledCount: 1,
          stalledInterval: 60000
        }
      });

      this.setupProcessors();
      logger.info('Task scheduler initialized successfully');
    } catch (err) {
      logger.error('Failed to initialize task scheduler:', err);
    }
  }

  setupProcessors() {
    const { taskQueue } = config;

    this.queues.corrosionData.process(taskQueue.corrosionConcurrency, async (job) => {
      return this.processCorrosionData(job.data);
    });

    this.queues.alertProcessing.process(taskQueue.alertConcurrency, async (job) => {
      return this.processAlert(job.data);
    });

    this.queues.batchProcessing.process(taskQueue.batchConcurrency, async (job) => {
      return this.processBatch(job.data);
    });

    this.queues.corrosionData.on('failed', (job, err) => {
      logger.error(`Corrosion data job ${job.id} failed:`, err.message);
    });

    this.queues.alertProcessing.on('failed', (job, err) => {
      logger.error(`Alert processing job ${job.id} failed:`, err.message);
    });

    this.queues.corrosionData.on('completed', (job) => {
      logger.debug(`Corrosion data job ${job.id} completed`);
    });
  }

  async processCorrosionData(data) {
    try {
      logger.debug(`Processing corrosion data for device ${data.deviceId}`);

      const alertResult = await alertThresholdService.evaluateCorrosionData(data.corrosion);

      if (alertResult.isAlert) {
        const isSuppressed = await alertThresholdService.shouldSuppressAlert(
          data.deviceId,
          alertResult.level
        );

        const isDuplicateAlert = await alertThresholdService.isDuplicateAlert(
          data.deviceId,
          alertResult.level,
          data.timestamp
        );

        if (!isSuppressed && !isDuplicateAlert) {
          const alert = await alertThresholdService.generateAlertMessage(
            data.deviceId,
            data.location,
            data.corrosion,
            alertResult,
            data.timestamp
          );

          await alertThresholdService.markAlertSent(
            data.deviceId,
            alertResult.level,
            alert.alertId
          );

          await this.queues.alertProcessing.add(alert, {
            priority: this.getAlertPriority(alert.level),
            jobId: `alert:${alert.alertId}`
          });
        } else if (isDuplicateAlert) {
          logger.debug(`Duplicate alert skipped: device=${data.deviceId}, level=${alertResult.level}`);
        } else {
          logger.debug(`Alert suppressed: device=${data.deviceId}, level=${alertResult.level}`);
        }
      }

      const dbSuccess = await influxDBService.writeCorrosionData(data);
      if (!dbSuccess) {
        await this.writeToDeadLetterQueue('corrosion_data', data, 'INFLUXDB_WRITE_FAILED');
      }

      const kafkaResult = await kafkaProducerService.sendRawData(data);
      if (kafkaResult?.status === 'queued') {
        await this.writeToDeadLetterQueue('kafka_messages', data, 'KAFKA_NOT_CONNECTED');
      }

      await redisClient.incr('stats:total_processed');
      await redisClient.hset('device:last_seen', data.deviceId, Date.now());

      return {
        success: true,
        deviceId: data.deviceId,
        alertLevel: alertResult.level,
        isAlert: alertResult.isAlert,
        dbSuccess,
        kafkaSuccess: kafkaResult?.status !== 'queued'
      };
    } catch (err) {
      logger.error('Error processing corrosion data:', err);
      await this.writeToDeadLetterQueue('corrosion_data', data, err.message);
      throw err;
    }
  }

  async processAlert(alert) {
    try {
      logger.info(`Processing alert: ${alert.alertId}, level: ${alert.level}`);

      const processedKey = `alert:processed:${alert.alertId}`;
      const alreadyProcessed = await redisClient.getClient().set(processedKey, '1', 'NX', 'EX', 86400);
      if (alreadyProcessed !== 'OK') {
        logger.warn(`Alert ${alert.alertId} already processed, skipping`);
        return {
          success: true,
          alertId: alert.alertId,
          skipped: true,
          reason: 'already_processed'
        };
      }

      const kafkaResult = await kafkaProducerService.sendAlert(alert);
      if (kafkaResult?.status === 'queued') {
        await this.writeToDeadLetterQueue('alerts', alert, 'KAFKA_NOT_CONNECTED');
      }

      const dbSuccess = await influxDBService.writeAlert(alert);
      if (!dbSuccess) {
        await this.writeToDeadLetterQueue('alerts', alert, 'INFLUXDB_WRITE_FAILED');
      }

      await redisClient.incr(`stats:alerts:${alert.level}`);
      await redisClient.incr('stats:alerts:total');

      await this.updateActiveAlerts(alert);

      return {
        success: true,
        alertId: alert.alertId,
        level: alert.level,
        kafkaSuccess: kafkaResult?.status !== 'queued',
        dbSuccess
      };
    } catch (err) {
      logger.error('Error processing alert:', err);
      await this.writeToDeadLetterQueue('alerts', alert, err.message);
      throw err;
    }
  }

  async processBatch(batchData) {
    const { batchId, records } = batchData;
    logger.info(`Processing batch ${batchId} with ${records.length} records`);

    const sortedRecords = [...records].sort((a, b) => a.timestamp - b.timestamp);

    const results = [];
    const alerts = [];
    const successRecords = [];
    const failedRecords = [];

    for (const record of sortedRecords) {
      try {
        const alertResult = await alertThresholdService.evaluateCorrosionData(record.corrosion);

        if (alertResult.isAlert) {
          const isSuppressed = await alertThresholdService.shouldSuppressAlert(
            record.deviceId,
            alertResult.level
          );

          const isDuplicateAlert = await alertThresholdService.isDuplicateAlert(
            record.deviceId,
            alertResult.level,
            record.timestamp
          );

          if (!isSuppressed && !isDuplicateAlert) {
            const alert = await alertThresholdService.generateAlertMessage(
              record.deviceId,
              record.location,
              record.corrosion,
              alertResult,
              record.timestamp
            );

            await alertThresholdService.markAlertSent(
              record.deviceId,
              alertResult.level,
              alert.alertId
            );

            alerts.push(alert);
          }
        }

        successRecords.push(record);
        results.push({
          deviceId: record.deviceId,
          success: true,
          alertLevel: alertResult.level
        });
      } catch (err) {
        failedRecords.push({ record, error: err.message });
        results.push({
          deviceId: record.deviceId,
          success: false,
          error: err.message
        });
      }
    }

    if (successRecords.length > 0) {
      const dbSuccess = await influxDBService.writeCorrosionDataBatch(sortedRecords);
      if (!dbSuccess) {
        for (const record of successRecords) {
          await this.writeToDeadLetterQueue('corrosion_data', record, 'INFLUXDB_BATCH_WRITE_FAILED');
        }
      }

      const kafkaResult = await kafkaProducerService.sendRawDataBatch(sortedRecords);
      if (!kafkaResult) {
        for (const record of successRecords) {
          await this.writeToDeadLetterQueue('kafka_messages', record, 'KAFKA_BATCH_SEND_FAILED');
        }
      }
    }

    for (const failed of failedRecords) {
      await this.writeToDeadLetterQueue('corrosion_data', failed.record, failed.error);
    }

    if (alerts.length > 0) {
      for (const alert of alerts) {
        await this.queues.alertProcessing.add(alert, {
          priority: this.getAlertPriority(alert.level),
          jobId: `alert:${alert.alertId}`
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    logger.info(`Batch ${batchId} processed: ${successCount}/${records.length} successful, ${alerts.length} alerts`);

    await redisClient.incrby('stats:total_processed', successCount);

    return {
      batchId,
      total: records.length,
      success: successCount,
      failed: records.length - successCount,
      alertsGenerated: alerts.length,
      results
    };
  }

  async addCorrosionDataJob(data) {
    return this.queues.corrosionData.add(data, {
      jobId: `corrosion:${data.deviceId}:${data.timestamp}`
    });
  }

  async addBatchJob(batchData) {
    return this.queues.batchProcessing.add(batchData, {
      jobId: `batch:${batchData.batchId}`
    });
  }

  async addAlertJob(alert) {
    return this.queues.alertProcessing.add(alert, {
      priority: this.getAlertPriority(alert.level),
      jobId: `alert:${alert.alertId}`
    });
  }

  getAlertPriority(level) {
    const priorities = {
      [AlertLevel.EMERGENCY]: 1,
      [AlertLevel.CRITICAL]: 2,
      [AlertLevel.WARNING]: 3,
      [AlertLevel.NORMAL]: 4
    };
    return priorities[level] || 4;
  }

  async updateActiveAlerts(alert) {
    const activeAlertsKey = `alerts:active:${alert.deviceId}`;
    await redisClient.hset(activeAlertsKey, alert.alertId, JSON.stringify(alert));
    await redisClient.expire(activeAlertsKey, 86400);
  }

  async getQueueStats() {
    const stats = {};
    for (const [name, queue] of Object.entries(this.queues)) {
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getCompletedCount(),
        queue.getFailedCount(),
        queue.getDelayedCount()
      ]);

      stats[name] = {
        waiting,
        active,
        completed,
        failed,
        delayed
      };
    }
    return stats;
  }

  async writeToDeadLetterQueue(queueName, data, errorMessage) {
    try {
      const dtlKey = `dlq:${queueName}`;
      const dtlEntry = {
        data,
        error: errorMessage,
        timestamp: Date.now(),
        retryCount: 0
      };
      await redisClient.getClient().lpush(dtlKey, JSON.stringify(dtlEntry));
      await redisClient.getClient().ltrim(dtlKey, 0, 10000);
      await redisClient.incr(`stats:dlq:${queueName}`);
      logger.warn(`Written to DLQ ${queueName}: ${errorMessage}`);
    } catch (err) {
      logger.error('Failed to write to DLQ:', err);
    }
  }

  async getDeadLetterQueue(queueName, limit = 100) {
    const dtlKey = `dlq:${queueName}`;
    const items = await redisClient.getClient().lrange(dtlKey, 0, limit - 1);
    return items.map(item => JSON.parse(item));
  }

  async getSystemStats() {
    const [totalProcessed, totalAlerts, alertByLevel, dlqStats] = await Promise.all([
      redisClient.get('stats:total_processed'),
      redisClient.get('stats:alerts:total'),
      Promise.all([
        redisClient.get('stats:alerts:emergency'),
        redisClient.get('stats:alerts:critical'),
        redisClient.get('stats:alerts:warning')
      ]),
      Promise.all([
        redisClient.get('stats:dlq:corrosion_data'),
        redisClient.get('stats:dlq:alerts'),
        redisClient.get('stats:dlq:kafka_messages')
      ])
    ]);

    return {
      totalProcessed: parseInt(totalProcessed) || 0,
      totalAlerts: parseInt(totalAlerts) || 0,
      alertsByLevel: {
        emergency: parseInt(alertByLevel[0]) || 0,
        critical: parseInt(alertByLevel[1]) || 0,
        warning: parseInt(alertByLevel[2]) || 0
      },
      deadLetterQueue: {
        corrosion_data: parseInt(dlqStats[0]) || 0,
        alerts: parseInt(dlqStats[1]) || 0,
        kafka_messages: parseInt(dlqStats[2]) || 0
      }
    };
  }

  async close() {
    for (const queue of Object.values(this.queues)) {
      await queue.close();
    }
    logger.info('Task scheduler closed');
  }
}

module.exports = new TaskSchedulerService();
