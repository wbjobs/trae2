const EventEmitter = require('events');
const config = require('../../config/config');
const logger = require('../modules/logger');
const ruleEngine = require('../modules/ruleEngine');

class AnalysisService extends EventEmitter {
  constructor() {
    super();
    this.running = false;
    this.signalingService = null;
    this.analysisHistory = [];
    this.alerts = [];
    this.channelQuality = new Map();
    this.consecutiveErrors = new Map();
    this.analysisInterval = null;
    this.ruleEvaluationInterval = null;
    this.maxHistory = 1000;
    this.maxAlerts = 500;
    this.evaluationCache = new Map();
    this.cacheTTL = 2000;
    this.degradedChannelCount = 0;
  }

  async start(signalingService) {
    if (this.running) return;
    this.running = true;
    this.signalingService = signalingService;

    this.startPeriodicAnalysis();
    
    if (config.ruleEngine?.enabled) {
      this.startRuleEvaluation();
    }

    ruleEngine.on('ruleTriggered', (trigger) => {
      this.handleRuleTriggered(trigger);
    });

    logger.info('Analysis service started with rule engine integration');
  }

  startPeriodicAnalysis() {
    this.analysisInterval = setInterval(() => {
      if (!this.running) return;
      this.performAnalysis();
    }, 1000);
  }

  startRuleEvaluation() {
    this.ruleEvaluationInterval = setInterval(() => {
      if (!this.running) return;
      this.evaluateAllChannelRules();
    }, config.ruleEngine?.evaluationInterval || 1000);
  }

  evaluateAllChannelRules() {
    if (!this.signalingService) return;

    const channels = this.signalingService.channels;
    const now = Date.now();

    channels.forEach((channel, channelId) => {
      if (channel.status !== 'active') return;

      const cacheKey = `${channelId}:${Math.floor(now / this.cacheTTL)}`;
      if (this.evaluationCache.has(cacheKey)) return;

      const context = this.buildRuleContext(channel);
      const triggeredRules = ruleEngine.evaluateAllRules(context, channelId);

      if (triggeredRules.length > 0) {
        this.handleRuleTriggeredForChannel(channelId, triggeredRules);
      }

      this.evaluationCache.set(cacheKey, true);
    });

    const expiredKeys = [];
    this.evaluationCache.forEach((_, key) => {
      const [, timeBucket] = key.split(':');
      if (parseInt(timeBucket) < Math.floor(now / this.cacheTTL)) {
        expiredKeys.push(key);
      }
    });
    expiredKeys.forEach(key => this.evaluationCache.delete(key));
  }

  buildRuleContext(channel) {
    const context = {
      channelId: channel.id,
      protocol: channel.protocol,
      frequencyBand: channel.frequencyBand,
      snr: channel.snr,
      packetLossRate: channel.packetLossRate,
      latency: channel.latency,
      jitter: channel.jitter,
      lastUpdate: channel.lastUpdate,
      previousStatus: channel.previousStatus,
      history: channel.history.slice(-20),
      consecutiveLostPackets: channel.consecutiveLostPackets || 0,
      location: this.getCurrentLocation(),
      speed: this.getCurrentSpeed(),
      baseStations: this.getBaseStationInfo(),
      isHandoverZone: this.isInHandoverZone(),
      overallScore: this.getCurrentOverallScore(),
      degradedChannelCount: this.degradedChannelCount
    };

    return context;
  }

  getCurrentLocation() {
    return {
      km: Math.random() * 1300,
      station: this.getRandomStation()
    };
  }

  getCurrentSpeed() {
    return 80 + Math.random() * 120;
  }

  getBaseStationInfo() {
    return {
      serving: `BS-${Math.floor(Math.random() * 20)}`,
      neighbors: [
        `BS-${Math.floor(Math.random() * 20)}`,
        `BS-${Math.floor(Math.random() * 20)}`
      ],
      signalStrength: -60 + Math.random() * 40
    };
  }

  getRandomStation() {
    const stations = ['北京南站', '天津站', '济南西站', '徐州东站', '南京南站', '上海虹桥站'];
    return stations[Math.floor(Math.random() * stations.length)];
  }

