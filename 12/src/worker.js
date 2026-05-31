const queueService = require('./queue');
const databaseService = require('./database/influxdb');
const alertEngine = require('./alerting/engine');
const clusterMonitor = require('./monitoring/cluster');
const metrics = require('./monitoring/metrics');
const logger = require('./utils/logger');
const config = require('./config');

const stats = {
  processed: 0,
  failed: 0,
  totalPoints: 0,
  avgDuration: 0,
  durations: [],
  startTime: Date.now(),
  lastProcessTime: null
};

const MAX_DURATION_SAMPLES = 1000;

const updateStats = (duration, pointsCount, success) => {
  if (success) {
    stats.processed++;
    stats.totalPoints += pointsCount;
    metrics.incrementCounter('queue_jobs_processed');
    metrics.recordPointsWritten(pointsCount);
  } else {
    stats.failed++;
    metrics.incrementCounter('queue_jobs_failed');
  }

  stats.durations.push(duration);
  if (stats.durations.length > MAX_DURATION_SAMPLES) {
    stats.durations.shift();
  }

  const sum = stats.durations.reduce((a, b) => a + b, 0);
  stats.avgDuration = sum / stats.durations.length;
  stats.lastProcessTime = Date.now();
};

const processDeviceData = async (job) => {
  const { data } = job;
  const startTime = Date.now();

  try {
    logger.debug(`开始处理任务: ${job.id}, 设备: ${data.deviceId}`);

    const result = await databaseService.writePointData(data);

    try {
      const alerts = await alertEngine.processData(data);
      if (alerts.length > 0) {
        logger.warn(`检测到 ${alerts.length} 条告警`, {
          deviceId: data.deviceId,
          jobId: job.id
        });
      }
    } catch (alertError) {
      logger.debug(`告警处理失败: ${alertError.message}`);
    }

    const duration = Date.now() - startTime;
    updateStats(duration, data.points.length, true);

    logger.info(`任务处理完成: ${job.id}`, {
      jobId: job.id,
      deviceId: data.deviceId,
      pointsCount: data.points.length,
      duration: `${duration}ms`,
      pointsWritten: result.pointsWritten
    });

    return {
      success: true,
      jobId: job.id,
      deviceId: data.deviceId,
      pointsWritten: result.pointsWritten,
      duration
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    updateStats(duration, data.points?.length || 0, false);

    logger.error(`任务处理失败: ${job.id}`, {
      jobId: job.id,
      deviceId: data.deviceId,
      error: error.message,
      duration: `${duration}ms`,
      attempt: job.attemptsMade + 1
    });

    if (job.attemptsMade >= config.queue.maxRetries - 1) {
      await clusterMonitor.sendSystemAlert('error', '任务处理最终失败', {
        jobId: job.id,
        deviceId: data.deviceId,
        error: error.message
      });
    }

    throw error;
  }
};

(async () => {
  try {
    await alertEngine.init();
    logger.info('告警引擎已初始化');
  } catch (error) {
    logger.error(`告警引擎初始化失败: ${error.message}`);
  }

  try {
    await clusterMonitor.register();
    clusterMonitor.startHeartbeat();
    logger.info('集群监控已初始化');
  } catch (error) {
    logger.error(`集群监控初始化失败: ${error.message}`);
  }

  clusterMonitor.subscribeToEvents((channel, data) => {
    if (channel === 'cluster:alerts') {
      logger.debug(`收到告警通知: ${data.alert?.alertId}`);
    }
  });
})();

const worker = queueService.createWorker(processDeviceData);

worker.on('completed', (job) => {
  logger.debug(`Job completed: ${job.id}`);
});

worker.on('failed', (job, err) => {
  if (job) {
    logger.error(`Job failed: ${job.id}, 错误: ${err.message}`);
  } else {
    logger.error(`Job failed with unknown ID, 错误: ${err.message}`);
  }
});

worker.on('stalled', (jobId) => {
  logger.warn(`Job stalled: ${jobId}`);
});

worker.on('drained', () => {
  logger.debug('队列已清空，所有任务处理完成');
});

setInterval(async () => {
  try {
    const queueStats = await queueService.getQueueStats();
    const writeStats = await databaseService.getWriteStats();

    metrics.setGauge('queue_depth_waiting', queueStats.waiting || 0);
    metrics.setGauge('queue_depth_active', queueStats.active || 0);
    metrics.setGauge('influx_write_buffer_size', writeStats.bufferSize || 0);

    const alertStats = alertEngine.getStats();
    metrics.setGauge('active_alerts', alertStats.activeAlerts || 0);
    metrics.setGauge('active_rules', alertStats.totalRules || 0);

    const uptime = Math.floor((Date.now() - stats.startTime) / 1000);
    const throughput = stats.processed / (uptime / 60) || 0;

    logger.info('Worker统计信息', {
      worker: {
        pid: process.pid,
        uptime: `${uptime}s`,
        processed: stats.processed,
        failed: stats.failed,
        totalPoints: stats.totalPoints,
        avgDuration: `${Math.round(stats.avgDuration)}ms`,
        throughput: `${throughput.toFixed(2)} jobs/min`
      },
      queue: queueStats,
      buffer: writeStats
    });

    if (queueStats.status === 'critical') {
      logger.error('队列积压严重，建议增加Worker实例', {
        waiting: queueStats.waiting,
        threshold: config.monitoring.queueDepthThreshold
      });

      await clusterMonitor.sendSystemAlert('warning', '队列积压严重', {
        waiting: queueStats.waiting,
        threshold: config.monitoring.queueDepthThreshold,
        suggestion: '增加Worker实例或优化消费速度'
      });
    }
  } catch (error) {
    logger.error(`统计信息获取失败: ${error.message}`);
  }
}, 30000);

const shutdown = async (signal) => {
  logger.info(`收到${signal}信号，正在关闭Worker...`);

  try {
    await databaseService.flushBuffer();

    await worker.close(true);
    await queueService.close();
    await databaseService.close();
    await alertEngine.close();
    await clusterMonitor.unregister();

    logger.info('Worker已正常关闭', {
      finalStats: {
        processed: stats.processed,
        failed: stats.failed,
        totalPoints: stats.totalPoints
      }
    });
    process.exit(0);
  } catch (error) {
    logger.error('Worker关闭时发生错误:', error);
    process.exit(1);
  }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('uncaughtException', (error) => {
  logger.error(`未捕获的异常: ${error.message}`, {
    stack: error.stack
  });
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error(`未处理的Promise拒绝: ${reason}`);
});

logger.info(`Worker已启动`, {
  concurrency: config.queue.concurrency,
  queueName: config.queue.name,
  pid: process.pid,
  batchSize: config.queue.batchSize
});

console.log(`🔧 Worker已启动，并发数: ${config.queue.concurrency}`);
console.log(`📦 队列名称: ${config.queue.name}`);
console.log(`📊 批处理大小: ${config.queue.batchSize}`);
console.log(`📝 监听设备数据写入InfluxDB...`);
console.log(`⚠️  积压告警阈值: ${config.monitoring.queueDepthThreshold}`);
console.log(`🔔 告警引擎已启用`);

module.exports = worker;
