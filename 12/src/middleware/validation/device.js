const logger = require('../../utils/logger');
const { pointDataSchema, batchDataSchema } = require('./schemas');

const deviceValidation = {
  validatePointData(req, res, next) {
    const { error, value } = pointDataSchema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
      convert: true
    });

    if (error) {
      const errorDetails = error.details.map(d => ({
        field: d.path.join('.'),
        message: d.message,
        type: d.type
      }));

      logger.warn(`点位数据校验失败: ${JSON.stringify(errorDetails)}`, {
        deviceId: req.body?.deviceId,
        requestId: req.requestId
      });

      return res.status(400).json({
        success: false,
        message: '数据格式校验失败',
        code: 'VALIDATION_ERROR',
        errors: errorDetails,
        requestId: req.requestId
      });
    }

    req.validatedData = value;
    next();
  },

  validateBatchData(req, res, next) {
    const { error, value } = batchDataSchema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
      convert: true
    });

    if (error) {
      const errorDetails = error.details.map(d => ({
        field: d.path.join('.'),
        message: d.message,
        type: d.type
      }));

      logger.warn(`批量数据校验失败: ${JSON.stringify(errorDetails)}`, {
        requestId: req.requestId,
        batchSize: Array.isArray(req.body) ? req.body.length : 0
      });

      return res.status(400).json({
        success: false,
        message: '批量数据格式校验失败',
        code: 'VALIDATION_ERROR',
        errors: errorDetails,
        requestId: req.requestId
      });
    }

    req.validatedData = value;
    next();
  },

  validateDeviceAuth(req, res, next) {
    const { deviceId } = req.body || {};
    const headerDeviceId = req.headers['x-device-id'];

    if (deviceId && headerDeviceId && deviceId !== headerDeviceId) {
      logger.warn(`设备ID不匹配: header=${headerDeviceId}, body=${deviceId}`, {
        requestId: req.requestId
      });

      return res.status(400).json({
        success: false,
        message: '设备ID不匹配',
        code: 'DEVICE_ID_MISMATCH',
        requestId: req.requestId
      });
    }

    req.deviceId = headerDeviceId || deviceId;
    next();
  },

  validateDataQuality(req, res, next) {
    const data = req.validatedData;
    if (!data) {
      return next();
    }

    const now = Date.now();
    const maxTimeDrift = 3600000;

    if (data.timestamp) {
      const dataTime = typeof data.timestamp === 'number'
        ? (data.timestamp < 10000000000 ? data.timestamp * 1000 : data.timestamp)
        : new Date(data.timestamp).getTime();

      if (Math.abs(now - dataTime) > maxTimeDrift) {
        logger.warn(`数据时间戳漂移过大: ${Math.abs(now - dataTime)}ms`, {
          deviceId: data.deviceId,
          requestId: req.requestId
        });
      }
    }

    if (data.points) {
      const lowQualityPoints = data.points.filter(p => p.quality !== undefined && p.quality < 192);
      if (lowQualityPoints.length > 0) {
        logger.info(`检测到低质量数据点: ${lowQualityPoints.length}`, {
          deviceId: data.deviceId,
          requestId: req.requestId
        });
      }
    }

    next();
  }
};

module.exports = deviceValidation;
