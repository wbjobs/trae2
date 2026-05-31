const crypto = require('crypto');
const logger = require('../utils/logger');
const redisClient = require('../utils/redis');
const { validateCorrosionData, validateBatchCorrosionData } = require('../validators/corrosion.validator');
const taskSchedulerService = require('./taskScheduler.service');
const alertThresholdService = require('./alertThreshold.service');
const businessValidatorService = require('./businessValidator.service');

const DEVICE_HEARTBEAT_TTL = 300;
const DEDUPLICATION_TTL = 300;
const MESSAGE_ID_CACHE_PREFIX = 'msg:seen:';

class DataProcessingService {
  constructor() {
    this.processingStats = {
      received: 0,
      validated: 0,
      rejected: 0,
      queued: 0
    };
  }

  generateMessageFingerprint(data) {
    const fingerprint = `${data.deviceId}:${data.timestamp}:${data.corrosion.potential}`;
    return crypto.createHash('md5').update(fingerprint).digest('hex');
  }

  async isDuplicateMessage(fingerprint) {
    const key = `${MESSAGE_ID_CACHE_PREFIX}${fingerprint}`;
    const result = await redisClient.getClient().set(key, '1', 'NX', 'EX', DEDUPLICATION_TTL);
    return result !== 'OK';
  }

  async processSingleData(rawData) {
    this.processingStats.received++;

    const validationResult = validateCorrosionData(rawData);
    if (!validationResult.valid) {
      this.processingStats.rejected++;
      logger.warn(`Data validation failed for device ${rawData.deviceId || 'unknown'}:`, validationResult.errors);
      return {
        success: false,
        error: 'VALIDATION_ERROR',
        errors: validationResult.errors
      };
    }

    const data = validationResult.data;

    const businessResult = businessValidatorService.validateBusinessRules(data);
    if (!businessResult.valid) {
      logger.warn(`Business validation issues for device ${data.deviceId}:`, businessResult.issues);
      data.businessValidation = businessResult;
    }

    const dataQuality = await businessValidatorService.validateDataQuality(data);
    data.qualityScore = dataQuality.score;

    const isAuthorized = await businessValidatorService.validateDeviceAuthorization(data.deviceId);
    if (!isAuthorized) {
      return {
        success: false,
        error: 'UNAUTHORIZED_DEVICE',
        message: 'Device not authorized'
      };
    }

    const fingerprint = this.generateMessageFingerprint(data);
    const isDuplicate = await this.isDuplicateMessage(fingerprint);
    if (isDuplicate) {
      logger.debug(`Duplicate message detected: device=${data.deviceId}, timestamp=${data.timestamp}`);
      return {
        success: true,
        deviceId: data.deviceId,
        timestamp: data.timestamp,
        isDuplicate: true,
        receivedAt: Date.now(),
        message: 'Duplicate message, already processed'
      };
    }

    this.processingStats.validated++;

    try {
      await this.updateDeviceHeartbeat(data.deviceId);
      await this.updateDeviceStatus(data.deviceId, data);

      const job = await taskSchedulerService.addCorrosionDataJob(data);
      this.processingStats.queued++;

      logger.debug(`Data queued for processing: device=${data.deviceId}, jobId=${job.id}`);

      return {
        success: true,
        deviceId: data.deviceId,
        jobId: job.id,
        timestamp: data.timestamp,
        receivedAt: Date.now(),
        fingerprint,
        businessValidation: businessResult,
        qualityScore: dataQuality.score
      };
    } catch (err) {
      logger.error('Failed to queue corrosion data:', err);
      const key = `${MESSAGE_ID_CACHE_PREFIX}${fingerprint}`;
      await redisClient.del(key);
      
      return {
        success: false,
        error: 'QUEUE_ERROR',
        message: err.message
      };
    }
  }

  async processBatchData(rawBatchData) {
    const validationResult = validateBatchCorrosionData(rawBatchData);
    if (!validationResult.valid) {
      logger.warn('Batch data validation failed:', validationResult.errors);
      return {
        success: false,
        error: 'VALIDATION_ERROR',
        errors: validationResult.errors
      };
    }

    const { batchId, records } = validationResult.data;
    this.processingStats.received += records.length;

    const batchKey = `batch:seen:${batchId}`;
    const batchSeen = await redisClient.getClient().set(batchKey, '1', 'NX', 'EX', 600);
    if (batchSeen !== 'OK') {
      logger.warn(`Duplicate batch detected: batchId=${batchId}`);
      return {
        success: true,
        batchId,
        isDuplicate: true,
        recordCount: records.length,
        receivedAt: Date.now(),
        message: 'Duplicate batch, already processed'
      };
    }

    const uniqueRecords = [];
    for (const record of records) {
      const fingerprint = this.generateMessageFingerprint(record);
      const isDuplicate = await this.isDuplicateMessage(fingerprint);
      if (!isDuplicate) {
        uniqueRecords.push(record);
      }
    }

    this.processingStats.validated += uniqueRecords.length;
    logger.info(`Batch ${batchId}: ${records.length} records, ${uniqueRecords.length} unique after deduplication`);

    try {
      for (const record of uniqueRecords) {
        await this.updateDeviceHeartbeat(record.deviceId);
      }

      let job = null;
      if (uniqueRecords.length > 0) {
        job = await taskSchedulerService.addBatchJob({ batchId, records: uniqueRecords });
        this.processingStats.queued += uniqueRecords.length;
        logger.info(`Batch queued: batchId=${batchId}, records=${uniqueRecords.length}, jobId=${job.id}`);
      }

      return {
        success: true,
        batchId,
        jobId: job?.id,
        recordCount: records.length,
        uniqueCount: uniqueRecords.length,
        duplicateCount: records.length - uniqueRecords.length,
        receivedAt: Date.now()
      };
    } catch (err) {
      logger.error('Failed to queue batch data:', err);
      await redisClient.del(batchKey);
      
      for (const record of uniqueRecords) {
        const fingerprint = this.generateMessageFingerprint(record);
        const key = `${MESSAGE_ID_CACHE_PREFIX}${fingerprint}`;
        await redisClient.del(key);
      }
      
      return {
        success: false,
        error: 'QUEUE_ERROR',
        message: err.message
      };
    }
  }

