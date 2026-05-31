const EventEmitter = require('events');
const config = require('../../config/config');
const logger = require('./logger');

class RuleEngine extends EventEmitter {
  constructor() {
    super();
    this.rules = new Map();
    this.ruleHistory = [];
    this.contextCache = new Map();
    this.maxHistory = 5000;
    this.ruleEvaluationCache = new Map();
    this.cacheTTL = 1000;
    this.initializeDefaultRules();
  }

  initializeDefaultRules() {
    this.addRule({
      id: 'SNR_CRITICAL_SPEED_LOW',
      name: '低速行驶SNR临界检测',
      category: 'SNR',
      enabled: true,
      priority: 100,
      conditions: [
        { field: 'speed', operator: '<', value: 30 },
        { field: 'snr', operator: '<', value: 0 }
      ],
      logic: 'AND',
      severity: 'critical',
      message: '低速行驶时信噪比低于0dB，可能存在基站覆盖盲区',
      cooldown: 10000
    });

    this.addRule({
      id: 'SNR_CRITICAL_SPEED_HIGH',
      name: '高速行驶SNR临界检测',
      category: 'SNR',
      enabled: true,
      priority: 90,
      conditions: [
        { field: 'speed', operator: '>', value: 100 },
        { field: 'snr', operator: '<', value: 5 }
      ],
      logic: 'AND',
      severity: 'critical',
      message: '高速行驶时信噪比偏低，可能是切换区域信号衰减',
      cooldown: 8000
    });

    this.addRule({
      id: 'SNR_DROP_RAPID',
      name: 'SNR快速下降检测',
      category: 'SNR',
      enabled: true,
      priority: 95,
      conditions: [
        { field: 'snrDropRate', operator: '>', value: 10 },
        { field: 'currentSnr', operator: '<', value: 20 }
      ],
      logic: 'AND',
      severity: 'critical',
      message: '信噪比快速下降，可能进入隧道或信号遮挡区域',
      cooldown: 5000
    });

    this.addRule({
      id: 'PACKET_LOSS_CRITICAL',
      name: '丢包率临界检测',
      category: 'PACKET_LOSS',
      enabled: true,
      priority: 85,
      conditions: [
        { field: 'packetLossRate', operator: '>', value: 5 },
        { field: 'consecutivePackets', operator: '>', value: 3 }
      ],
      logic: 'AND',
      severity: 'critical',
      message: '连续丢包率超过5%，通信质量严重下降',
      cooldown: 10000
    });

    this.addRule({
      id: 'PACKET_LOSS_TREND',
      name: '丢包率上升趋势检测',
      category: 'PACKET_LOSS',
      enabled: true,
      priority: 70,
      conditions: [
        { field: 'packetLossTrend', operator: '>', value: 0 },
        { field: 'packetLossRate', operator: '>', value: 1 }
      ],
      logic: 'AND',
      severity: 'warning',
      message: '丢包率呈上升趋势，需要关注',
      cooldown: 15000
    });

    this.addRule({
      id: 'LATENCY_SPIKE',
      name: '延迟突增检测',
      category: 'LATENCY',
      enabled: true,
      priority: 75,
      conditions: [
        { field: 'latency', operator: '>', value: 500 },
        { field: 'latencySpike', operator: '>', value: 300 }
      ],
      logic: 'AND',
      severity: 'warning',
      message: '通信延迟突增，可能网络拥塞',
      cooldown: 10000
    });

    this.addRule({
      id: 'HANDOVER_FAILURE',
      name: '基站切换失败检测',
      category: 'HANDOVER',
      enabled: true,
      priority: 100,
      conditions: [
        { field: 'isHandoverZone', operator: '==', value: true },
        { field: 'snr', operator: '<', value: 10 },
        { field: 'packetLossRate', operator: '>', value: 2 }
      ],
      logic: 'AND',
      severity: 'critical',
      message: '基站切换区域通信质量下降，可能切换失败',
      cooldown: 5000
    });

    this.addRule({
      id: 'CHANNEL_BLACKOUT',
      name: '信道中断检测',
      category: 'CHANNEL',
      enabled: true,
      priority: 100,
      conditions: [
        { field: 'lastUpdateAge', operator: '>', value: 5000 },
        { field: 'previousStatus', operator: '==', value: 'active' }
      ],
      logic: 'AND',
      severity: 'critical',
      message: '信道数据中断超过5秒，可能通信链路断开',
      cooldown: 3000
    });

    this.addRule({
      id: 'JITTER_INSTABILITY',
      name: '抖动不稳定检测',
      category: 'JITTER',
      enabled: true,
      priority: 60,
      conditions: [
        { field: 'jitterVariance', operator: '>', value: 50 },
        { field: 'avgJitter', operator: '>', value: 30 }
      ],
      logic: 'AND',
      severity: 'warning',
      message: '信道抖动波动较大，影响实时通信稳定性',
      cooldown: 20000
    });

    this.addRule({
      id: 'MULTI_CHANNEL_DEGRADATION',
      name: '多信道同时降级检测',
      category: 'SYSTEM',
      enabled: true,
      priority: 90,
      conditions: [
        { field: 'degradedChannelCount', operator: '>', value: 3 },
        { field: 'overallScore', operator: '<', value: 60 }
      ],
      logic: 'AND',
      severity: 'critical',
      message: '多个信道同时降级，可能存在系统性干扰',
      cooldown: 15000
    });

    logger.info(`RuleEngine initialized with ${this.rules.size} rules`);
  }

