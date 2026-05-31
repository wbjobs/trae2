const logger = require('../utils/logger');
const redisClient = require('../utils/redis');
const { AlertLevel } = require('../config');

class BusinessValidatorService {
  constructor() {
    this.validationRules = {
      potentialRange: { min: -2000, max: 0 },
      thicknessRange: { min: 0, max: 100 },
      tempRange: { min: -40, max: 80 },
      humidityRange: { min: 0, max: 100 },
      phRange: { min: 0, max: 14 }
    };

    this.deviceCache = new Map();
    this.cacheExpiry = 300000;
  }

  validateBusinessRules(data) {
    const issues = [];

    if (!this.validatePotentialConsistency(data)) {
      issues.push('POTENTIAL_INCONSISTENCY');
    }

    if (!this.validateThicknessConsistency(data)) {
      issues.push('THICKNESS_INCONSISTENCY');
    }

    if (!this.validateLocationAccuracy(data)) {
      issues.push('LOCATION_INACCURACY');
    }

    if (!this.validateTimestampReasonableness(data)) {
      issues.push('TIMESTAMP_UNREASONABLE');
    }

    return {
      valid: issues.length === 0,
      issues,
      severity: this.calculateSeverity(issues)
    };
  }

  validatePotentialConsistency(data) {
    const { potential } = data.corrosion;
    const { min, max } = this.validationRules.potentialRange;

    if (potential < min || potential > max) {
      logger.warn(`Potential out of range: ${potential} for device ${data.deviceId}`);
      return false;
    }

    if (potential < -1500) {
      logger.warn(`Potential unusually low: ${potential} for device ${data.deviceId}`);
    }

    return true;
  }

  validateThicknessConsistency(data) {
    const { wallThickness, originalThickness, thicknessLossRate } = data.corrosion;

    if (wallThickness && originalThickness) {
      if (wallThickness > originalThickness) {
        logger.warn(`Wall thickness exceeds original for device ${data.deviceId}`);
        return false;
      }

      if (thicknessLossRate === undefined) {
        const calculatedLoss = ((originalThickness - wallThickness) / originalThickness) * 100;
        if (calculatedLoss > 50) {
          logger.warn(`Calculated thickness loss unusually high: ${calculatedLoss}% for device ${data.deviceId}`);
        }
      }
    }

    if (thicknessLossRate !== undefined && (thicknessLossRate < 0 || thicknessLossRate > 100)) {
      logger.warn(`Thickness loss rate out of range: ${thicknessLossRate} for device ${data.deviceId}`);
      return false;
    }

    return true;
  }

  validateLocationAccuracy(data) {
    const { latitude, longitude, kilometerMarker } = data.location;

    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      logger.warn(`Invalid coordinates for device ${data.deviceId}: ${latitude}, ${longitude}`);
      return false;
    }

    if (kilometerMarker < 0 || kilometerMarker > 10000) {
      logger.warn(`Invalid kilometer marker for device ${data.deviceId}: ${kilometerMarker}`);
      return false;
    }