  isInHandoverZone() {
    const location = this.getCurrentLocation();
    const handoverZones = config.ruleEngine?.handoverZones || [];
    return handoverZones.some(zone =>
      zone.station === location.station &&
      location.km >= zone.startKm &&
      location.km <= zone.endKm
    );
  }

  getCurrentOverallScore() {
    const stats = this.signalingService?.getStatistics() || { averageSnr: 0, averagePacketLoss: 0 };
    const snrScore = this.calculateSnrScore(stats.averageSnr);
    const plScore = this.calculatePacketLossScore(stats.averagePacketLoss);
    return Math.round((snrScore + plScore) / 2);
  }

  handleRuleTriggeredForChannel(channelId, rules) {
    const criticalRules = rules.filter(r => r.severity === 'critical');
    const warningRules = rules.filter(r => r.severity === 'warning');

    if (criticalRules.length > 0) {
      const alert = this.createAlertFromRules(channelId, criticalRules, 'critical');
      this.alerts.unshift(alert);
      this.trimAlerts();
      this.emit('alertCreated', alert);
      this.emit('anomalyDetected', {
        timestamp: Date.now(),
        channelId,
        rules: criticalRules,
        severity: 'critical'
      });
      logger.warn(`Critical rules triggered for ${channelId}: ${criticalRules.map(r => r.name).join(', ')}`);
    } else if (warningRules.length > 0 && warningRules.length >= 2) {
      const alert = this.createAlertFromRules(channelId, warningRules, 'warning');
      this.alerts.unshift(alert);
      this.trimAlerts();
      this.emit('alertCreated', alert);
      logger.info(`Warning rules triggered for ${channelId}: ${warningRules.map(r => r.name).join(', ')}`);
    }
  }

  handleRuleTriggered(trigger) {
    logger.debug(`Rule triggered: ${trigger.ruleName} (${trigger.severity})`);
    this.emit('ruleTriggered', trigger);
  }

  createAlertFromRules(channelId, rules, severity) {
    const channel = this.signalingService?.channels?.get(channelId) || {};
    const messages = rules.map(r => r.message);
    const ruleIds = rules.map(r => r.id);

    return {
      id: Date.now() + '-' + Math.random().toString(36).substr(2, 9),
      timestamp: Date.now(),
      channelId,
      protocol: channel.protocol || 'Unknown',
      frequencyBand: channel.frequencyBand || 'Unknown',
      severity,
      title: `${channelId} ${severity === 'critical' ? '严重' : '警告'}告警`,
      description: messages.join('; '),
      ruleIds,
      ruleNames: rules.map(r => r.name),
      anomalies: rules.map(r => ({
        type: r.id,
        severity: r.severity,
        message: r.message
      })),
      qualityScore: this.calculateChannelQualityScore(channel),
      snr: channel.snr || 0,
      packetLossRate: channel.packetLossRate || 0,
      acknowledged: false,
      resolved: false,
      source: 'ruleEngine'
    };
  }

  performAnalysis() {
    if (!this.signalingService) return;

    const channelStats = this.signalingService.getStatistics();
    const channels = this.signalingService.channels;

    const analysisResult = {
      timestamp: Date.now(),
      overallScore: this.calculateOverallScore(channelStats),
      channelStats,
      channelAnalysis: [],
      anomalies: [],
      recommendations: []
    };

    let degradedCount = 0;

    channels.forEach((channel, channelId) => {
      if (channel.status !== 'active') return;

      const channelAnalysis = this.analyzeChannel(channel);
      analysisResult.channelAnalysis.push(channelAnalysis);

      if (channelAnalysis.overallQuality === 'poor' || channelAnalysis.overallQuality === 'fair') {
        degradedCount++;
      }

      if (channelAnalysis.anomalies.length > 0) {
        analysisResult.anomalies.push(...channelAnalysis.anomalies);
      }

      this.channelQuality.set(channelId, channelAnalysis);
    });

    this.degradedChannelCount = degradedCount;

    analysisResult.recommendations = this.generateRecommendations(analysisResult);
    analysisResult.alertCount = this.alerts.filter(a => !a.resolved).length;
    analysisResult.degradedChannelCount = degradedCount;

    this.analysisHistory.push(analysisResult);
    if (this.analysisHistory.length > this.maxHistory) {
      this.analysisHistory.shift();
    }

    this.emit('analysisResult', analysisResult);

    if (analysisResult.anomalies.length > 0) {
      this.emit('anomalyDetected', {
        timestamp: Date.now(),
        anomalies: analysisResult.anomalies,
        overallScore: analysisResult.overallScore,
        degradedChannelCount
      });
    }
  }

