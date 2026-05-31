const express = require('express');
const router = express.Router();
const alertEngine = require('../alerting/engine');
const logger = require('../utils/logger');

router.get('/rules', async (req, res) => {
  try {
    const { enabled, deviceId, severity } = req.query;

    const filters = {};
    if (enabled !== undefined) filters.enabled = enabled === 'true';
    if (deviceId) filters.deviceId = deviceId;
    if (severity) filters.severity = severity;

    const rules = alertEngine.getAllRules(filters);

    res.json({
      success: true,
      message: '获取告警规则成功',
      code: 'SUCCESS',
      data: {
        count: rules.length,
        rules
      }
    });
  } catch (error) {
    logger.error(`获取告警规则失败: ${error.message}`);
    res.status(500).json({
      success: false,
      message: '获取告警规则失败',
      code: 'INTERNAL_ERROR',
      error: error.message
    });
  }
});

router.get('/rules/:ruleId', async (req, res) => {
  try {
    const { ruleId } = req.params;
    const rule = alertEngine.getRule(ruleId);

    if (!rule) {
      return res.status(404).json({
        success: false,
        message: '告警规则不存在',
        code: 'NOT_FOUND'
      });
    }

    res.json({
      success: true,
      message: '获取告警规则成功',
      code: 'SUCCESS',
      data: rule
    });
  } catch (error) {
    logger.error(`获取告警规则失败: ${error.message}`);
    res.status(500).json({
      success: false,
      message: '获取告警规则失败',
      code: 'INTERNAL_ERROR',
      error: error.message
    });
  }
});

router.post('/rules', async (req, res) => {
  try {
    const rule = await alertEngine.addRule(req.validatedRule);

    res.status(201).json({
      success: true,
      message: '告警规则创建成功',
      code: 'SUCCESS',
      data: rule
    });
  } catch (error) {
    logger.error(`创建告警规则失败: ${error.message}`);
    res.status(500).json({
      success: false,
      message: '创建告警规则失败',
      code: 'INTERNAL_ERROR',
      error: error.message
    });
  }
});

router.put('/rules/:ruleId', async (req, res) => {
  try {
    const { ruleId } = req.params;
    const rule = await alertEngine.updateRule(ruleId, req.validatedRule);

    res.json({
      success: true,
      message: '告警规则更新成功',
      code: 'SUCCESS',
      data: rule
    });
  } catch (error) {
    logger.error(`更新告警规则失败: ${error.message}`);

    if (error.message.includes('不存在')) {
      return res.status(404).json({
        success: false,
        message: error.message,
        code: 'NOT_FOUND'
      });
    }

    res.status(500).json({
      success: false,
      message: '更新告警规则失败',
      code: 'INTERNAL_ERROR',
      error: error.message
    });
  }
});

router.delete('/rules/:ruleId', async (req, res) => {
  try {
    const { ruleId } = req.params;
    const deleted = await alertEngine.deleteRule(ruleId);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: '告警规则不存在',
        code: 'NOT_FOUND'
      });
    }

    res.json({
      success: true,
      message: '告警规则删除成功',
      code: 'SUCCESS'
    });
  } catch (error) {
    logger.error(`删除告警规则失败: ${error.message}`);
    res.status(500).json({
      success: false,
      message: '删除告警规则失败',
      code: 'INTERNAL_ERROR',
      error: error.message
    });
  }
});

router.get('/active', async (req, res) => {
  try {
    const { status, severity, deviceId, acknowledged, limit, offset } = req.validatedQuery || {};

    const filters = {};
    if (status) filters.status = status;
    if (severity) filters.severity = severity;
    if (deviceId) filters.deviceId = deviceId;
    if (acknowledged !== undefined) filters.acknowledged = acknowledged === 'true';

    let alerts = alertEngine.getActiveAlerts(filters);

    const total = alerts.length;
    const start = offset || 0;
    const end = start + (limit || 100);
    alerts = alerts.slice(start, end);

    res.json({
      success: true,
      message: '获取活跃告警成功',
      code: 'SUCCESS',
      data: {
        total,
        count: alerts.length,
        offset: start,
        limit: limit || 100,
        alerts
      }
    });
  } catch (error) {
    logger.error(`获取活跃告警失败: ${error.message}`);
    res.status(500).json({
      success: false,
      message: '获取活跃告警失败',
      code: 'INTERNAL_ERROR',
      error: error.message
    });
  }
});

