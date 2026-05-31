const Joi = require('joi');

const pointDataSchema = Joi.object({
  deviceId: Joi.string().required().min(2).max(64)
    .pattern(/^[a-zA-Z0-9_-]+$/)
    .message('设备ID只能包含字母、数字、下划线和连字符')
    .description('设备唯一标识'),

  timestamp: Joi.alternatives()
    .try(Joi.number().integer().positive(), Joi.string().isoDate())
    .required()
    .description('数据采集时间戳'),

  points: Joi.array().items(Joi.object({
    tagId: Joi.string().required().min(1).max(128)
      .pattern(/^[a-zA-Z0-9_./-]+$/)
      .message('点位标签ID格式不正确'),

    value: Joi.alternatives()
      .try(Joi.number(), Joi.boolean(), Joi.string().max(1024))
      .required(),

    quality: Joi.number().integer().min(0).max(255).default(192),

    timestamp: Joi.alternatives()
      .try(Joi.number().integer().positive(), Joi.string().isoDate())
      .optional()
  })).required().min(1).max(1000),

  protocol: Joi.string()
    .valid('Modbus', 'OPC-UA', 'Siemens-S7', 'Ethernet/IP', 'FINS', 'Custom', 'MQTT', 'HTTP')
    .default('Custom'),

  metadata: Joi.object().pattern(Joi.string().max(64), Joi.any()).max(50).optional(),

  priority: Joi.number().integer().min(1).max(100).default(10)
}).required();

const batchDataSchema = Joi.array().items(pointDataSchema).min(1).max(100);

const querySchema = Joi.object({
  deviceId: Joi.string().min(2).max(64).optional(),

  tagId: Joi.string().min(1).max(128).optional(),

  start: Joi.alternatives()
    .try(Joi.number().integer().positive(), Joi.string().isoDate())
    .optional(),

  end: Joi.alternatives()
    .try(Joi.number().integer().positive(), Joi.string().isoDate())
    .optional(),

  limit: Joi.number().integer().min(1).max(10000).default(1000),

  aggregation: Joi.string()
    .valid('none', 'mean', 'median', 'sum', 'min', 'max', 'count', 'first', 'last')
    .default('none'),

  window: Joi.string().pattern(/^\d+[smhdw]$/).optional(),

  offset: Joi.number().integer().min(0).default(0)
});

const alertRuleSchema = Joi.object({
  ruleId: Joi.string().required().min(2).max(64),

  name: Joi.string().required().min(2).max(128),

  description: Joi.string().max(512).optional(),

  enabled: Joi.boolean().default(true),

  deviceId: Joi.string().min(2).max(64).optional(),

  tagId: Joi.string().required().min(1).max(128),

  condition: Joi.object({
    type: Joi.string().required().valid(
      'threshold', 'range', 'change', 'quality',
      'missing', 'frozen', 'spike', 'trend'
    ),
    operator: Joi.string().valid('>', '>=', '<', '<=', '==', '!='),
    value: Joi.alternatives().try(Joi.number(), Joi.boolean(), Joi.string()),
    minValue: Joi.alternatives().try(Joi.number()),
    maxValue: Joi.alternatives().try(Joi.number()),
    changePercent: Joi.number().min(0).max(100),
    duration: Joi.number().integer().min(0).default(0),
    samples: Joi.number().integer().min(1).default(1)
  }).required(),

  severity: Joi.string().valid('info', 'warning', 'critical', 'error').default('warning'),

  actions: Joi.array().items(Joi.object({
    type: Joi.string().valid('webhook', 'email', 'sms', 'api', 'log').required(),
    config: Joi.object().required()
  })).default([]),

  notification: Joi.object({
    enabled: Joi.boolean().default(true),
    cooldown: Joi.number().integer().min(0).default(300000),
    repeat: Joi.boolean().default(false),
    repeatInterval: Joi.number().integer().min(60000).default(3600000)
  }).default({
    enabled: true,
    cooldown: 300000,
    repeat: false,
    repeatInterval: 3600000
  })
});

const alertAcknowledgeSchema = Joi.object({
  alertId: Joi.string().required(),

  acknowledgedBy: Joi.string().required().min(2).max(64),

  comment: Joi.string().max(512).optional(),

  clear: Joi.boolean().default(false)
});

const authLoginSchema = Joi.object({
  username: Joi.string().required().min(3).max(64),
  password: Joi.string().required().min(6).max(128)
});

const apiKeyCreateSchema = Joi.object({
  name: Joi.string().required().min(2).max(64),
  description: Joi.string().max(256).optional(),
  permissions: Joi.array().items(
    Joi.string().valid('read', 'write', 'admin')
  ).default(['read', 'write']),
  rateLimit: Joi.number().integer().min(1).max(10000).default(1000),
  expiresAt: Joi.string().isoDate().optional()
});

module.exports = {
  pointDataSchema,
  batchDataSchema,
  querySchema,
  alertRuleSchema,
  alertAcknowledgeSchema,
  authLoginSchema,
  apiKeyCreateSchema
};