  addRule(rule) {
    rule.lastTriggered = 0;
    rule.triggerCount = 0;
    this.rules.set(rule.id, rule);
    logger.info(`Rule added: ${rule.id}`);
  }

  removeRule(ruleId) {
    if (this.rules.has(ruleId)) {
      this.rules.delete(ruleId);
      logger.info(`Rule removed: ${ruleId}`);
      return true;
    }
    return false;
  }

  enableRule(ruleId) {
    const rule = this.rules.get(ruleId);
    if (rule) {
      rule.enabled = true;
      return true;
    }
    return false;
  }

  disableRule(ruleId) {
    const rule = this.rules.get(ruleId);
    if (rule) {
      rule.enabled = false;
      return true;
    }
    return false;
  }

  evaluateCondition(condition, context) {
    const { field, operator, value } = condition;
    const actualValue = this.getFieldValue(field, context);

    if (actualValue === undefined || actualValue === null) {
      return false;
    }

    switch (operator) {
      case '>':
        return actualValue > value;
      case '<':
        return actualValue < value;
      case '>=':
        return actualValue >= value;
      case '<=':
        return actualValue <= value;
      case '==':
        return actualValue == value;
      case '!=':
        return actualValue != value;
      case 'between':
        return actualValue >= value[0] && actualValue <= value[1];
      case 'in':
        return value.includes(actualValue);
      default:
        logger.warn(`Unknown operator: ${operator}`);
        return false;
    }
  }

  getFieldValue(field, context) {
    if (context[field] !== undefined) {
      return context[field];
    }

    const computedFields = {
      snrDropRate: () => this.computeSnrDropRate(context),
      packetLossTrend: () => this.computePacketLossTrend(context),
      latencySpike: () => this.computeLatencySpike(context),
      jitterVariance: () => this.computeJitterVariance(context),
      lastUpdateAge: () => Date.now() - (context.lastUpdate || 0),
      isHandoverZone: () => this.isHandoverZone(context),
      degradedChannelCount: () => context.degradedChannelCount || 0,
      consecutivePackets: () => context.consecutivePackets || 0
    };

    if (computedFields[field]) {
      return computedFields[field]();
    }

    return undefined;
  }

  computeSnrDropRate(context) {
    if (!context.history || context.history.length < 3) return 0;
    const recent = context.history.slice(-3);
    const firstSnr = recent[0].snr;
    const lastSnr = recent[recent.length - 1].snr;
    const timeSpan = recent[recent.length - 1].timestamp - recent[0].timestamp;
    if (timeSpan === 0) return 0;
    return ((firstSnr - lastSnr) / timeSpan) * 1000;
  }

  computePacketLossTrend(context) {
    if (!context.history || context.history.length < 5) return 0;
    const recent = context.history.slice(-5);
    const firstHalf = recent.slice(0, 2).reduce((sum, h) => sum + h.packetLossRate, 0) / 2;
    const secondHalf = recent.slice(3).reduce((sum, h) => sum + h.packetLossRate, 0) / 2;
    return secondHalf - firstHalf;
  }

