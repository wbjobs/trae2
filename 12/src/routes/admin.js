const express = require('express');
const router = express.Router();
const queueService = require('../queue');
const databaseService = require('../database/influxdb');
const clusterMonitor = require('../monitoring/cluster');
const alertEngine = require('../alerting/engine');
const metrics = require('../monitoring/metrics');
const config = require('../config');

router.get('/health', async (req, res) => {
  try {
    const queueStats = await queueService.getQueueStats();
    const writeStats = await databaseService.getWriteStats();
    const clusterStats = await clusterMonitor.getStats();

    const isHealthy = queueStats.status !== 'critical' && clusterStats.alive > 0;
    const status = isHealthy ? 'healthy' : 'degraded';

    res.status(isHealthy ? 200 : 503).json({
      success: isHealthy,
      message: isHealthy ? '服务运行正常' : '服务降级运行',
      code: 'SUCCESS',
      data: {
        status,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        pid: process.pid,
        memory: process.memoryUsage(),
        nodeEnv: config.nodeEnv,
        version: process.version,
        queue: {
          status: queueStats.status,
          waiting: queueStats.waiting,
          active: queueStats.active,
          failed: queueStats.failed
        },
        buffer: writeStats,
        cluster: {
          total: clusterStats.total,
          alive: clusterStats.alive,
          apiCount: clusterStats.apiCount,
          workerCount: clusterStats.workerCount
        }
      }
    });
  } catch (error) {
    res.status(200).json({
      success: true,
      message: '服务运行正常(部分监控不可用)',
      code: 'SUCCESS',
      data: {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        pid: process.pid,
        memory: process.memoryUsage(),
        nodeEnv: config.nodeEnv,
        version: process.version
      }
    });
  }
});