  analyzeChannel(channel) {
    const analysis = {
      channelId: channel.id,
      protocol: channel.protocol,
      frequencyBand: channel.frequencyBand,
      timestamp: Date.now(),
      snr: channel.snr,
      packetLossRate: channel.packetLossRate,
      latency: channel.latency,
      jitter: channel.jitter,
      signalQuality: this.getSignalQualityLevel(channel.snr),
      packetLossQuality: this.getPacketLossQuality(channel.packetLossRate),
      latencyQuality: this.getLatencyQuality(channel.latency),
      jitterQuality: this.getJitterQuality(channel.jitter),
      overallQuality: 'good',
      qualityScore: 0,
      anomalies: [],
      trend: this.detectTrend(channel),
      consecutiveLostPackets: channel.consecutiveLostPackets || 0
    };

    const snrScore = this.calculateSnrScore(channel.snr);
    const plScore = this.calculatePacketLossScore(channel.packetLossRate);
    const latScore = this.calculateLatencyScore(channel.latency);
    const jitScore = this.calculateJitterScore(channel.jitter);

    analysis.qualityScore = Math.round((snrScore + plScore + latScore + jitScore) / 4);

    if (analysis.qualityScore >= 80) analysis.overallQuality = 'excellent';
    else if (analysis.qualityScore >= 60) analysis.overallQuality = 'good';
    else if (analysis.qualityScore >= 40) analysis.overallQuality = 'fair';
    else analysis.overallQuality = 'poor';

    analysis.anomalies = this.detectAnomalies(channel, analysis);

    if (analysis.anomalies.length > 0) {
      const errCount = this.consecutiveErrors.get(channel.id) || 0;
      this.consecutiveErrors.set(channel.id, errCount + 1);

      const threshold = this.getConsecutiveErrorThreshold(channel);
      if (errCount + 1 >= threshold) {
        const existingAlert = this.alerts.find(a =>
          a.channelId === channel.id &&
          !a.resolved &&
          Date.now() - a.timestamp < 30000
        );

        if (!existingAlert) {
          this.createAlert(channel, analysis);
        }
        this.consecutiveErrors.set(channel.id, 0);
      }
    } else {
      this.consecutiveErrors.set(channel.id, 0);
    }

    return analysis;
  }

  getConsecutiveErrorThreshold(channel) {
    if (channel.consecutiveLostPackets > 5) {
      return 2;
    }
    return config.analysis.anomalyThreshold.consecutiveErrors;
  }

  calculateOverallScore(stats) {
    const snrScore = this.calculateSnrScore(stats.averageSnr);
    const plScore = this.calculatePacketLossScore(stats.averagePacketLoss);
    return Math.round((snrScore + plScore) / 2);
  }

  calculateSnrScore(snr) {
    const thresholds = config.analysis.snr;
    if (snr >= thresholds.excellent) return 100;
    if (snr >= thresholds.good) return 80 + ((snr - thresholds.good) / (thresholds.excellent - thresholds.good)) * 20;
    if (snr >= thresholds.fair) return 60 + ((snr - thresholds.fair) / (thresholds.good - thresholds.fair)) * 20;
    if (snr >= thresholds.poor) return 40 + ((snr - thresholds.poor) / (thresholds.fair - thresholds.poor)) * 20;
    return Math.max(0, 40 + snr * 4);
  }

  calculatePacketLossScore(pl) {
    const thresholds = config.analysis.packetLoss;
    if (pl <= thresholds.excellent) return 100;
    if (pl <= thresholds.good) return 80 + ((thresholds.good - pl) / (thresholds.good - thresholds.excellent)) * 20;
    if (pl <= thresholds.fair) return 60 + ((thresholds.fair - pl) / (thresholds.fair - thresholds.good)) * 20;
    if (pl <= thresholds.poor) return 40 + ((thresholds.poor - pl) / (thresholds.poor - thresholds.fair)) * 20;
    return Math.max(0, 40 - (pl - thresholds.poor) * 2);
  }