  computeLatencySpike(context) {
    if (!context.history || context.history.length < 5) return 0;
    const recent = context.history.slice(-5);
    const avgLatency = recent.reduce((sum, h) => sum + h.latency, 0) / recent.length;
    const currentLatency = context.latency || 0;
    return Math.max(0, currentLatency - avgLatency);
  }

  computeJitterVariance(context) {
    if (!context.history || context.history.length < 5) return 0;
    const recent = context.history.slice(-5);
    const jitterValues = recent.map(h => h.jitter || 0);
    const avg = jitterValues.reduce((sum, j) => sum + j, 0) / jitterValues.length;
    const variance = jitterValues.reduce((sum, j) => sum + Math.pow(j - avg, 2), 0) / jitterValues.length;
    return Math.sqrt(variance);
  }

  isHandoverZone(context) {
    if (!context.location || !context.baseStations) return false;
    const { km, station } = context.location;
    const handoverZones = config.ruleEngine?.handoverZones || [
      { station: '北京南站', startKm: 0, endKm: 5 },
      { station: '济南西站', startKm: 400, endKm: 405 },
      { station: '南京南站', startKm: 1000, endKm: 1005 }
    ];
    return handoverZones.some(zone =>
      zone.station === station && km >= zone.startKm && km <= zone.endKm
    );
  }

  evaluateRule(rule, context) {
    if (!rule.enabled) return false;

    const now = Date.now();
    if (now - rule.lastTriggered < rule.cooldown) {
      return false;
    }

    let result;
    if (rule.logic === 'AND') {
      result = rule.conditions.every(condition => this.evaluateCondition(condition, context));
    } else {
      result = rule.conditions.some(condition => this.evaluateCondition(condition, context));
    }

    if (result) {
      rule.lastTriggered = now;
      rule.triggerCount++;

      const triggerRecord = {
        ruleId: rule.id,
        ruleName: rule.name,
        timestamp: now,
        severity: rule.severity,
        message: rule.message,
        context: this.sanitizeContext(context)
      };

      this.ruleHistory.push(triggerRecord);
      if (this.ruleHistory.length > this.maxHistory) {
        this.ruleHistory.shift();
      }

      this.emit('ruleTriggered', triggerRecord);
    }

    return result;
  }

  evaluateAllRules(context, channelId) {
    const triggeredRules = [];
    const sortedRules = Array.from(this.rules.values())
      .filter(r => r.enabled)
      .sort((a, b) => b.priority - a.priority);

    for (const rule of sortedRules) {
      if (this.evaluateRule(rule, context)) {
        triggeredRules.push({
          id: rule.id,
          name: rule.name,
          severity: rule.severity,
          message: rule.message,
          priority: rule.priority
        });

        if (rule.severity === 'critical' && rule.priority >= 90) {
          break;
        }
      }
    }

    return triggeredRules;
  }

  sanitizeContext(context) {
    const sanitized = { ...context };
    if (sanitized.history) {
      sanitized.history = sanitized.history.slice(-5);
    }
    return sanitized;
  }

  getActiveRules() {
    return Array.from(this.rules.values()).filter(r => r.enabled);
  }

  getAllRules() {
    return Array.from(this.rules.values());
  }

  getRuleStatistics() {
    const stats = {
      totalRules: this.rules.size,
      activeRules: 0,
      triggerCount: 0,
      byCategory: {},
      bySeverity: {
        critical: 0,
        warning: 0,
        info: 0
      }
    };

    this.rules.forEach(rule => {
      if (rule.enabled) stats.activeRules++;
      stats.triggerCount += rule.triggerCount;

      if (!stats.byCategory[rule.category]) {
        stats.byCategory[rule.category] = { count: 0, triggers: 0 };
      }
      stats.byCategory[rule.category].count++;
      stats.byCategory[rule.category].triggers += rule.triggerCount;

      if (stats.bySeverity[rule.severity] !== undefined) {
        stats.bySeverity[rule.severity]++;
      }
    });

    return stats;
  }

  getRuleHistory(limit = 100) {
    return this.ruleHistory.slice(-limit).reverse();
  }

  resetRuleStats() {
    this.rules.forEach(rule => {
      rule.triggerCount = 0;
      rule.lastTriggered = 0;
    });
    this.ruleHistory = [];
    logger.info('Rule statistics reset');
  }
}

const ruleEngine = new RuleEngine();
module.exports = ruleEngine;
