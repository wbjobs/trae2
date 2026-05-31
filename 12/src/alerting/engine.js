const EventEmitter = require('events');
const config = require('../config');
const logger = require('../utils/logger');
const IORedis = require('ioredis');

const redisClient = new IORedis({
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  db: config.redis.db,
  maxRetriesPerRequest: null,
  enableReadyCheck: false
});

const alertEvents = new EventEmitter();
alertEvents.setMaxListeners(100);

const alertEngine = {
  rules: new Map(),
  activeAlerts: new Map(),
  lastValues: new Map(),
  lastAlertTimes: new Map(),

  async init() {
    try {
      const rulesData = await redisClient.get('alert_rules');
      if (rulesData) {
        const rules = JSON.parse(rulesData);
        rules.forEach(rule => {
          this.rules.set(rule.ruleId, rule);
        });
        logger.info(`已加载告警规则: ${this.rules.size} 条`);
      }

      const activeAlertsData = await redisClient.get('active_alerts');
      if (activeAlertsData) {
        const alerts = JSON.parse(activeAlertsData);
        alerts.forEach(alert => {
          this.activeAlerts.set(alert.alertId, alert);
        });
        logger.info(`已加载活跃告警: ${this.activeAlerts.size} 条`);
      }

      this.startDetectionLoop();
      logger.info('告警引擎初始化完成');
    } catch (error) {
      logger.error(`告警引擎初始化失败: ${error.message}`);
    }
  },

  async saveRules() {
    const rules = Array.from(this.rules.values());
    await redisClient.set('alert_rules', JSON.stringify(rules));
  },

  async saveActiveAlerts() {
    const alerts = Array.from(this.activeAlerts.values());
    await redisClient.set('active_alerts', JSON.stringify(alerts));
  },

  async addRule(rule) {
    this.rules.set(rule.ruleId, {
      ...rule,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
    await this.saveRules();
    logger.info(`已添加告警规则: ${rule.ruleId}`);
    return this.rules.get(rule.ruleId);
  },

  async updateRule(ruleId, updates) {
    if (!this.rules.has(ruleId)) {
      throw new Error(`规则不存在: ${ruleId}`);
    }

    const existing = this.rules.get(ruleId);
    this.rules.set(ruleId, {
      ...existing,
      ...updates,
      updatedAt: Date.now()
    });
    await this.saveRules();
    logger.info(`已更新告警规则: ${ruleId}`);
    return this.rules.get(ruleId);
  },

  async deleteRule(ruleId) {
    const deleted = this.rules.delete(ruleId);
    if (deleted) {
      await this.saveRules();
      logger.info(`已删除告警规则: ${ruleId}`);
    }
    return deleted;
  },

  getRule(ruleId) {
    return this.rules.get(ruleId);
  },

  getAllRules(filters = {}) {
    let rules = Array.from(this.rules.values());

    if (filters.enabled !== undefined) {
      rules = rules.filter(r => r.enabled === filters.enabled);
    }
    if (filters.deviceId) {
      rules = rules.filter(r => r.deviceId === filters.deviceId);
    }
    if (filters.severity) {
      rules = rules.filter(r => r.severity === filters.severity);
    }

    return rules;
  },

  checkThresholdCondition(value, condition) {
    const { operator, value: threshold } = condition;

    switch (operator) {
      case '>': return value > threshold;
      case '>=': return value >= threshold;
      case '<': return value < threshold;
      case '<=': return value <= threshold;
      case '==': return value === threshold;
      case '!=': return value !== threshold;
      default: return false;
    }
  },

  checkRangeCondition(value, condition) {
    const { minValue, maxValue } = condition;
    return value < minValue || value > maxValue;
  },

  checkChangeCondition(value, key, condition) {
    const lastValue = this.lastValues.get(key);
    if (lastValue === undefined || typeof value !== 'number' || typeof lastValue !== 'number') {
      this.lastValues.set(key, value);
      return false;
    }

    const changePercent = Math.abs((value - lastValue) / lastValue * 100);
    const result = changePercent >= condition.changePercent;
    this.lastValues.set(key, value);

    return result;
  },

  checkQualityCondition(quality, condition) {
    return quality < 192;
  },

  checkFrozenCondition(value, key, condition) {
    const lastValue = this.lastValues.get(key);
    if (lastValue === undefined) {
      this.lastValues.set(key, value);
      return false;
    }

    const isFrozen = value === lastValue;
    this.lastValues.set(key, value);
    return isFrozen;
  },

  checkCondition(value, quality, key, condition) {
    switch (condition.type) {
      case 'threshold':
        if (typeof value !== 'number') return false;
        return this.checkThresholdCondition(value, condition);

      case 'range':
        if (typeof value !== 'number') return false;
        return this.checkRangeCondition(value, condition);

      case 'change':
        return this.checkChangeCondition(value, key, condition);

      case 'quality':
        return this.checkQualityCondition(quality, condition);

      case 'frozen':
        return this.checkFrozenCondition(value, key, condition);

      case 'missing':
        return value === null || value === undefined;

      default:
        return false;
    }
  },

  generateAlertId(ruleId, deviceId, tagId) {
    return `alert_${ruleId}_${deviceId}_${tagId}_${Date.now()}`;
  },

  getAlertKey(ruleId, deviceId, tagId) {
    return `${ruleId}_${deviceId || 'all'}_${tagId}`;
  },

  async processDataPoint(deviceId, tagId, value, quality, timestamp) {
    const results = [];

    for (const [ruleId, rule] of this.rules.entries()) {
      if (!rule.enabled) continue;

      if (rule.deviceId && rule.deviceId !== deviceId) continue;
      if (rule.tagId !== tagId) continue;

      const key = this.getAlertKey(ruleId, deviceId, tagId);
      const isAlertCondition = this.checkCondition(value, quality, key, rule.condition);

      const lastAlertTime = this.lastAlertTimes.get(key) || 0;
      const cooldownRemaining = rule.notification.cooldown - (Date.now() - lastAlertTime);

      if (isAlertCondition && cooldownRemaining <= 0) {
        const alert = {
          alertId: this.generateAlertId(ruleId, deviceId, tagId),
          ruleId,
          ruleName: rule.name,
          deviceId,
          tagId,
          value,
          quality,
          severity: rule.severity,
          condition: rule.condition,
          status: 'active',
          timestamp: timestamp || Date.now(),
          firstTriggered: this.lastAlertTimes.get(key) || Date.now(),
          acknowledged: false,
          acknowledgedBy: null,
          acknowledgedAt: null,
          comment: null
        };

        this.activeAlerts.set(alert.alertId, alert);
        this.lastAlertTimes.set(key, Date.now());

        await this.saveActiveAlerts();

        this.triggerAlertActions(alert, rule);

        alertEvents.emit('alert', alert);

        results.push(alert);

        logger.warn(`告警触发: ${rule.name}`, {
          deviceId,
          tagId,
          value,
          severity: rule.severity
        });
      }
    }

    return results;
  },

  async processData(deviceData) {
    const { deviceId, points, timestamp } = deviceData;
    const allAlerts = [];

    for (const point of points) {
      const alerts = await this.processDataPoint(
        deviceId,
        point.tagId,
        point.value,
        point.quality,
        timestamp
      );
      allAlerts.push(...alerts);
    }

    return allAlerts;
  },

  triggerAlertActions(alert, rule) {
    if (!rule.actions || rule.actions.length === 0) return;

    for (const action of rule.actions) {
      switch (action.type) {
        case 'log':
          logger[alert.severity === 'info' ? 'info' : 'warn'](
            `告警: ${alert.ruleName}`,
            { alert, action: action.config }
          );
          break;

        case 'webhook':
          this.sendWebhook(action.config.url, alert);
          break;

        case 'api':
          this.sendApiCall(action.config, alert);
          break;

        default:
          logger.debug(`未实现的告警动作类型: ${action.type}`);
      }
    }
  },

  async sendWebhook(url, alert) {
    try {
      const https = url.startsWith('https') ? require('https') : require('http');
      const urlObj = new URL(url);

      const data = JSON.stringify(alert);
      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        }
      };

      const req = https.request(options, (res) => {
        logger.debug(`Webhook发送完成: ${res.statusCode}`);
      });

      req.on('error', (error) => {
        logger.error(`Webhook发送失败: ${error.message}`);
      });

      req.write(data);
      req.end();
    } catch (error) {
      logger.error(`Webhook调用失败: ${error.message}`);
    }
  },

  async sendApiCall(config, alert) {
    try {
      const https = config.url.startsWith('https') ? require('https') : require('http');
      const urlObj = new URL(config.url);

      const data = JSON.stringify(config.body ? { ...config.body, alert } : alert);
      const headers = {
        'Content-Type': 'application/json',
        ...(config.headers || {})
      };

      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname,
        method: config.method || 'POST',
        headers
      };

      const req = https.request(options, () => {});
      req.on('error', () => {});
      req.write(data);
      req.end();
    } catch (error) {
      logger.debug(`API调用失败: ${error.message}`);
    }
  },

  getActiveAlerts(filters = {}) {
    let alerts = Array.from(this.activeAlerts.values());

    if (filters.status) {
      alerts = alerts.filter(a => a.status === filters.status);
    }
    if (filters.severity) {
      alerts = alerts.filter(a => a.severity === filters.severity);
    }
    if (filters.deviceId) {
      alerts = alerts.filter(a => a.deviceId === filters.deviceId);
    }
    if (filters.acknowledged !== undefined) {
      alerts = alerts.filter(a => a.acknowledged === filters.acknowledged);
    }

    alerts.sort((a, b) => b.timestamp - a.timestamp);

    return alerts;
  },

  async acknowledgeAlert(alertId, acknowledgedBy, comment = null, clear = false) {
    const alert = this.activeAlerts.get(alertId);
    if (!alert) {
      throw new Error(`告警不存在: ${alertId}`);
    }

    alert.acknowledged = true;
    alert.acknowledgedBy = acknowledgedBy;
    alert.acknowledgedAt = Date.now();
    alert.comment = comment;

    if (clear) {
      alert.status = 'cleared';
    } else {
      alert.status = 'acknowledged';
    }

    await this.saveActiveAlerts();

    logger.info(`告警已确认: ${alertId}`, { acknowledgedBy });
    return alert;
  },

  async clearAlert(alertId) {
    const alert = this.activeAlerts.get(alertId);
    if (!alert) {
      throw new Error(`告警不存在: ${alertId}`);
    }

    alert.status = 'cleared';
    alert.clearedAt = Date.now();

    await this.saveActiveAlerts();

    logger.info(`告警已清除: ${alertId}`);
    return alert;
  },

  async clearAlertsByDevice(deviceId) {
    let count = 0;
    for (const [alertId, alert] of this.activeAlerts.entries()) {
      if (alert.deviceId === deviceId && alert.status !== 'cleared') {
        alert.status = 'cleared';
        alert.clearedAt = Date.now();
        count++;
      }
    }
    await this.saveActiveAlerts();
    return count;
  },

  startDetectionLoop() {
    setInterval(async () => {
      try {
        const stats = this.getStats();
        logger.debug(`告警引擎状态: active=${stats.activeAlerts}, rules=${stats.totalRules}`);
      } catch (error) {
        logger.error(`告警引擎循环错误: ${error.message}`);
      }
    }, 60000);
  },

  getStats() {
    const activeCount = Array.from(this.activeAlerts.values())
      .filter(a => a.status === 'active').length;

    const severityCounts = {
      info: 0,
      warning: 0,
      critical: 0,
      error: 0
    };

    for (const alert of this.activeAlerts.values()) {
      if (alert.status === 'active') {
        severityCounts[alert.severity] = (severityCounts[alert.severity] || 0) + 1;
      }
    }

    return {
      totalRules: this.rules.size,
      activeAlerts: activeCount,
      totalAlerts: this.activeAlerts.size,
      severityCounts,
      lastValues: this.lastValues.size
    };
  },

  onAlert(callback) {
    alertEvents.on('alert', callback);
  },

  async close() {
    await redisClient.quit();
    alertEvents.removeAllListeners();
  }
};

module.exports = alertEngine;
