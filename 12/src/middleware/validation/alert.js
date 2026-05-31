const { alertRuleSchema, alertAcknowledgeSchema } = require('./schemas');
const logger = require('../../utils/logger');

const alertValidation = {
  validateAlertRule(req, res, next) {
    const { error, value } = alertRuleSchema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
      convert: true
    });

    if (error) {
      const errorDetails = error.details.map(d => ({
        field: d.path.join('.'),
        message: d.message
      }));

      logger.warn(`告警规则校验失败: ${JSON.stringify(errorDetails)}`, {
        requestId: req.requestId
      });

      return res.status(400).json({
        success: false,
        message: '告警规则格式校验失败',
        code: 'VALIDATION_ERROR',
        errors: errorDetails,
        requestId: req.requestId
      });
    }

    const condition = value.condition;

    if (condition.type === 'threshold' && !condition.operator) {
      return res.status(400).json({
        success: false,
        message: '阈值告警需要指定operator',
        code: 'MISSING_OPERATOR',
        requestId: req.requestId
      });
    }

    if (condition.type === 'range') {
      if (condition.minValue === undefined || condition.maxValue === undefined) {
        return res.status(400).json({
          success: false,
          message: '范围告警需要指定minValue和maxValue',
          code: 'MISSING_RANGE',
          requestId: req.requestId
        });
      }
      if (condition.minValue >= condition.maxValue) {
        return res.status(400).json({
          success: false,
          message: 'minValue必须小于maxValue',
          code: 'INVALID_RANGE',
          requestId: req.requestId
        });
      }
    }

    if (condition.type === 'change' && !condition.changePercent) {
      return res.status(400).json({
        success: false,
        message: '变化告警需要指定changePercent',
        code: 'MISSING_CHANGE_PERCENT',
        requestId: req.requestId
      });
    }

    req.validatedRule = value;
    next();
  },

  validateAcknowledge(req, res, next) {
    const { error, value } = alertAcknowledgeSchema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const errorDetails = error.details.map(d => ({
        field: d.path.join('.'),
        message: d.message
      }));

      return res.status(400).json({
        success: false,
        message: '告警确认格式校验失败',
        code: 'VALIDATION_ERROR',
        errors: errorDetails,
        requestId: req.requestId
      });
    }

    req.validatedAcknowledge = value;
    next();
  },

  validateAlertQuery(req, res, next) {
    const { status, severity, limit, offset } = req.query;

    if (status && !['active', 'acknowledged', 'cleared'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: '无效的告警状态',
        code: 'INVALID_STATUS',
        requestId: req.requestId
      });
    }

    if (severity && !['info', 'warning', 'critical', 'error'].includes(severity)) {
      return res.status(400).json({
        success: false,
        message: '无效的告警级别',
        code: 'INVALID_SEVERITY',
        requestId: req.requestId
      });
    }

    if (limit && (isNaN(parseInt(limit, 10)) || parseInt(limit, 10) < 1 || parseInt(limit, 10) > 1000)) {
      return res.status(400).json({
        success: false,
        message: 'limit必须在1-1000之间',
        code: 'INVALID_LIMIT',
        requestId: req.requestId
      });
    }

    req.validatedQuery = {
      status,
      severity,
      limit: limit ? parseInt(limit, 10) : 100,
      offset: offset ? parseInt(offset, 10) : 0
    };

    next();
  }
};

module.exports = alertValidation;
