const Joi = require('joi');

const corrosionDataSchema = Joi.object({
  deviceId: Joi.string()
    .required()
    .pattern(/^DEV-[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/)
    .messages({
      'string.empty': '设备ID不能为空',
      'string.pattern.base': '设备ID格式不正确，应为DEV-UUID格式'
    }),

  timestamp: Joi.number()
    .integer()
    .positive()
    .required()
    .max(Date.now() + 3600000)
    .messages({
      'number.base': '时间戳必须是数字',
      'number.integer': '时间戳必须是整数',
      'number.positive': '时间戳必须是正数',
      'number.max': '时间戳不能超过当前时间1小时'
    }),

  location: Joi.object({
    pipelineId: Joi.string().required(),
    segmentId: Joi.string().required(),
    kilometerMarker: Joi.number().min(0).required(),
    latitude: Joi.number().min(-90).max(90).required(),
    longitude: Joi.number().min(-180).max(180).required()
  }).required(),

  corrosion: Joi.object({
    potential: Joi.number()
      .required()
      .min(-2000)
      .max(0)
      .messages({
        'number.base': '腐蚀电位必须是数字',
        'number.min': '腐蚀电位不能低于-2000mV',
        'number.max': '腐蚀电位不能高于0mV'
      }),

    wallThickness: Joi.number()
      .positive()
      .max(100)
      .messages({
        'number.base': '壁厚必须是数字',
        'number.positive': '壁厚必须是正数',
        'number.max': '壁厚不能超过100mm'
      }),

    originalThickness: Joi.number()
      .positive()
      .max(100)
      .messages({
        'number.base': '原始壁厚必须是数字',
        'number.positive': '原始壁厚必须是正数',
        'number.max': '原始壁厚不能超过100mm'
      }),

    thicknessLossRate: Joi.number()
      .min(0)
      .max(100)
      .messages({
        'number.base': '壁厚损失率必须是数字',
        'number.min': '壁厚损失率不能低于0%',
        'number.max': '壁厚损失率不能超过100%'
      }),

    corrosionRate: Joi.number()
      .min(0)
      .max(10)
      .messages({
        'number.base': '腐蚀速率必须是数字',
        'number.min': '腐蚀速率不能低于0mm/year',
        'number.max': '腐蚀速率不能超过10mm/year'
      })
  }).required(),

  environment: Joi.object({
    temperature: Joi.number().min(-40).max(80),
    humidity: Joi.number().min(0).max(100),
    ph: Joi.number().min(0).max(14),
    soilResistivity: Joi.number().min(0)
  }),

  metadata: Joi.object({
    signalStrength: Joi.number().min(0).max(100),
    batteryLevel: Joi.number().min(0).max(100),
    firmwareVersion: Joi.string()
  })
}).xor('corrosion.wallThickness', 'corrosion.thicknessLossRate')
  .messages({
    'object.xor': '必须提供壁厚或壁厚损失率中的至少一个'
  });

const batchCorrosionDataSchema = Joi.object({
  batchId: Joi.string().required(),
  records: Joi.array()
    .items(corrosionDataSchema)
    .min(1)
    .max(1000)
    .required()
    .messages({
      'array.min': '批量数据至少包含1条记录',
      'array.max': '批量数据最多包含1000条记录'
    })
});

const validateCorrosionData = (data) => {
  const result = corrosionDataSchema.validate(data, {
    abortEarly: false,
    allowUnknown: true
  });

  if (result.error) {
    const errors = result.error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message,
      value: detail.context?.value
    }));
    return { valid: false, errors };
  }

  return { valid: true, data: result.value };
};

const validateBatchCorrosionData = (data) => {
  const result = batchCorrosionDataSchema.validate(data, {
    abortEarly: false,
    allowUnknown: true
  });

  if (result.error) {
    const errors = result.error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message,
      value: detail.context?.value
    }));
    return { valid: false, errors };
  }

  return { valid: true, data: result.value };
};

const validateDeviceId = (deviceId) => {
  const schema = Joi.string()
    .required()
    .pattern(/^DEV-[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/);

  const result = schema.validate(deviceId);
  return !result.error;
};

const validateTimeRange = (startTime, endTime) => {
  const schema = Joi.object({
    startTime: Joi.number().integer().positive().required(),
    endTime: Joi.number().integer().positive().greater(Joi.ref('startTime')).required()
  });

  const result = schema.validate({ startTime, endTime });
  return !result.error;
};

module.exports = {
  validateCorrosionData,
  validateBatchCorrosionData,
  validateDeviceId,
  validateTimeRange,
  corrosionDataSchema,
  batchCorrosionDataSchema
};
