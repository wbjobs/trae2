const express = require('express');
const router = express.Router();
const apiResponse = require('../utils/response');
const logger = require('../utils/logger');
const dataProcessingService = require('../services/dataProcessing.service');
const taskSchedulerService = require('../services/taskScheduler.service');
const { validateDeviceId } = require('../validators/corrosion.validator');

router.post('/data', async (req, res, next) => {
  try {
    const result = await dataProcessingService.processSingleData(req.body);

    if (!result.success) {
      if (result.error === 'VALIDATION_ERROR') {
        return apiResponse.badRequest(res, result.error, result.errors);
      }
      return apiResponse.error(res, result.message || result.error, 500);
    }

    return apiResponse.created(res, result, 'Data received successfully');
  } catch (err) {
    next(err);
  }
});

router.post('/data/batch', async (req, res, next) => {
  try {
    const result = await dataProcessingService.processBatchData(req.body);

    if (!result.success) {
      if (result.error === 'VALIDATION_ERROR') {
        return apiResponse.badRequest(res, result.error, result.errors);
      }
      return apiResponse.error(res, result.message || result.error, 500);
    }

    return apiResponse.created(res, result, 'Batch data received successfully');
  } catch (err) {
    next(err);
  }
});

router.post('/data/immediate', async (req, res, next) => {
  try {
    const result = await dataProcessingService.processDataWithImmediateCheck(req.body);

    if (!result.success) {
      if (result.error === 'VALIDATION_ERROR') {
        return apiResponse.badRequest(res, result.error, result.errors);
      }
      return apiResponse.error(res, result.message || result.error, 500);
    }

    return apiResponse.success(res, result, 'Data processed with immediate check');
  } catch (err) {
    next(err);
  }
});

router.get('/device/:deviceId/status', async (req, res, next) => {
  try {
    const { deviceId } = req.params;

    if (!validateDeviceId(deviceId)) {
      return apiResponse.badRequest(res, 'Invalid device ID format');
    }

    const status = await dataProcessingService.getDeviceStatus(deviceId);
    const heartbeat = await dataProcessingService.getDeviceHeartbeat(deviceId);

    if (!status && !heartbeat.isOnline) {
      return apiResponse.notFound(res, 'Device not found or has not reported data');
    }

    return apiResponse.success(res, {
      deviceId,
      status,
      heartbeat
    });
  } catch (err) {
    next(err);
  }
});

router.get('/device/:deviceId/heartbeat', async (req, res, next) => {
  try {
    const { deviceId } = req.params;

    if (!validateDeviceId(deviceId)) {
      return apiResponse.badRequest(res, 'Invalid device ID format');
    }

    const heartbeat = await dataProcessingService.getDeviceHeartbeat(deviceId);
    return apiResponse.success(res, heartbeat);
  } catch (err) {
    next(err);
  }
});

router.get('/stats/processing', async (req, res, next) => {
  try {
    const stats = dataProcessingService.getProcessingStats();
    return apiResponse.success(res, stats);
  } catch (err) {
    next(err);
  }
});

router.get('/stats/queues', async (req, res, next) => {
  try {
    const stats = await taskSchedulerService.getQueueStats();
    return apiResponse.success(res, stats);
  } catch (err) {
    next(err);
  }
});

router.get('/stats/system', async (req, res, next) => {
  try {
    const [systemStats, onlineDevices] = await Promise.all([
      taskSchedulerService.getSystemStats(),
      dataProcessingService.getOnlineDeviceCount()
    ]);

    return apiResponse.success(res, {
      ...systemStats,
      onlineDevices
    });
  } catch (err) {
    next(err);
  }
});

router.get('/dlq/:queueName', async (req, res, next) => {
  try {
    const { queueName } = req.params;
    const { limit = 100 } = req.query;

    const validQueues = ['corrosion_data', 'alerts', 'kafka_messages'];
    if (!validQueues.includes(queueName)) {
      return apiResponse.badRequest(res, `Invalid queue name. Valid options: ${validQueues.join(', ')}`);
    }

    const items = await taskSchedulerService.getDeadLetterQueue(queueName, parseInt(limit));
    return apiResponse.success(res, {
      queueName,
      count: items.length,
      items
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
