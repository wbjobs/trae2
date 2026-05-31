const logger = require('../utils/logger');
const redisClient = require('../utils/redis');
const { config, AlertLevel } = require('../config');

const HEARTBEAT_PREFIX = 'device:heartbeat:';
const STATUS_PREFIX = 'device:status:';
const OFFLINE_THRESHOLD = config.deviceMonitor.offlineThreshold;
const WARNING_THRESHOLD = config.deviceMonitor.warningThreshold;
const CRITICAL_THRESHOLD = config.deviceMonitor.criticalThreshold;
const CHECK_INTERVAL = config.deviceMonitor.checkInterval;

class DeviceMonitorService {
  constructor() {
    this.checkTimer = null;
    this.offlineDevices = new Map();
    this.init();
  }

  init() {
    this.startMonitoring();
    logger.info('Device monitor service initialized');
  }

  startMonitoring() {
    this.checkTimer = setInterval(() => {
      this.checkDeviceHeartbeats();
    }, CHECK_INTERVAL);

    logger.info(`Device monitoring started, checking every ${CHECK_INTERVAL / 1000}s`);
  }

  stopMonitoring() {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
      logger.info('Device monitoring stopped');
    }
  }

  async checkDeviceHeartbeats() {
    try {
      const now = Date.now();
      const keys = await redisClient.getClient().keys(`${HEARTBEAT_PREFIX}*`);

      for (const key of keys) {
        const deviceId = key.replace(HEARTBEAT_PREFIX, '');
        const lastHeartbeat = parseInt(await redisClient.getClient().get(key)) || 0;
        const offlineDuration = now - lastHeartbeat;

        await this.evaluateDeviceStatus(deviceId, offlineDuration, lastHeartbeat);
      }

      logger.debug(`Device heartbeat check completed, scanned ${keys.length} devices`);
    } catch (err) {
      logger.error('Error checking device heartbeats:', err);
    }
  }

  async evaluateDeviceStatus(deviceId, offlineDuration, lastHeartbeat) {
    const statusKey = `device:offline_status:${deviceId}`;
    const previousStatus = await redisClient.get(statusKey);
    let newStatus = null;

    if (offlineDuration >= CRITICAL_THRESHOLD) {
      newStatus = {
        level: AlertLevel.CRITICAL,
        duration: offlineDuration,
        description: '设备长时间离线，疑似通信故障'
      };
    } else if (offlineDuration >= WARNING_THRESHOLD) {
      newStatus = {
        level: AlertLevel.WARNING,
        duration: offlineDuration,
        description: '设备离线，等待重新连接'
      };
    } else {
      if (previousStatus) {
        await redisClient.del(statusKey);
        this.offlineDevices.delete(deviceId);
        logger.info(`Device ${deviceId} recovered, online duration: ${Date.now() - lastHeartbeat}ms`);
      }
      return;
    }

    if (!previousStatus || JSON.parse(previousStatus).level !== newStatus.level) {
      await redisClient.set(statusKey, JSON.stringify({
        ...newStatus,
        lastHeartbeat,
        detectedAt: Date.now()
      }));

      this.offlineDevices.set(deviceId, newStatus);
      logger.warn(`Device ${deviceId} status changed to ${newStatus.level}, offline for ${offlineDuration / 1000}s`);

      if (newStatus.level === AlertLevel.CRITICAL) {
        await this.triggerOfflineAlert(deviceId, newStatus);
      }
    }
  }

  async triggerOfflineAlert(deviceId, status) {
    try {
      const deviceStatus = await redisClient.getClient().get(`${STATUS_PREFIX}${deviceId}`);
      let location = { pipelineId: 'unknown', segmentId: 'unknown', kilometerMarker: 0 };

      if (deviceStatus) {
        const parsed = JSON.parse(deviceStatus);
        location = parsed.lastLocation || location;
      }

      const alert = {
        alertId: `OFFLINE-${Date.now()}-${deviceId.split('-')[1] || 'unknown'}`,
        deviceId,
        location,
        level: AlertLevel.CRITICAL,
        title: '监测终端离线告警',
        description: `设备已离线 ${Math.floor(status.duration / 1000)} 秒`,
        primaryFactor: 'offline',
        offlineDuration: status.duration,
        lastHeartbeat: Date.now() - status.duration,
        timestamp: Date.now(),
        receivedAt: Date.now(),
        acknowledged: false,
        acknowledgedBy: null,
        acknowledgedAt: null
      };

      const alertProcessingQueue = require('./taskScheduler.service').queues?.alertProcessing;
      if (alertProcessingQueue) {
        await alertProcessingQueue.add(alert, {
          priority: 1,
          jobId: `alert:${alert.alertId}`
        });
      }

      logger.warn(`Offline alert triggered for device ${deviceId}`);
    } catch (err) {
      logger.error('Error triggering offline alert:', err);
    }
  }

  async getDeviceOnlineStatus(deviceId) {
    const heartbeatKey = `${HEARTBEAT_PREFIX}${deviceId}`;
    const lastHeartbeat = parseInt(await redisClient.getClient().get(heartbeatKey)) || 0;
    const offlineDuration = Date.now() - lastHeartbeat;

    return {
      deviceId,
      isOnline: offlineDuration < OFFLINE_THRESHOLD,
      lastHeartbeat,
      offlineDuration: lastHeartbeat ? offlineDuration : null,
      status: lastHeartbeat ? (offlineDuration < OFFLINE_THRESHOLD ? 'online' :
        offlineDuration < WARNING_THRESHOLD ? 'warning' :
        offlineDuration < CRITICAL_THRESHOLD ? 'offline' : 'critical') : 'unknown'
    };
  }

  async getOfflineDevices() {
    const devices = [];
    const keys = await redisClient.getClient().keys('device:offline_status:*');

    for (const key of keys) {
      const deviceId = key.replace('device:offline_status:', '');
      const status = await redisClient.get(key);
      if (status) {
        devices.push({
          deviceId,
          ...JSON.parse(status)
        });
      }
    }

    return {
      count: devices.length,
      devices: devices.sort((a, b) => b.duration - a.duration)
    };
  }

  async getDeviceStatistics() {
    const heartbeatKeys = await redisClient.getClient().keys(`${HEARTBEAT_PREFIX}*`);
    const offlineStatusKeys = await redisClient.getClient().keys('device:offline_status:*');

    const now = Date.now();
    let onlineCount = 0;
    let warningCount = 0;
    let offlineCount = 0;
    let criticalCount = 0;

    for (const key of heartbeatKeys) {
      const lastHeartbeat = parseInt(await redisClient.getClient().get(key)) || 0;
      const duration = now - lastHeartbeat;

      if (duration < OFFLINE_THRESHOLD) {
        onlineCount++;
      } else if (duration < WARNING_THRESHOLD) {
        warningCount++;
      } else if (duration < CRITICAL_THRESHOLD) {
        offlineCount++;
      } else {
        criticalCount++;
      }
    }

    return {
      totalDevices: heartbeatKeys.length,
      online: onlineCount,
      warning: warningCount,
      offline: offlineCount,
      critical: criticalCount,
      offlineWithAlerts: offlineStatusKeys.length
    };
  }

  async batchCheckDevices(deviceIds) {
    const results = [];

    for (const deviceId of deviceIds) {
      const status = await this.getDeviceOnlineStatus(deviceId);
      results.push(status);
    }

    return results;
  }
}

module.exports = new DeviceMonitorService();
