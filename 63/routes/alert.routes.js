const express = require('express');
const router = express.Router();
const apiResponse = require('../utils/response');
const logger = require('../utils/logger');
const redisClient = require('../utils/redis');
const alertThresholdService = require('../services/alertThreshold.service');
const taskSchedulerService = require('../services/taskScheduler.service');
const {
  validateAlertQuery,
  validateAlertAcknowledge,
  validateAlertThresholdUpdate
} = require('../validators/alert.validator');

router.get('/', async (req, res, next) => {
  try {
    const validation = validateAlertQuery(req.query);
    if (!validation.valid) {
      return apiResponse.badRequest(res, 'Invalid query parameters', validation.errors);
    }

    const params = validation.data;
    const alerts = await redisClient.hgetall('alerts:recent');

    let alertList = Object.values(alerts || {}).map(a => JSON.parse(a));

    if (params.deviceId) {
      alertList = alertList.filter(a => a.deviceId === params.deviceId);
    }
    if (params.level) {
      alertList = alertList.filter(a => a.level === params.level);
    }
    if (params.pipelineId) {
      alertList = alertList.filter(a => a.location?.pipelineId === params.pipelineId);
    }
    if (params.segmentId) {
      alertList = alertList.filter(a => a.location?.segmentId === params.segmentId);
    }
    if (params.acknowledged !== undefined) {
      alertList = alertList.filter(a => a.acknowledged === params.acknowledged);
    }
    if (params.startTime) {
      alertList = alertList.filter(a => a.timestamp >= params.startTime);
    }
    if (params.endTime) {
      alertList = alertList.filter(a => a.timestamp <= params.endTime);
    }

    alertList.sort((a, b) => b.timestamp - a.timestamp);

    const startIndex = (params.page - 1) * params.pageSize;
    const endIndex = startIndex + params.pageSize;
    const paginatedAlerts = alertList.slice(startIndex, endIndex);

    return apiResponse.success(res, {
      alerts: paginatedAlerts,
      pagination: {
        page: params.page,
        pageSize: params.pageSize,
        total: alertList.length,
        totalPages: Math.ceil(alertList.length / params.pageSize)
      }
    });
  } catch (err) {
    next(err);
  }
});

router.post('/acknowledge', async (req, res, next) => {
  try {
    const validation = validateAlertAcknowledge(req.body);
    if (!validation.valid) {
      return apiResponse.badRequest(res, 'Invalid request parameters', validation.errors);
    }

    const { alertId, operator, remark, acknowledgeAction } = validation.data;

    const alertData = await redisClient.hget('alerts:recent', alertId);
    if (!alertData) {
      return apiResponse.notFound(res, 'Alert not found');
    }

    const alert = JSON.parse(alertData);
    alert.acknowledged = true;
    alert.acknowledgedBy = operator;
    alert.acknowledgedAt = Date.now();
    alert.acknowledgeAction = acknowledgeAction;
    alert.acknowledgeRemark = remark || '';

    await redisClient.hset('alerts:recent', alertId, JSON.stringify(alert));
    await redisClient.hset(`alerts:acknowledged:${Date.now()}`, alertId, JSON.stringify(alert));

    logger.info(`Alert ${alertId} acknowledged by ${operator}`);

    return apiResponse.success(res, {
      alertId,
      acknowledged: true,
      acknowledgedBy: operator,
      acknowledgedAt: alert.acknowledgedAt
    }, 'Alert acknowledged successfully');
  } catch (err) {
    next(err);
  }
});

router.get('/thresholds', async (req, res, next) => {
  try {
    const thresholds = await alertThresholdService.getThresholds();
    return apiResponse.success(res, thresholds);
  } catch (err) {
    next(err);
  }
});

router.put('/thresholds', async (req, res, next) => {
  try {
    const validation = validateAlertThresholdUpdate(req.body);
    if (!validation.valid) {
      return apiResponse.badRequest(res, 'Invalid threshold parameters', validation.errors);
    }

    const { type, warning, critical, emergency } = validation.data;
    const updatedThresholds = await alertThresholdService.updateThresholds(type, {
      warning,
      critical,
      emergency
    });

    return apiResponse.success(res, {
      type,
      thresholds: updatedThresholds
    }, 'Thresholds updated successfully');
  } catch (err) {
    next(err);
  }
});

router.post('/suppress', async (req, res, next) => {
  try {
    const { deviceId, level, durationMs } = req.body;

    if (!deviceId || !level || !durationMs) {
      return apiResponse.badRequest(res, 'deviceId, level, and durationMs are required');
    }

    await alertThresholdService.suppressAlert(deviceId, level, durationMs);

    return apiResponse.success(res, {
      deviceId,
      level,
      suppressedUntil: Date.now() + durationMs
    }, 'Alert suppressed successfully');
  } catch (err) {
    next(err);
  }
});

router.get('/active/:deviceId', async (req, res, next) => {
  try {
    const { deviceId } = req.params;
    const activeAlertsKey = `alerts:active:${deviceId}`;
    const activeAlerts = await redisClient.hgetall(activeAlertsKey);

    const alerts = Object.values(activeAlerts || {}).map(a => JSON.parse(a));
    alerts.sort((a, b) => b.timestamp - a.timestamp);

    return apiResponse.success(res, {
      deviceId,
      activeAlerts: alerts,
      count: alerts.length
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
