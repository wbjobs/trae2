const { querySchema } = require('./schemas');
const logger = require('../../utils/logger');

const queryValidation = {
  validateQuery(req, res, next) {
    const { error, value } = querySchema.validate(req.query, {
      abortEarly: false,
      stripUnknown: true,
      convert: true
    });

    if (error) {
      const errorDetails = error.details.map(d => ({
        field: d.path.join('.'),
        message: d.message
      }));

      return res.status(400).json({
        success: false,
        message: '查询参数校验失败',
        code: 'VALIDATION_ERROR',
        errors: errorDetails,
        requestId: req.requestId
      });
    }

    if (value.start && value.end) {
      const startTime = typeof value.start === 'number'
        ? (value.start < 10000000000 ? value.start * 1000 : value.start)
        : new Date(value.start).getTime();
      const endTime = typeof value.end === 'number'
        ? (value.end < 10000000000 ? value.end * 1000 : value.end)
        : new Date(value.end).getTime();

      if (startTime > endTime) {
        return res.status(400).json({
          success: false,
          message: '开始时间不能大于结束时间',
          code: 'INVALID_TIME_RANGE',
          requestId: req.requestId
        });
      }

      const maxRange = 30 * 24 * 60 * 60 * 1000;
      if (endTime - startTime > maxRange) {
        return res.status(400).json({
          success: false,
          message: '查询时间范围不能超过30天',
          code: 'TIME_RANGE_TOO_LARGE',
          requestId: req.requestId
        });
      }
    }

    if (value.aggregation !== 'none' && !value.window) {
      return res.status(400).json({
        success: false,
        message: '聚合查询必须指定时间窗口(window)',
        code: 'MISSING_WINDOW',
        requestId: req.requestId
      });
    }

    req.validatedQuery = value;
    next();
  },

  validateDeviceId(req, res, next) {
    const { deviceId } = req.params;

    if (!deviceId || deviceId.length < 2 || deviceId.length > 64) {
      return res.status(400).json({
        success: false,
        message: '设备ID格式不正确',
        code: 'INVALID_DEVICE_ID',
        requestId: req.requestId
      });
    }

    next();
  },

  validateTagId(req, res, next) {
    const { tagId } = req.params;

    if (!tagId || tagId.length < 1 || tagId.length > 128) {
      return res.status(400).json({
        success: false,
        message: '标签ID格式不正确',
        code: 'INVALID_TAG_ID',
        requestId: req.requestId
      });
    }

    next();
  }
};

module.exports = queryValidation;