  calculateLatencyScore(latency) {
    const thresholds = config.analysis.latency;
    if (latency <= thresholds.excellent) return 100;
    if (latency <= thresholds.good) return 80 + ((thresholds.good - latency) / (thresholds.good - thresholds.excellent)) * 20;
    if (latency <= thresholds.fair) return 60 + ((thresholds.fair - latency) / (thresholds.fair - thresholds.good)) * 20;
    if (latency <= thresholds.poor) return 40 + ((thresholds.poor - latency) / (thresholds.poor - thresholds.fair)) * 20;
    return Math.max(0, 40 - (latency - thresholds.poor) * 0.2);
  }

  calculateJitterScore(jitter) {
    const thresholds = config.analysis.jitter;
    if (jitter <= thresholds.excellent) return 100;
    if (jitter <= thresholds.good) return 80 + ((thresholds.good - jitter) / (thresholds.good - thresholds.excellent)) * 20;
    if (jitter <= thresholds.fair) return 60 + ((thresholds.fair - jitter) / (thresholds.fair - thresholds.good)) * 20;
    if (jitter <= thresholds.poor) return 40 + ((thresholds.poor - jitter) / (thresholds.poor - thresholds.fair)) * 20;
    return Math.max(0, 40 - (jitter - thresholds.poor) * 0.5);
  }

  calculateChannelQualityScore(channel) {
    if (!channel || channel.snr === undefined) return 0;
    const snrScore = this.calculateSnrScore(channel.snr);
    const plScore = this.calculatePacketLossScore(channel.packetLossRate || 0);
    return Math.round((snrScore + plScore) / 2);
  }

  getSignalQualityLevel(snr) {
    const thresholds = config.analysis.snr;
    if (snr >= thresholds.excellent) return 'excellent';
    if (snr >= thresholds.good) return 'good';
    if (snr >= thresholds.fair) return 'fair';
    return 'poor';
  }

  getPacketLossQuality(pl) {
    const thresholds = config.analysis.packetLoss;
    if (pl <= thresholds.excellent) return 'excellent';
    if (pl <= thresholds.good) return 'good';
    if (pl <= thresholds.fair) return 'fair';
    return 'poor';
  }

  getLatencyQuality(latency) {
    const thresholds = config.analysis.latency;
    if (latency <= thresholds.excellent) return 'excellent';
    if (latency <= thresholds.good) return 'good';
    if (latency <= thresholds.fair) return 'fair';
    return 'poor';
  }

  getJitterQuality(jitter) {
    const thresholds = config.analysis.jitter;
    if (jitter <= thresholds.excellent) return 'excellent';
    if (jitter <= thresholds.good) return 'good';
    if (jitter <= thresholds.fair) return 'fair';
    return 'poor';
  }

  detectTrend(channel) {
    const history = channel.history;
    if (!history || history.length < 10) return 'stable';

    const recent = history.slice(-10);
    const snrValues = recent.map(h => h.snr);
    
    const firstAvg = snrValues.slice(0, 5).reduce((a, b) => a + b, 0) / 5;
    const lastAvg = snrValues.slice(5).reduce((a, b) => a + b, 0) / 5;
    const diff = lastAvg - firstAvg;

    if (diff > 3) return 'improving';
    if (diff < -3) return 'degrading';
    return 'stable';
  }

