const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { config, AlertLevel, AlertLevelPriority } = require('../config');
const logger = require('../utils/logger');
const redisClient = require('../utils/redis');

const THRESHOLD_CACHE_KEY = 'alert:thresholds';
const CACHE_TTL = 300;
const ALERT_DEDUP_WINDOW = 60000;
const ALERT_DEDUP_PREFIX = 'alert:dedup:';

class AlertThresholdService {
  constructor() {
    this.thresholds = config.alertThresholds;
    this.init();
  }

  async init() {
    try {
      const cachedThresholds = await redisClient.get(THRESHOLD_CACHE_KEY);
      if (cachedThresholds) {
        this.thresholds = JSON.parse(cachedThresholds);
        logger.info('Loaded alert thresholds from cache');
      }
    } catch (err) {
      logger.warn('Failed to load thresholds from cache, using defaults:', err.message);
    }
  }

  async getThresholds() {
    return this.thresholds;
  }

  async updateThresholds(type, thresholds) {
    if (!this.thresholds[type]) {
      throw new Error(`Invalid threshold type: ${type}`);
    }

    this.thresholds[type] = {
      warning: thresholds.warning,
      critical: thresholds.critical,
      emergency: thresholds.emergency
    };

    try {
      await redisClient.set(THRESHOLD_CACHE_KEY, JSON.stringify(this.thresholds), CACHE_TTL);
      logger.info(`Updated ${type} thresholds:`, this.thresholds[type]);
    } catch (err) {
      logger.error('Failed to cache thresholds:', err.message);
    }

    return this.thresholds[type];
  }

  determinePotentialAlertLevel(potential) {
    const { warning, critical, emergency } = this.thresholds.potential;

    if (potential <= emergency) {
      return AlertLevel.EMERGENCY;
    } else if (potential <= critical) {
      return AlertLevel.CRITICAL;
    } else if (potential <= warning) {
      return AlertLevel.WARNING;
    }

    return AlertLevel.NORMAL;
  }

  determineThicknessAlertLevel(thicknessLossRate) {
    const { warning, critical, emergency } = this.thresholds.thickness;

    if (thicknessLossRate >= emergency) {
      return AlertLevel.EMERGENCY;
    } else if (thicknessLossRate >= critical) {
      return AlertLevel.CRITICAL;
    } else if (thicknessLossRate >= warning) {
      return AlertLevel.WARNING;
    }

    return AlertLevel.NORMAL;
  }

  async evaluateCorrosionData(corrosionData) {
    const { potential, thicknessLossRate, wallThickness, originalThickness } = corrosionData;

    let calculatedLossRate = thicknessLossRate;
    if (calculatedLossRate === undefined && wallThickness !== undefined && originalThickness !== undefined) {
      calculatedLossRate = ((originalThickness - wallThickness) / originalThickness) * 100;
    }

    const potentialLevel = this.determinePotentialAlertLevel(potential);
    const thicknessLevel = calculatedLossRate !== undefined
      ? this.determineThicknessAlertLevel(calculatedLossRate)
      : AlertLevel.NORMAL;

    const overallLevel = AlertLevelPriority[potentialLevel] >= AlertLevelPriority[thicknessLevel]
      ? potentialLevel
      : thicknessLevel;

    const alertDetails = {
      potential: {
        value: potential,
        level: potentialLevel,
        thresholds: { ...this.thresholds.potential }
      },
      thickness: {
        value: calculatedLossRate,
        level: thicknessLevel,
        thresholds: { ...this.thresholds.thickness }
      }
    };

    return {
      level: overallLevel,
      isAlert: overallLevel !== AlertLevel.NORMAL,
      details: alertDetails,
      primaryFactor: AlertLevelPriority[potentialLevel] >= AlertLevelPriority[thicknessLevel]
        ? 'potential'
        : 'thickness'
    };
  }

  generateAlertFingerprint(deviceId, level, timestamp) {
    const windowStart = Math.floor(timestamp / ALERT_DEDUP_WINDOW) * ALERT_DEDUP_WINDOW;
    const fingerprint = `${deviceId}:${level}:${windowStart}`;
    return crypto.createHash('md5').update(fingerprint).digest('hex');
  }

  async isDuplicateAlert(deviceId, level, timestamp) {
    const fingerprint = this.generateAlertFingerprint(deviceId, level, timestamp);
    const key = `${ALERT_DEDUP_PREFIX}${fingerprint}`;
    const result = await redisClient.getClient().set(key, '1', 'NX', 'PX', ALERT_DEDUP_WINDOW);
    return result !== 'OK';
  }

  async markAlertSent(deviceId, level, alertId) {
    const sentKey = `alert:sent:${deviceId}:${level}`;
    await redisClient.hset(sentKey, alertId, Date.now());
    await redisClient.getClient().expire(sentKey, 3600);
  }

  async generateAlertMessage(deviceId, location, corrosionData, alertResult, timestamp) {
    const { level, details, primaryFactor } = alertResult;

    const levelMessages = {
      [AlertLevel.WARNING]: {
        title: '腐蚀预警',
        description: '腐蚀参数接近警戒值，需关注'
      },
      [AlertLevel.CRITICAL]: {
        title: '腐蚀告警',
        description: '腐蚀参数超过警戒值，需及时处理'
      },
      [AlertLevel.EMERGENCY]: {
        title: '腐蚀紧急告警',
        description: '腐蚀参数严重超标，需立即处置'
      }
    };

    const levelMessage = levelMessages[level];

    return {
      alertId: `ALERT-${Date.now()}-${uuidv4().split('-')[0]}`,
      deviceId,
      location,
      level,
      title: levelMessage.title,
      description: levelMessage.description,
      primaryFactor,
      corrosion: {
        potential: corrosionData.potential,
        thicknessLossRate: details.thickness.value,
        wallThickness: corrosionData.wallThickness,
        originalThickness: corrosionData.originalThickness
      },
      thresholds: details,
      timestamp,
      receivedAt: Date.now(),
      acknowledged: false,
      acknowledgedBy: null,
      acknowledgedAt: null
    };
  }

  async shouldSuppressAlert(deviceId, level) {
    const suppressionKey = `alert:suppression:${deviceId}:${level}`;
    const isSuppressed = await redisClient.get(suppressionKey);
    return !!isSuppressed;
  }

  async suppressAlert(deviceId, level, durationMs) {
    const suppressionKey = `alert:suppression:${deviceId}:${level}`;
    await redisClient.set(suppressionKey, '1', Math.floor(durationMs / 1000));
    logger.info(`Alert suppressed for device ${deviceId}, level ${level} for ${durationMs}ms`);
  }
}

module.exports = new AlertThresholdService();
