const Joi = require('joi');
const { AlertLevel } = require('../config');

const alertQuerySchema = Joi.object({
  deviceId: Joi.string().pattern(/^DEV-[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/),
  pipelineId: Joi.string(),
  segmentId: Joi.string(),
  level: Joi.string().valid(...Object.values(AlertLevel)),
  startTime: Joi.number().integer().positive(),
  endTime: Joi.number().integer().positive(),
  page: Joi.number().integer().min(1).default(1),
  pageSize: Joi.number().integer().min(1).max(100).default(20),
  acknowledged: Joi.boolean()
});

const alertAcknowledgeSchema = Joi.object({
  alertId: Joi.string().required(),
  operator: Joi.string().required(),
  remark: Joi.string().max(500),
  acknowledgeAction: Joi.string().valid('acknowledge', 'escalate', 'resolve').required()
});

const alertThresholdUpdateSchema = Joi.object({
  type: Joi.string().valid('potential', 'thickness').required(),
  warning: Joi.number().required(),
  critical: Joi.number().required(),
  emergency: Joi.number().required()
}).custom((value, helpers) => {
  if (value.type === 'potential') {
    if (value.warning <= value.critical || value.critical <= value.emergency) {
      return helpers.message('腐蚀电位阈值必须满足: warning > critical > emergency');
    }
  } else if (value.type === 'thickness') {
    if (value.warning >= value.critical || value.critical >= value.emergency) {
      return helpers.message('壁厚阈值必须满足: warning < critical < emergency');
    }
  }
  return value;
});

const validateAlertQuery = (params) => {
  const result = alertQuerySchema.validate(params, { abortEarly: false });
  
  if (result.error) {
    const errors = result.error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message
    }));
    return { valid: false, errors };
  }

  return { valid: true, data: result.value };
};

const validateAlertAcknowledge = (data) => {
  const result = alertAcknowledgeSchema.validate(data, { abortEarly: false });
  
  if (result.error) {
    const errors = result.error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message
    }));
    return { valid: false, errors };
  }

  return { valid: true, data: result.value };
};

const validateAlertThresholdUpdate = (data) => {
  const result = alertThresholdUpdateSchema.validate(data, { abortEarly: false });
  
  if (result.error) {
    const errors = result.error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message
    }));
    return { valid: false, errors };
  }

  return { valid: true, data: result.value };
};

module.exports = {
  validateAlertQuery,
  validateAlertAcknowledge,
  validateAlertThresholdUpdate
};