    return true;
  }

  validateTimestampReasonableness(data) {
    const now = Date.now();
    const timestamp = data.timestamp;

    if (timestamp > now + 3600000) {
      logger.warn(`Future timestamp for device ${data.deviceId}: ${timestamp}`);
      return false;
    }

    if (timestamp < now - 86400000 * 30) {
      logger.warn(`Timestamp too old for device ${data.deviceId}: ${timestamp}`);
      return false;
    }

    return true;
  }

  calculateSeverity(issues) {
    if (issues.length === 0) return AlertLevel.NORMAL;
    if (issues.length <= 2) return AlertLevel.WARNING;
    if (issues.length <= 4) return AlertLevel.CRITICAL;
    return AlertLevel.EMERGENCY;
  }

  async validateDeviceAuthorization(deviceId) {
    const cacheKey = `auth:${deviceId}`;

    if (this.deviceCache.has(deviceId)) {
      const cached = this.deviceCache.get(deviceId);
      if (Date.now() - cached.timestamp < this.cacheExpiry) {
        return cached.authorized;
      }
    }

    const authKey = `device:auth:${deviceId}`;
    const authorized = await redisClient.get(authKey);

    this.deviceCache.set(deviceId, {
      authorized: !!authorized,
      timestamp: Date.now()
    });

    return !!authorized;
  }

  async validateAnomalyDetection(data, historicalData = []) {
    if (historicalData.length < 10) {
      return { anomaly: false, reason: 'INSUFFICIENT_HISTORY' };
    }

    const recentPotentials = historicalData.slice(-10).map(d => d.corrosion?.potential || 0);
    const avgPotential = recentPotentials.reduce((a, b) => a + b, 0) / recentPotentials.length;

    const currentPotential = data.corrosion.potential;
    const deviation = Math.abs(currentPotential - avgPotential);

    if (deviation > 200) {
      logger.warn(`Potential anomaly detected for device ${data.deviceId}: deviation=${deviation}mV`);
      return {
        anomaly: true,
        type: 'POTENTIAL_SPIKE',
        deviation,
        average: avgPotential,
        current: currentPotential
      };
    }

    if (historicalData.length >= 20) {
      const trend = this.calculateTrend(recentPotentials);
      if (trend < -50) {
        logger.warn(`Negative potential trend detected for device ${data.deviceId}: ${trend}mV/reading`);
        return {
          anomaly: true,
          type: 'NEGATIVE_TREND',
          trend,
          severity: Math.abs(trend) > 100 ? AlertLevel.CRITICAL : AlertLevel.WARNING
        };
      }
    }

    return { anomaly: false };
  }

  calculateTrend(values) {
    if (values.length < 2) return 0;

    const n = values.length;
    const sumX = values.reduce((acc, _, i) => acc + i, 0);
    const sumY = values.reduce((acc, val) => acc + val, 0);
    const sumXY = values.reduce((acc, val, i) => acc + i * val, 0);
    const sumXX = values.reduce((acc, _, i) => acc + i * i, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    return slope;
  }

  async validateDataQuality(data) {
    const quality = {
      completeness: this.checkCompleteness(data),
      consistency: this.checkConsistency(data),
      timeliness: this.checkTimeliness(data)
    };

    quality.score = (quality.completeness.score + quality.consistency.score + quality.timeliness.score) / 3;

    return quality;
  }

  checkCompleteness(data) {
    const requiredFields = ['deviceId', 'timestamp', 'location', 'corrosion'];
    const optionalFields = ['environment', 'metadata'];

    let presentRequired = 0;
    for (const field of requiredFields) {
      if (data[field]) presentRequired++;
    }

    let presentOptional = 0;
    for (const field of optionalFields) {
      if (data[field]) presentOptional++;
    }

    const score = (presentRequired / requiredFields.length) * 0.7 + (presentOptional / optionalFields.length) * 0.3;

    return {
      score: Math.round(score * 100),
      requiredFields: { present: presentRequired, total: requiredFields.length },
      optionalFields: { present: presentOptional, total: optionalFields.length }
    };
  }

  checkConsistency(data) {
    let score = 100;
    const issues = [];

    if (data.corrosion?.wallThickness && data.corrosion?.originalThickness) {
      if (data.corrosion.wallThickness > data.corrosion.originalThickness) {
        score -= 30;
        issues.push('WALL_THICKNESS_EXCEEDS_ORIGINAL');
      }
    }

    return { score, issues };
  }

  checkTimeliness(data) {
    const age = Date.now() - data.timestamp;
    let score = 100;

    if (age > 3600000) score -= 50;
    else if (age > 300000) score -= 20;
    else if (age > 60000) score -= 10;

    return {
      score,
      ageMs: age,
      ageReadable: this.formatDuration(age)
    };
  }

  formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }
}

module.exports = new BusinessValidatorService();