router.get('/active/:alertId', async (req, res) => {
  try {
    const { alertId } = req.params;
    const alerts = alertEngine.getActiveAlerts();
    const alert = alerts.find(a => a.alertId === alertId);

    if (!alert) {
      return res.status(404).json({
        success: false,
        message: '告警不存在',
        code: 'NOT_FOUND'
      });
    }

    res.json({
      success: true,
      message: '获取告警成功',
      code: 'SUCCESS',
      data: alert
    });
  } catch (error) {
    logger.error(`获取告警失败: ${error.message}`);
    res.status(500).json({
      success: false,
      message: '获取告警失败',
      code: 'INTERNAL_ERROR',
      error: error.message
    });
  }
});

router.post('/active/:alertId/acknowledge', async (req, res) => {
  try {
    const { alertId } = req.params;
    const { acknowledgedBy, comment, clear } = req.validatedAcknowledge;

    const alert = await alertEngine.acknowledgeAlert(
      alertId,
      acknowledgedBy,
      comment,
      clear
    );

    res.json({
      success: true,
      message: '告警确认成功',
      code: 'SUCCESS',
      data: alert
    });
  } catch (error) {
    logger.error(`告警确认失败: ${error.message}`);

    if (error.message.includes('不存在')) {
      return res.status(404).json({
        success: false,
        message: error.message,
        code: 'NOT_FOUND'
      });
    }

    res.status(500).json({
      success: false,
      message: '告警确认失败',
      code: 'INTERNAL_ERROR',
      error: error.message
    });
  }
});

router.post('/active/:alertId/clear', async (req, res) => {
  try {
    const { alertId } = req.params;
    const alert = await alertEngine.clearAlert(alertId);

    res.json({
      success: true,
      message: '告警清除成功',
      code: 'SUCCESS',
      data: alert
    });
  } catch (error) {
    logger.error(`告警清除失败: ${error.message}`);

    if (error.message.includes('不存在')) {
      return res.status(404).json({
        success: false,
        message: error.message,
        code: 'NOT_FOUND'
      });
    }

    res.status(500).json({
      success: false,
      message: '告警清除失败',
      code: 'INTERNAL_ERROR',
      error: error.message
    });
  }
});

router.post('/clear/device/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;
    const count = await alertEngine.clearAlertsByDevice(deviceId);

    res.json({
      success: true,
      message: '设备告警清除成功',
      code: 'SUCCESS',
      data: {
        deviceId,
        clearedCount: count
      }
    });
  } catch (error) {
    logger.error(`清除设备告警失败: ${error.message}`);
    res.status(500).json({
      success: false,
      message: '清除设备告警失败',
      code: 'INTERNAL_ERROR',
      error: error.message
    });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const stats = alertEngine.getStats();

    res.json({
      success: true,
      message: '获取告警统计成功',
      code: 'SUCCESS',
      data: stats
    });
  } catch (error) {
    logger.error(`获取告警统计失败: ${error.message}`);
    res.status(500).json({
      success: false,
      message: '获取告警统计失败',
      code: 'INTERNAL_ERROR',
      error: error.message
    });
  }
});

router.post('/test', async (req, res) => {
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
    logger.error(`告警测试失败: ${error.message}`);
    res.status(500).json({
      success: false,
      message: '告警测试失败',
      code: 'INTERNAL_ERROR',
      error: error.message
    });
  }
});

module.exports = router;