  detectAnomalies(channel, analysis) {
    const anomalies = [];
    const now = Date.now();

    if (channel.snr < config.analysis.snr.poor) {
      anomalies.push({
        type: 'SNR_CRITICAL',
        severity: 'critical',
        message: `信噪比低于临界值: ${channel.snr.toFixed(1)}dB`,
        value: channel.snr,
        threshold: config.analysis.snr.poor,
        timestamp: now
      });
    } else if (channel.snr < config.analysis.snr.fair) {
      anomalies.push({
        type: 'SNR_LOW',
        severity: 'warning',
        message: `信噪比较低: ${channel.snr.toFixed(1)}dB`,
        value: channel.snr,
        threshold: config.analysis.snr.fair,
        timestamp: now
      });
    }

    if (channel.packetLossRate > config.analysis.packetLoss.poor) {
      anomalies.push({
        type: 'PACKET_LOSS_CRITICAL',
        severity: 'critical',
        message: `丢包率超过临界值: ${channel.packetLossRate.toFixed(2)}%`,
        value: channel.packetLossRate,
        threshold: config.analysis.packetLoss.poor,
        timestamp: now
      });
    } else if (channel.packetLossRate > config.analysis.packetLoss.fair) {
      anomalies.push({
        type: 'PACKET_LOSS_HIGH',
        severity: 'warning',
        message: `丢包率较高: ${channel.packetLossRate.toFixed(2)}%`,
        value: channel.packetLossRate,
        threshold: config.analysis.packetLoss.fair,
        timestamp: now
      });
    }

    if (channel.consecutiveLostPackets >= config.signaling.maxLostPackets) {
      anomalies.push({
        type: 'CONSECUTIVE_PACKET_LOSS',
        severity: 'critical',
        message: `连续丢失 ${channel.consecutiveLostPackets} 个数据包`,
        value: channel.consecutiveLostPackets,
        threshold: config.signaling.maxLostPackets,
        timestamp: now
      });
    }

    if (channel.latency > config.analysis.latency.poor) {
      anomalies.push({
        type: 'LATENCY_HIGH',
        severity: 'warning',
        message: `延迟较高: ${channel.latency.toFixed(0)}ms`,
        value: channel.latency,
        threshold: config.analysis.latency.poor,
        timestamp: now
      });
    }

    if (channel.jitter > config.analysis.jitter.poor) {
      anomalies.push({
        type: 'JITTER_HIGH',
        severity: 'warning',
        message: `抖动较高: ${channel.jitter.toFixed(0)}ms`,
        value: channel.jitter,
        threshold: config.analysis.jitter.poor,
        timestamp: now
      });
    }

    if (analysis.trend === 'degrading') {
      anomalies.push({
        type: 'QUALITY_DEGRADING',
        severity: 'warning',
        message: '信道质量正在下降',
        value: analysis.trend,
        timestamp: now
      });
    }

    if (channel.anomalies && channel.anomalies.length > 0) {
      const recentAnomaly = channel.anomalies[channel.anomalies.length - 1];
      if (now - recentAnomaly.timestamp < 5000) {
        anomalies.push({
          type: recentAnomaly.type,
          severity: 'warning',
          message: `检测到SNR骤降: ${recentAnomaly.previousValue?.toFixed(1) || 'N/A'} -> ${recentAnomaly.value?.toFixed(1) || 'N/A'}dB`,
          value: recentAnomaly.value,
          previousValue: recentAnomaly.previousValue,
          timestamp: now
        });
      }
    }

    const lastUpdateAge = now - (channel.lastUpdate || 0);
    if (lastUpdateAge > 5000 && channel.status === 'active') {
      anomalies.push({
        type: 'DATA_INTERRUPTION',
        severity: 'critical',
        message: `信道数据中断: ${(lastUpdateAge / 1000).toFixed(1)}秒无更新`,
        value: lastUpdateAge,
        threshold: 5000,
        timestamp: now
      });
    }

    return anomalies;
  }

  createAlert(channel, analysis) {
    const hasCritical = analysis.anomalies.some(a => a.severity === 'critical');
    
    const alert = {
      id: Date.now() + '-' + Math.random().toString(36).substr(2, 9),
      timestamp: Date.now(),
      channelId: channel.id,
      protocol: channel.protocol,
      frequencyBand: channel.frequencyBand,
      severity: hasCritical ? 'critical' : 'warning',
      title: `${channel.id} 信道${hasCritical ? '严重' : ''}异常`,
      description: analysis.anomalies.map(a => a.message).join('; '),
      anomalies: analysis.anomalies,
      qualityScore: analysis.qualityScore,
      snr: channel.snr,
      packetLossRate: channel.packetLossRate,
      consecutiveLostPackets: channel.consecutiveLostPackets,
      acknowledged: false,
      resolved: false,
      source: 'analysisEngine'
    };

    this.alerts.unshift(alert);
    this.trimAlerts();

    logger.warn(`Alert created: ${alert.title} - ${alert.description}`);
    this.emit('alertCreated', alert);
  }