router.get('/cluster/stats', async (req, res) => {
  try {
    const clusterStats = await clusterMonitor.getStats();
    const alertStats = alertEngine.getStats();
    const metricStats = metrics.getStats();

    res.json({
      success: true,
      message: '集群状态获取成功',
      code: 'SUCCESS',
      data: {
        cluster: clusterStats,
        alerts: alertStats,
        metrics: {
          counter: metricStats.counter,
          gauge: metricStats.gauge
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '获取集群状态失败',
      code: 'INTERNAL_ERROR',
      error: error.message
    });
  }
});

router.get('/cluster/instances', async (req, res) => {
  try {
    const instances = await clusterMonitor.getInstances();

    res.json({
      success: true,
      message: '获取集群实例成功',
      code: 'SUCCESS',
      data: {
        count: instances.length,
        instances
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '获取集群实例失败',
      code: 'INTERNAL_ERROR',
      error: error.message
    });
  }
});

router.get('/queue/stats', async (req, res) => {
  try {
    const stats = await queueService.getQueueStats();

    res.json({
      success: true,
      message: '队列状态获取成功',
      code: 'SUCCESS',
      data: {
        queueName: config.queue.name,
        stats,
        concurrency: config.queue.concurrency,
        batchSize: config.queue.batchSize,
        maxRetries: config.queue.maxRetries
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '获取队列状态失败',
      code: 'INTERNAL_ERROR',
      error: error.message
    });
  }
});

router.get('/queue/failed', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 100;
    const jobs = await queueService.getFailedJobs(limit);

    res.json({
      success: true,
      message: '获取失败任务列表成功',
      code: 'SUCCESS',
      data: {
        count: jobs.length,
        jobs
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '获取失败任务列表失败',
      code: 'INTERNAL_ERROR',
      error: error.message
    });
  }
});

router.post('/queue/retry', async (req, res) => {
  try {
    const { jobIds } = req.body;

    if (!Array.isArray(jobIds) || jobIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: '请提供要重试的任务ID列表',
        code: 'INVALID_PARAMS'
      });
    }

    const results = await queueService.retryFailedJobs(jobIds);

    res.json({
      success: true,
      message: '任务重试请求已提交',
      code: 'SUCCESS',
      data: {
        results
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '任务重试失败',
      code: 'INTERNAL_ERROR',
      error: error.message
    });
  }
});

router.post('/queue/pause', async (req, res) => {
  try {
    await queueService.pauseQueue();

    res.json({
      success: true,
      message: '队列已暂停',
      code: 'SUCCESS'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '暂停队列失败',
      code: 'INTERNAL_ERROR',
      error: error.message
    });
  }
});

router.post('/queue/resume', async (req, res) => {
  try {
    await queueService.resumeQueue();

    res.json({
      success: true,
      message: '队列已恢复',
      code: 'SUCCESS'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '恢复队列失败',
      code: 'INTERNAL_ERROR',
      error: error.message
    });
  }
});

router.delete('/queue/clear', async (req, res) => {
  try {
    await queueService.clearQueue();

    res.json({
      success: true,
      message: '队列已清空',
      code: 'SUCCESS'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '清空队列失败',
      code: 'INTERNAL_ERROR',
      error: error.message
    });
  }
});

router.post('/queue/clean', async (req, res) => {
  try {
    await queueService.removeCompletedJobs();

    res.json({
      success: true,
      message: '已清理完成的任务',
      code: 'SUCCESS'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '清理任务失败',
      code: 'INTERNAL_ERROR',
      error: error.message
    });
  }
});

router.post('/database/flush', async (req, res) => {
  try {
    await databaseService.flushBuffer();
    const stats = await databaseService.getWriteStats();

    res.json({
      success: true,
      message: '数据库缓冲区已刷新',
      code: 'SUCCESS',
      data: stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '刷新数据库缓冲区失败',
      code: 'INTERNAL_ERROR',
      error: error.message
    });
  }
});

router.get('/database/stats', async (req, res) => {
  try {
    const stats = await databaseService.getWriteStats();

    res.json({
      success: true,
      message: '数据库状态获取成功',
      code: 'SUCCESS',
      data: {
        ...stats,
        influxdb: {
          url: config.influxdb.url,
          org: config.influxdb.org,
          bucket: config.influxdb.bucket,
          batchSize: config.influxdb.batchSize,
          flushInterval: config.influxdb.flushInterval
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '获取数据库状态失败',
      code: 'INTERNAL_ERROR',
      error: error.message
    });
  }
});

router.get('/alerts/stats', async (req, res) => {
  try {
    const stats = alertEngine.getStats();

    res.json({
      success: true,
      message: '告警统计获取成功',
      code: 'SUCCESS',
      data: stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '获取告警统计失败',
      code: 'INTERNAL_ERROR',
      error: error.message
    });
  }
});

router.get('/alerts/active', async (req, res) => {
  try {
    const { status, severity, deviceId, limit = 100, offset = 0 } = req.query;

    const filters = {};
    if (status) filters.status = status;
    if (severity) filters.severity = severity;
    if (deviceId) filters.deviceId = deviceId;

    let alerts = alertEngine.getActiveAlerts(filters);

    const total = alerts.length;
    alerts = alerts.slice(parseInt(offset, 10), parseInt(offset, 10) + parseInt(limit, 10));

    res.json({
      success: true,
      message: '获取活跃告警成功',
      code: 'SUCCESS',
      data: {
        total,
        count: alerts.length,
        alerts
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '获取活跃告警失败',
      code: 'INTERNAL_ERROR',
      error: error.message
    });
  }
});

router.post('/alerts/test', async (req, res) => {
  try {
    const { deviceId, tagId, value, quality, timestamp } = req.body;

    if (!deviceId || !tagId) {
      return res.status(400).json({
        success: false,
        message: 'deviceId和tagId是必填项',
        code: 'MISSING_PARAMS'
      });
    }

    const alerts = await alertEngine.processDataPoint(
      deviceId,
      tagId,
      value,
      quality || 192,
      timestamp || Date.now()
    );

    res.json({
      success: true,
      message: '告警测试完成',
      code: 'SUCCESS',
      data: {
        triggered: alerts.length > 0,
        alerts
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '告警测试失败',
      code: 'INTERNAL_ERROR',
      error: error.message
    });
  }
});

router.get('/config', (req, res) => {
  res.json({
    success: true,
    message: '配置获取成功',
    code: 'SUCCESS',
    data: {
      rateLimit: config.rateLimit,
      queue: {
        name: config.queue.name,
        concurrency: config.queue.concurrency,
        batchSize: config.queue.batchSize,
        maxRetries: config.queue.maxRetries
      },
      influxdb: {
        batchSize: config.influxdb.batchSize,
        flushInterval: config.influxdb.flushInterval,
        retryAttempts: config.influxdb.retryAttempts
      },
      monitoring: config.monitoring
    }
  });
});

router.get('/info', (req, res) => {
  res.json({
    success: true,
    message: '系统信息获取成功',
    code: 'SUCCESS',
    data: {
      service: 'industrial-device-api-cluster',
      version: '2.0.0',
      description: '工业现场设备点位状态异步上报API集群服务',
      features: [
        '设备点位状态异步接收',
        '数据格式校验',
        '消息队列分发',
        '时序数据库写入',
        '接口访问权限管控',
        '多设备并行接入',
        '跨实例服务调用',
        'API限流保护',
        '队列积压监控',
        '服务降级熔断',
        '批量处理优化',
        '设备异常告警',
        'Prometheus指标',
        '集群状态监控'
      ],
      supportedProtocols: [
        'Modbus',
        'OPC-UA',
        'Siemens-S7',
        'Ethernet/IP',
        'FINS',
        'MQTT',
        'HTTP',
        'Custom'
      ],
      endpoints: {
        auth: '/api/auth',
        device: '/api/device',
        admin: '/api/admin',
        alerts: '/api/alerts',
        monitoring: '/api/monitoring'
      }
    }
  });
});

module.exports = router;