  async processDataWithImmediateCheck(rawData) {
    const validationResult = validateCorrosionData(rawData);
    if (!validationResult.valid) {
      return {
        success: false,
        error: 'VALIDATION_ERROR',
        errors: validationResult.errors
      };
    }

    const data = validationResult.data;

    const fingerprint = this.generateMessageFingerprint(data);
    const isDuplicate = await this.isDuplicateMessage(fingerprint);
    if (isDuplicate) {
      logger.debug(`Duplicate message in immediate check: device=${data.deviceId}`);
      return {
        success: true,
        deviceId: data.deviceId,
        timestamp: data.timestamp,
        isDuplicate: true,
        alert: null,
        message: 'Duplicate message, already processed'
      };
    }

    const alertResult = await alertThresholdService.evaluateCorrosionData(data.corrosion);
    let alertMessage = null;

    if (alertResult.isAlert) {
      const isSuppressed = await alertThresholdService.shouldSuppressAlert(
        data.deviceId,
        alertResult.level
      );

      const isDuplicateAlert = await alertThresholdService.isDuplicateAlert(
        data.deviceId,
        alertResult.level,
        data.timestamp
      );

      if (!isSuppressed && !isDuplicateAlert) {
        alertMessage = await alertThresholdService.generateAlertMessage(
          data.deviceId,
          data.location,
          data.corrosion,
          alertResult,
          data.timestamp
        );
        await alertThresholdService.markAlertSent(
          data.deviceId,
          alertResult.level,
          alertMessage.alertId
        );
      } else if (isDuplicateAlert) {
        logger.debug(`Duplicate alert suppressed: device=${data.deviceId}, level=${alertResult.level}`);
      }
    }

    try {
      await taskSchedulerService.addCorrosionDataJob(data);

      if (alertMessage) {
        await taskSchedulerService.addAlertJob(alertMessage);
      }
    } catch (err) {
      const key = `${MESSAGE_ID_CACHE_PREFIX}${fingerprint}`;
      await redisClient.del(key);
      throw err;
    }

    return {
      success: true,
      deviceId: data.deviceId,
      alert: alertMessage ? {
        level: alertMessage.level,
        title: alertMessage.title,
        alertId: alertMessage.alertId
      } : null,
      alertDetails: alertResult
    };
  }

  async updateDeviceHeartbeat(deviceId) {
    const heartbeatKey = `device:heartbeat:${deviceId}`;
    await redisClient.set(heartbeatKey, Date.now(), DEVICE_HEARTBEAT_TTL);
  }

  async updateDeviceStatus(deviceId, data) {
    const statusKey = `device:status:${deviceId}`;
    const status = {
      lastSeen: Date.now(),
      lastPotential: data.corrosion.potential,
      lastLocation: {
        kilometerMarker: data.location.kilometerMarker,
        latitude: data.location.latitude,
        longitude: data.location.longitude
      },
      signalStrength: data.metadata?.signalStrength || null,
      batteryLevel: data.metadata?.batteryLevel || null
    };
    await redisClient.set(statusKey, JSON.stringify(status), 3600);
  }

  async getDeviceStatus(deviceId) {
    const statusKey = `device:status:${deviceId}`;
    const status = await redisClient.get(statusKey);
    return status ? JSON.parse(status) : null;
  }

  async getDeviceHeartbeat(deviceId) {
    const heartbeatKey = `device:heartbeat:${deviceId}`;
    const lastHeartbeat = await redisClient.get(heartbeatKey);
    return {
      deviceId,
      lastHeartbeat: lastHeartbeat ? parseInt(lastHeartbeat) : null,
      isOnline: !!lastHeartbeat
    };
  }

  getProcessingStats() {
    return { ...this.processingStats };
  }

  async getOnlineDeviceCount() {
    const keys = await redisClient.getClient().keys('device:heartbeat:*');
    return keys.length;
  }
}

module.exports = new DataProcessingService();