  trimAlerts() {
    if (this.alerts.length > this.maxAlerts) {
      this.alerts = this.alerts.slice(0, this.maxAlerts);
    }
  }

  generateRecommendations(analysisResult) {
    const recommendations = [];
    const poorChannels = analysisResult.channelAnalysis.filter(c => c.overallQuality === 'poor');
    const fairChannels = analysisResult.channelAnalysis.filter(c => c.overallQuality === 'fair');

    if (poorChannels.length > 0) {
      recommendations.push({
        priority: 'high',
        type: 'CHANNEL_SWITCH',
        message: `建议切换 ${poorChannels.length} 个质量较差的信道`,
        channels: poorChannels.map(c => c.channelId)
      });
    }

    if (fairChannels.length > 3) {
      recommendations.push({
        priority: 'medium',
        type: 'QUALITY_MONITOR',
        message: `${fairChannels.length} 个信道质量一般，建议持续监控`,
        channels: fairChannels.map(c => c.channelId)
      });
    }

    if (analysisResult.overallScore < 60) {
      recommendations.push({
        priority: 'high',
        type: 'SYSTEM_REVIEW',
        message: '整体通信质量偏低，建议检查基站覆盖和干扰情况'
      });
    }

    const degrading = analysisResult.channelAnalysis.filter(c => c.trend === 'degrading');
    if (degrading.length > 0) {
      recommendations.push({
        priority: 'medium',
        type: 'TREND_WARNING',
        message: `${degrading.length} 个信道质量呈下降趋势`,
        channels: degrading.map(c => c.channelId)
      });
    }

    const highLoss = analysisResult.channelAnalysis.filter(c => c.consecutiveLostPackets >= 3);
    if (highLoss.length > 0) {
      recommendations.push({
        priority: 'high',
        type: 'PACKET_RECOVERY',
        message: `${highLoss.length} 个信道存在连续丢包，建议启动数据恢复`,
        channels: highLoss.map(c => c.channelId)
      });
    }

    if (analysisResult.degradedChannelCount > 5) {
      recommendations.push({
        priority: 'critical',
        type: 'MASS_DEGRADATION',
        message: `大量信道质量下降(${analysisResult.degradedChannelCount}个)，可能存在系统性问题`,
        immediateAction: true
      });
    }

    return recommendations;
  }

  async getRecentAnalysis(limit = 100) {
    return this.analysisHistory.slice(-limit);
  }

  async getAlerts(limit = 50) {
    return this.alerts.slice(0, limit);
  }

  async acknowledgeAlert(alertId, operator) {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
      alert.acknowledgedAt = Date.now();
      alert.acknowledgedBy = operator;
      return alert;
    }
    return null;
  }

  async resolveAlert(alertId, operator, resolution) {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.resolved = true;
      alert.resolvedAt = Date.now();
      alert.resolvedBy = operator;
      alert.resolution = resolution;
      return alert;
    }
    return null;
  }

  getQualitySummary() {
    const summary = {
      total: 0,
      excellent: 0,
      good: 0,
      fair: 0,
      poor: 0,
      activeAlerts: this.alerts.filter(a => !a.resolved).length,
      criticalAlerts: this.alerts.filter(a => a.severity === 'critical' && !a.resolved).length,
      ruleEngineAlerts: this.alerts.filter(a => a.source === 'ruleEngine' && !a.resolved).length
    };

    this.channelQuality.forEach(analysis => {
      summary.total++;
      if (summary[analysis.overallQuality] !== undefined) {
        summary[analysis.overallQuality]++;
      }
    });

    return summary;
  }

  getRuleEngineStats() {
    return ruleEngine.getRuleStatistics();
  }

  getRuleHistory(limit = 100) {
    return ruleEngine.getRuleHistory(limit);
  }

  async stop() {
    this.running = false;

    if (this.analysisInterval) {
      clearInterval(this.analysisInterval);
      this.analysisInterval = null;
    }

    if (this.ruleEvaluationInterval) {
      clearInterval(this.ruleEvaluationInterval);
      this.ruleEvaluationInterval = null;
    }

    logger.info('Analysis service stopped');
  }
}

const analysisService = new AnalysisService();

if (require.main === module) {
  analysisService.start();
}

module.exports = analysisService;
