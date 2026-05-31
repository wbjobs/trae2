const express = require('express');
const router = express.Router();
const metrics = require('../monitoring/metrics');
const clusterMonitor = require('../monitoring/cluster');
const rateLimiter = require('../middleware/rateLimiter');
const logger = require('../utils/logger');

router.get('/metrics', (req, res) => {
  const format = req.query.format || 'prometheus';

  if (format === 'prometheus') {
    res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.send(metrics.formatPrometheus());
  } else {
    res.json({
      success: true,
      data: metrics.getStats()
    });
  }
});

router.get('/metrics/reset', async (req, res) => {
  metrics.reset();

  res.json({
    success: true,
    message: '指标已重置',
    code: 'SUCCESS'
  });
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
    logger.error(`获取集群实例失败: ${error.message}`);
    res.status(500).json({
      success: false,
      message: '获取集群实例失败',
      code: 'INTERNAL_ERROR',
      error: error.message
    });
  }
});

router.get('/cluster/stats', async (req, res) => {
  try {
    const clusterStats = await clusterMonitor.getStats();
    const queueStats = await require('../queue').getQueueStats();
    const alertStats = require('../alerting/engine').getStats();
    const metricStats = metrics.getStats();

    res.json({
      success: true,
      message: '获取集群统计成功',
      code: 'SUCCESS',
      data: {
        cluster: clusterStats,
        queue: queueStats,
        alerts: alertStats,
        metrics: metricStats,
        timestamp: Date.now()
      }
    });
  } catch (error) {
    logger.error(`获取集群统计失败: ${error.message}`);
    res.status(500).json({
      success: false,
      message: '获取集群统计失败',
      code: 'INTERNAL_ERROR',
      error: error.message
    });
  }
});

router.get('/rate-limit/stats', async (req, res) => {
  try {
    const stats = await rateLimiter.getStats();

    res.json({
      success: true,
      message: '获取限流统计成功',
      code: 'SUCCESS',
      data: stats
    });
  } catch (error) {
    logger.error(`获取限流统计失败: ${error.message}`);
    res.status(500).json({
      success: false,
      message: '获取限流统计失败',
      code: 'INTERNAL_ERROR',
      error: error.message
    });
  }
});

router.post('/rate-limit/reset', async (req, res) => {
  try {
    const { key } = req.body;

    if (key) {
      await rateLimiter.resetLimit(key);
    } else {
      await rateLimiter.resetAllLimits();
    }

    res.json({
      success: true,
      message: key ? `限流 ${key} 已重置` : '所有限流已重置',
      code: 'SUCCESS'
    });
  } catch (error) {
    logger.error(`重置限流失败: ${error.message}`);
    res.status(500).json({
      success: false,
      message: '重置限流失败',
      code: 'INTERNAL_ERROR',
      error: error.message
    });
  }
});

router.post('/rate-limit/tier', async (req, res) => {
  try {
    const { deviceId, tier } = req.body;

    if (!deviceId || !tier) {
      return res.status(400).json({
        success: false,
        message: 'deviceId和tier是必填项',
        code: 'MISSING_PARAMS'
      });
    }

    rateLimiter.setDeviceTier(deviceId, tier);

    res.json({
      success: true,
      message: '设备限流等级已设置',
      code: 'SUCCESS',
      data: {
        deviceId,
        tier,
        limits: rateLimiter.getTierLimits(tier)
      }
    });
  } catch (error) {
    logger.error(`设置设备限流等级失败: ${error.message}`);
    res.status(500).json({
      success: false,
      message: '设置设备限流等级失败',
      code: 'INTERNAL_ERROR',
      error: error.message
    });
  }
});

router.get('/rate-limit/tier/:deviceId?', async (req, res) => {
  try {
    const { deviceId } = req.params;

    if (deviceId) {
      const tier = rateLimiter.getDeviceTier(deviceId);
      res.json({
        success: true,
        code: 'SUCCESS',
        data: {
          deviceId,
          tier,
          limits: rateLimiter.getTierLimits(tier)
        }
      });
    } else {
      res.json({
        success: true,
        code: 'SUCCESS',
        data: rateLimiter.getTierLimits
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '获取设备限流等级失败',
      code: 'INTERNAL_ERROR',
      error: error.message
    });
  }
});

router.post('/cluster/broadcast', async (req, res) => {
  try {
    const { event, data } = req.body;

    if (!event) {
      return res.status(400).json({
        success: false,
        message: 'event是必填项',
        code: 'MISSING_PARAMS'
      });
    }

    await clusterMonitor.broadcastEvent(event, data || {});

    res.json({
      success: true,
      message: '事件已广播',
      code: 'SUCCESS'
    });
  } catch (error) {
    logger.error(`广播事件失败: ${error.message}`);
    res.status(500).json({
      success: false,
      message: '广播事件失败',
      code: 'INTERNAL_ERROR',
      error: error.message
    });
  }
});

router.get('/health', async (req, res) => {
  try {
    const clusterStats = await clusterMonitor.getStats();

    const isHealthy = clusterStats.alive > 0;

    res.status(isHealthy ? 200 : 503).json({
      success: isHealthy,
      message: isHealthy ? '集群健康' : '集群部分实例不可用',
      code: isHealthy ? 'SUCCESS' : 'UNHEALTHY',
      data: clusterStats
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      message: '集群健康检查失败',
      code: 'UNHEALTHY',
      error: error.message
    });
  }
});

module.exports = router;
