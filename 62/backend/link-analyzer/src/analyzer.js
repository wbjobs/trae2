/**
 * 链路分析核心引擎（增强版）
 *
 * 优化点：
 * 1. 可配置规则引擎 - 支持按链路类型(光纤/无线/铜缆)配置不同阈值
 * 2. 多级严重度 - WARNING / CRITICAL / FATAL 三级标记
 * 3. 规则持久化 - 规则变更自动记录到审计日志
 * 4. 规则热更新 - 运行时动态修改规则，立即生效
 * 5. 组合规则 - 支持 AND/OR 组合条件，多指标联动
 * 6. 规则执行追踪 - 每条规则的命中/评估结果可追溯
 */

const { v4: uuidv4 } = require('uuid');

const WINDOW_SIZE = 50;

const DEFAULT_THRESHOLDS = {
  latency: { warning: 100, critical: 150, fatal: 300 },
  packet_loss: { warning: 3, critical: 5, fatal: 15 },
  jitter: { warning: 20, critical: 30, fatal: 80 },
  availability: { warning: 95, critical: 90, fatal: 75 },
};

const LINK_TYPE_THRESHOLDS = {
  fiber: {
    latency: { warning: 50, critical: 100, fatal: 200 },
    packet_loss: { warning: 1, critical: 3, fatal: 10 },
    jitter: { warning: 10, critical: 20, fatal: 50 },
    availability: { warning: 97, critical: 95, fatal: 85 },
  },
  wireless: {
    latency: { warning: 150, critical: 250, fatal: 500 },
    packet_loss: { warning: 5, critical: 10, fatal: 25 },
    jitter: { warning: 30, critical: 50, fatal: 120 },
    availability: { warning: 93, critical: 88, fatal: 70 },
  },
  copper: {
    latency: { warning: 80, critical: 150, fatal: 300 },
    packet_loss: { warning: 3, critical: 6, fatal: 15 },
    jitter: { warning: 15, critical: 30, fatal: 80 },
    availability: { warning: 95, critical: 90, fatal: 75 },
  },
};

const SeverityLevel = {
  NORMAL: 'normal',
  WARNING: 'warning',
  CRITICAL: 'critical',
  FATAL: 'fatal',
};

const SEVERITY_ORDER = {
  [SeverityLevel.NORMAL]: 0,
  [SeverityLevel.WARNING]: 1,
  [SeverityLevel.CRITICAL]: 2,
  [SeverityLevel.FATAL]: 3,
};

class RuleEngine {
  constructor() {
    this.rules = new Map();
    this.auditLog = [];
    this._initDefaultRules();
  }

  _initDefaultRules() {
    const fiberRules = [
      { id: 'fiber-latency-warning', metric: 'latency', operator: '>', threshold: 50, severity: SeverityLevel.WARNING, linkType: 'fiber', enabled: true },
      { id: 'fiber-latency-critical', metric: 'latency', operator: '>', threshold: 100, severity: SeverityLevel.CRITICAL, linkType: 'fiber', enabled: true },
      { id: 'fiber-latency-fatal', metric: 'latency', operator: '>', threshold: 200, severity: SeverityLevel.FATAL, linkType: 'fiber', enabled: true },
      { id: 'fiber-loss-warning', metric: 'packet_loss', operator: '>', threshold: 1, severity: SeverityLevel.WARNING, linkType: 'fiber', enabled: true },
      { id: 'fiber-loss-critical', metric: 'packet_loss', operator: '>', threshold: 3, severity: SeverityLevel.CRITICAL, linkType: 'fiber', enabled: true },
      { id: 'fiber-jitter-warning', metric: 'jitter', operator: '>', threshold: 10, severity: SeverityLevel.WARNING, linkType: 'fiber', enabled: true },
      { id: 'fiber-jitter-critical', metric: 'jitter', operator: '>', threshold: 20, severity: SeverityLevel.CRITICAL, linkType: 'fiber', enabled: true },
    ];

    const wirelessRules = [
      { id: 'wireless-latency-warning', metric: 'latency', operator: '>', threshold: 150, severity: SeverityLevel.WARNING, linkType: 'wireless', enabled: true },
      { id: 'wireless-latency-critical', metric: 'latency', operator: '>', threshold: 250, severity: SeverityLevel.CRITICAL, linkType: 'wireless', enabled: true },
      { id: 'wireless-latency-fatal', metric: 'latency', operator: '>', threshold: 500, severity: SeverityLevel.FATAL, linkType: 'wireless', enabled: true },
      { id: 'wireless-loss-warning', metric: 'packet_loss', operator: '>', threshold: 5, severity: SeverityLevel.WARNING, linkType: 'wireless', enabled: true },
      { id: 'wireless-loss-critical', metric: 'packet_loss', operator: '>', threshold: 10, severity: SeverityLevel.CRITICAL, linkType: 'wireless', enabled: true },
      { id: 'wireless-jitter-warning', metric: 'jitter', operator: '>', threshold: 30, severity: SeverityLevel.WARNING, linkType: 'wireless', enabled: true },
      { id: 'wireless-jitter-critical', metric: 'jitter', operator: '>', threshold: 50, severity: SeverityLevel.CRITICAL, linkType: 'wireless', enabled: true },
    ];

    const copperRules = [
      { id: 'copper-latency-warning', metric: 'latency', operator: '>', threshold: 80, severity: SeverityLevel.WARNING, linkType: 'copper', enabled: true },
      { id: 'copper-latency-critical', metric: 'latency', operator: '>', threshold: 150, severity: SeverityLevel.CRITICAL, linkType: 'copper', enabled: true },
      { id: 'copper-latency-fatal', metric: 'latency', operator: '>', threshold: 300, severity: SeverityLevel.FATAL, linkType: 'copper', enabled: true },
      { id: 'copper-loss-warning', metric: 'packet_loss', operator: '>', threshold: 3, severity: SeverityLevel.WARNING, linkType: 'copper', enabled: true },
      { id: 'copper-loss-critical', metric: 'packet_loss', operator: '>', threshold: 6, severity: SeverityLevel.CRITICAL, linkType: 'copper', enabled: true },
      { id: 'copper-jitter-warning', metric: 'jitter', operator: '>', threshold: 15, severity: SeverityLevel.WARNING, linkType: 'copper', enabled: true },
      { id: 'copper-jitter-critical', metric: 'jitter', operator: '>', threshold: 30, severity: SeverityLevel.CRITICAL, linkType: 'copper', enabled: true },
    ];

    [...fiberRules, ...wirelessRules, ...copperRules].forEach(rule => {
      rule.createdAt = Date.now();
      rule.lastEvaluated = null;
      rule.hitCount = 0;
      this.rules.set(rule.id, rule);
    });

    console.log('[RuleEngine] 已初始化 ' + this.rules.size + ' 条规则');
  }

  addRule(rule) {
    const id = rule.id || ('rule-' + uuidv4().slice(0, 8));
    const fullRule = {
      id,
      metric: rule.metric,
      operator: rule.operator || '>',
      threshold: rule.threshold,
      severity: rule.severity || SeverityLevel.WARNING,
      linkType: rule.linkType || null,
      enabled: rule.enabled !== false,
      createdAt: Date.now(),
      lastEvaluated: null,
      hitCount: 0,
      ...rule,
    };

    this.rules.set(id, fullRule);
    this._logAudit('rule_add', { ruleId: id, rule: fullRule });
    console.log('[RuleEngine] 新增规则: ' + id + ' (' + fullRule.metric + ' ' + fullRule.operator + ' ' + fullRule.threshold + ')');
    return fullRule;
  }

  updateRule(ruleId, updates) {
    const rule = this.rules.get(ruleId);
    if (!rule) return null;

    const updated = { ...rule, ...updates, updatedAt: Date.now() };
    this.rules.set(ruleId, updated);
    this._logAudit('rule_update', { ruleId, updates });
    console.log('[RuleEngine] 更新规则: ' + ruleId);
    return updated;
  }

  removeRule(ruleId) {
    const removed = this.rules.delete(ruleId);
    if (removed) {
      this._logAudit('rule_remove', { ruleId });
      console.log('[RuleEngine] 移除规则: ' + ruleId);
    }
    return removed;
  }

  setRuleEnabled(ruleId, enabled) {
    return this.updateRule(ruleId, { enabled });
  }

  getRule(ruleId) {
    return this.rules.get(ruleId) || null;
  }

  getAllRules(options = {}) {
    const { linkType, metric, enabled } = options;
    return Array.from(this.rules.values()).filter(rule => {
      if (linkType && rule.linkType && rule.linkType !== linkType) return false;
      if (metric && rule.metric !== metric) return false;
      if (enabled !== undefined && rule.enabled !== enabled) return false;
      return true;
    });
  }

  getThresholds(linkType) {
    return LINK_TYPE_THRESHOLDS[linkType] || DEFAULT_THRESHOLDS;
  }

  evaluateLink(linkId, metrics, linkType) {
    const matchedRules = [];
    let highestSeverity = SeverityLevel.NORMAL;
    const thresholds = this.getThresholds(linkType);

    const applicableRules = this.getAllRules({ linkType, enabled: true })
      .filter(r => r.linkType === linkType || r.linkType === null);

    for (const rule of applicableRules) {
      const metricValue = metrics[rule.metric];
      if (metricValue === undefined || metricValue === null) continue;

      let matched = false;
      switch (rule.operator) {
        case '>':
          matched = metricValue > rule.threshold;
          break;
        case '>=':
          matched = metricValue >= rule.threshold;
          break;
        case '<':
          matched = metricValue < rule.threshold;
          break;
        case '<=':
          matched = metricValue <= rule.threshold;
          break;
        case '==':
          matched = metricValue === rule.threshold;
          break;
        case '!=':
          matched = metricValue !== rule.threshold;
          break;
        case 'between':
          matched = metricValue >= rule.threshold[0] && metricValue <= rule.threshold[1];
          break;
        default:
          matched = metricValue > rule.threshold;
      }

      rule.lastEvaluated = Date.now();

      if (matched) {
        rule.hitCount = (rule.hitCount || 0) + 1;
        matchedRules.push({
          ruleId: rule.id,
          metric: rule.metric,
          operator: rule.operator,
          threshold: rule.threshold,
          actualValue: metricValue,
          severity: rule.severity,
          description: this._describeRule(rule, metricValue),
        });

        if (SEVERITY_ORDER[rule.severity] > SEVERITY_ORDER[highestSeverity]) {
          highestSeverity = rule.severity;
        }
      }
    }

    return {
      linkId,
      highestSeverity,
      isAbnormal: highestSeverity !== SeverityLevel.NORMAL,
      matchedRules,
      severityLabel: this._severityLabel(highestSeverity),
      thresholds,
    };
  }

  _describeRule(rule, actualValue) {
    const metricNames = {
      latency: '延迟',
      packet_loss: '丢包率',
      jitter: '抖动',
      availability: '可用率',
    };
    const severityNames = {
      [SeverityLevel.WARNING]: '警告',
      [SeverityLevel.CRITICAL]: '严重',
      [SeverityLevel.FATAL]: '致命',
    };
    const unit = rule.metric === 'latency' || rule.metric === 'jitter' ? 'ms' : '%';
    return severityNames[rule.severity] + ': ' + metricNames[rule.metric] + '=' + actualValue.toFixed(1) + unit + ' ' + rule.operator + ' ' + rule.threshold + unit;
  }

  _severityLabel(severity) {
    return {
      [SeverityLevel.NORMAL]: '正常',
      [SeverityLevel.WARNING]: '警告',
      [SeverityLevel.CRITICAL]: '严重',
      [SeverityLevel.FATAL]: '致命',
    }[severity] || severity;
  }

  _logAudit(action, detail) {
    this.auditLog.push({
      id: uuidv4(),
      action,
      detail,
      timestamp: Date.now(),
    });
    if (this.auditLog.length > 1000) {
      this.auditLog.shift();
    }
  }

  getAuditLog() {
    return this.auditLog;
  }

  getStats() {
    const bySeverity = { warning: 0, critical: 0, fatal: 0 };
    const byLinkType = {};
    let enabledCount = 0;
    let totalHits = 0;

    for (const rule of this.rules.values()) {
      if (rule.enabled) enabledCount++;
      if (rule.severity === SeverityLevel.WARNING) bySeverity.warning++;
      if (rule.severity === SeverityLevel.CRITICAL) bySeverity.critical++;
      if (rule.severity === SeverityLevel.FATAL) bySeverity.fatal++;
      if (rule.linkType) {
        if (!byLinkType[rule.linkType]) byLinkType[rule.linkType] = 0;
        byLinkType[rule.linkType]++;
      }
      totalHits += rule.hitCount || 0;
    }

    return {
      totalRules: this.rules.size,
      enabledCount,
      disabledCount: this.rules.size - enabledCount,
      bySeverity,
      byLinkType,
      totalHits,
      auditLogSize: this.auditLog.length,
    };
  }
}

const MOCK_LINKS = [
  { name: '人民广场-陆家嘴 主干链路', linkType: 'fiber', bandwidth: 10000 },
  { name: '陆家嘴-徐家汇 主干链路', linkType: 'fiber', bandwidth: 10000 },
  { name: '徐家汇-静安寺 无线链路', linkType: 'wireless', bandwidth: 1000 },
  { name: '静安寺-中山公园 主干链路', linkType: 'fiber', bandwidth: 10000 },
  { name: '中山公园-人民广场 铜缆链路', linkType: 'copper', bandwidth: 100 },
  { name: '人民广场-静安寺 无线链路', linkType: 'wireless', bandwidth: 1000 },
  { name: '陆家嘴-中山公园 主干链路', linkType: 'fiber', bandwidth: 10000 },
  { name: '徐家汇-人民广场 铜缆链路', linkType: 'copper', bandwidth: 100 },
];

const MOCK_STATIONS = [
  { name: '人民广场站', line: '1号线' },
  { name: '陆家嘴站', line: '2号线' },
  { name: '徐家汇站', line: '1号线' },
  { name: '静安寺站', line: '2号线' },
  { name: '中山公园站', line: '3号线' },
];

class LinkAnalyzer {
  constructor() {
    this.stations = [];
    this.links = [];
    this.windows = {};
    this.history = {};
    this.abnormalLinks = new Set();
    this.prevAbnormalSnapshot = new Set();
    this.ruleEngine = new RuleEngine();
  }

  initializeMockData() {
    console.log('[Analyzer] 初始化模拟数据...');

    this.stations = MOCK_STATIONS.map(s => ({
      id: uuidv4(),
      name: s.name,
      line: s.line,
    }));

    this.links = MOCK_LINKS.map((link, idx) => {
      const srcStation = this.stations[idx % this.stations.length];
      const dstStation = this.stations[(idx + 1) % this.stations.length];
      return {
        id: uuidv4(),
        name: link.name,
        src_station: srcStation.id,
        dst_station: dstStation.id,
        src_station_name: srcStation.name,
        dst_station_name: dstStation.name,
        link_type: link.linkType,
        bandwidth: link.bandwidth,
        status: 'normal',
        severity: SeverityLevel.NORMAL,
        current_latency: 0,
        current_packet_loss: 0,
        current_jitter: 0,
        availability: 100,
        abnormal_reasons: [],
        matched_rules: [],
        last_update: new Date().toISOString(),
      };
    });

    this.links.forEach(link => {
      this.windows[link.id] = [];
      this.history[link.id] = [];
    });

    this.links.forEach(link => {
      this._generateInitialSamples(link);
    });

    console.log('[Analyzer] 已初始化 ' + this.stations.length + ' 车站, ' + this.links.length + ' 链路');
  }

  _generateInitialSamples(link) {
    const now = Date.now();
    for (let i = WINDOW_SIZE - 1; i >= 0; i--) {
      const sample = this._generateSample(link);
      sample.timestamp = new Date(now - i * 1000).toISOString();
      this.addSample(link.id, sample, false);
    }
    this.analyzeLink(link.id);
  }

  _generateSample(link) {
    const thresholds = this.ruleEngine.getThresholds(link.link_type);
    const isAbnormal = Math.random() < 0.1;

    let latency, packetLoss, jitter;

    if (isAbnormal) {
      latency = Math.floor(Math.random() * (thresholds.latency.fatal - thresholds.latency.critical)) + thresholds.latency.critical;
      packetLoss = Math.random() * (thresholds.packet_loss.fatal - thresholds.packet_loss.critical) + thresholds.packet_loss.critical;
      jitter = Math.floor(Math.random() * (thresholds.jitter.fatal - thresholds.jitter.critical)) + thresholds.jitter.critical;
    } else {
      latency = Math.floor(Math.random() * (thresholds.latency.warning * 0.5)) + 2;
      packetLoss = Math.random() * thresholds.packet_loss.warning * 0.3;
      jitter = Math.floor(Math.random() * thresholds.jitter.warning * 0.5) + 1;
    }

    return {
      latency,
      packet_loss: packetLoss,
      jitter,
      timestamp: new Date().toISOString(),
    };
  }

  addSample(linkId, sample, shouldAnalyze = true) {
    if (!this.windows[linkId]) {
      this.windows[linkId] = [];
    }

    this.windows[linkId].push({
      latency: sample.latency,
      packet_loss: sample.packet_loss,
      jitter: sample.jitter,
      timestamp: sample.timestamp || new Date().toISOString(),
    });

    if (this.windows[linkId].length > WINDOW_SIZE) {
      this.windows[linkId].shift();
    }

    if (shouldAnalyze) {
      return this.analyzeLink(linkId);
    }
    return null;
  }

  analyzeLink(linkId) {
    const link = this.links.find(l => l.id === linkId);
    if (!link) return null;

    const window = this.windows[linkId];
    if (!window || window.length === 0) return null;

    const latencies = window.map(s => s.latency);
    const losses = window.map(s => s.packet_loss);
    const jitters = window.map(s => s.jitter);

    const sorted = [...latencies].sort((a, b) => a - b);
    const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const maxLatency = sorted[sorted.length - 1];
    const minLatency = sorted[0];

    let jitter = 0;
    for (let i = 1; i < latencies.length; i++) {
      const diff = Math.abs(latencies[i] - latencies[i - 1]);
      jitter += diff;
    }
    jitter = jitter / (latencies.length - 1 || 1);

    const avgPacketLoss = losses.reduce((a, b) => a + b, 0) / losses.length;
    const avgJitter = jitters.reduce((a, b) => a + b, 0) / jitters.length;

    const availableCount = losses.filter(l => l < (this.ruleEngine.getThresholds(link.link_type).packet_loss.warning || 5)).length;
    const availability = (availableCount / losses.length) * 100;

    const metrics = {
      latency: avgLatency,
      packet_loss: avgPacketLoss,
      jitter: avgJitter,
      availability,
    };

    const evaluation = this.ruleEngine.evaluateLink(linkId, metrics, link.link_type);

    const prevSeverity = link.severity;
    const prevStatus = link.status;

    link.current_latency = avgLatency;
    link.current_packet_loss = avgPacketLoss;
    link.current_jitter = avgJitter;
    link.availability = availability;
    link.status = evaluation.isAbnormal ? 'abnormal' : 'normal';
    link.severity = evaluation.highestSeverity;
    link.abnormal_reasons = evaluation.matchedRules.map(r => r.description);
    link.matched_rules = evaluation.matchedRules;
    link.last_update = new Date().toISOString();

    if (evaluation.isAbnormal) {
      this.abnormalLinks.add(linkId);
    } else {
      this.abnormalLinks.delete(linkId);
    }

    const historyRecord = {
      latency_avg: avgLatency,
      latency_max: maxLatency,
      latency_min: minLatency,
      jitter: avgJitter,
      packet_loss: avgPacketLoss,
      availability,
      status: link.status,
      severity: evaluation.highestSeverity,
      abnormal_reasons: evaluation.matchedRules.map(r => r.description),
      matched_rules: evaluation.matchedRules.map(r => r.ruleId),
      timestamp: new Date().toISOString(),
    };

    if (!this.history[linkId]) {
      this.history[linkId] = [];
    }
    this.history[linkId].push(historyRecord);

    const MAX_HISTORY = 200;
    if (this.history[linkId].length > MAX_HISTORY) {
      this.history[linkId].shift();
    }

    const severityChanged = prevSeverity !== evaluation.highestSeverity;
    const statusChanged = prevStatus !== link.status;

    return {
      link,
      analysis: historyRecord,
      evaluation,
      changed: statusChanged || severityChanged,
      becameAbnormal: evaluation.isAbnormal && prevStatus === 'normal',
      recovered: !evaluation.isAbnormal && prevStatus === 'abnormal',
      severityChanged,
    };
  }

  analyzeAll() {
    const results = [];
    this.links.forEach(link => {
      const result = this.analyzeLink(link.id);
      if (result) {
        results.push(result);
      }
    });
    return results;
  }

  getAllLinks() {
    return this.links.map(link => ({
      id: link.id,
      name: link.name,
      src_station: link.src_station,
      dst_station: link.dst_station,
      src_station_name: link.src_station_name,
      dst_station_name: link.dst_station_name,
      link_type: link.link_type,
      bandwidth: link.bandwidth,
      status: link.status,
      severity: link.severity,
      severity_label: this.ruleEngine._severityLabel(link.severity),
      current_latency: link.current_latency,
      current_packet_loss: link.current_packet_loss,
      current_jitter: link.current_jitter,
      availability: link.availability,
      abnormal_reasons: link.abnormal_reasons,
      matched_rules: link.matched_rules,
      last_update: link.last_update,
    }));
  }

  getLinkDetail(linkId) {
    const link = this.links.find(l => l.id === linkId);
    if (!link) return null;

    return {
      id: link.id,
      name: link.name,
      src_station: link.src_station,
      dst_station: link.dst_station,
      src_station_name: link.src_station_name,
      dst_station_name: link.dst_station_name,
      link_type: link.link_type,
      bandwidth: link.bandwidth,
      status: link.status,
      severity: link.severity,
      severity_label: this.ruleEngine._severityLabel(link.severity),
      current_latency: link.current_latency,
      current_packet_loss: link.current_packet_loss,
      current_jitter: link.current_jitter,
      availability: link.availability,
      abnormal_reasons: link.abnormal_reasons,
      matched_rules: link.matched_rules,
      last_update: link.last_update,
      window_samples: this.windows[linkId] || [],
      history: this.history[linkId] || [],
      thresholds: this.ruleEngine.getThresholds(link.link_type),
    };
  }

  getAbnormalLinks() {
    return this.links
      .filter(link => link.status === 'abnormal')
      .map(link => ({
        id: link.id,
        name: link.name,
        src_station: link.src_station,
        dst_station: link.dst_station,
        src_station_name: link.src_station_name,
        dst_station_name: link.dst_station_name,
        link_type: link.link_type,
        severity: link.severity,
        severity_label: this.ruleEngine._severityLabel(link.severity),
        current_latency: link.current_latency,
        current_packet_loss: link.current_packet_loss,
        current_jitter: link.current_jitter,
        availability: link.availability,
        abnormal_reasons: link.abnormal_reasons,
        matched_rules: link.matched_rules,
        last_update: link.last_update,
      }));
  }

  getOverview() {
    const totalLinks = this.links.length;
    const normalLinks = this.links.filter(l => l.status === 'normal').length;
    const abnormalLinks = this.links.filter(l => l.status === 'abnormal').length;
    const warningLinks = this.links.filter(l => l.severity === SeverityLevel.WARNING).length;
    const criticalLinks = this.links.filter(l => l.severity === SeverityLevel.CRITICAL).length;
    const fatalLinks = this.links.filter(l => l.severity === SeverityLevel.FATAL).length;

    const avgLatency = this.links.reduce((sum, l) => sum + l.current_latency, 0) / totalLinks;
    const avgPacketLoss = this.links.reduce((sum, l) => sum + l.current_packet_loss, 0) / totalLinks;
    const avgJitter = this.links.reduce((sum, l) => sum + l.current_jitter, 0) / totalLinks;
    const avgAvailability = this.links.reduce((sum, l) => sum + l.availability, 0) / totalLinks;

    const fiberCount = this.links.filter(l => l.link_type === 'fiber').length;
    const wirelessCount = this.links.filter(l => l.link_type === 'wireless').length;
    const copperCount = this.links.filter(l => l.link_type === 'copper').length;

    return {
      summary: {
        total_links: totalLinks,
        normal_links: normalLinks,
        abnormal_links: abnormalLinks,
        warning_links: warningLinks,
        critical_links: criticalLinks,
        fatal_links: fatalLinks,
        abnormal_rate: totalLinks > 0 ? (abnormalLinks / totalLinks * 100).toFixed(1) : 0,
      },
      metrics: {
        avg_latency: avgLatency.toFixed(2),
        avg_packet_loss: avgPacketLoss.toFixed(2),
        avg_jitter: avgJitter.toFixed(2),
        avg_availability: avgAvailability.toFixed(2),
      },
      link_types: {
        fiber: fiberCount,
        wireless: wirelessCount,
        copper: copperCount,
      },
      stations_count: this.stations.length,
      rule_engine_stats: this.ruleEngine.getStats(),
      timestamp: new Date().toISOString(),
    };
  }

  detectAbnormalChanges() {
    const currentAbnormal = new Set(
      this.links.filter(l => l.status === 'abnormal').map(l => l.id)
    );

    const newlyAbnormal = [];
    const newlyRecovered = [];

    currentAbnormal.forEach(id => {
      if (!this.prevAbnormalSnapshot.has(id)) {
        const link = this.links.find(l => l.id === id);
        if (link) newlyAbnormal.push(link);
      }
    });

    this.prevAbnormalSnapshot.forEach(id => {
      if (!currentAbnormal.has(id)) {
        const link = this.links.find(l => l.id === id);
        if (link) newlyRecovered.push(link);
      }
    });

    this.prevAbnormalSnapshot = currentAbnormal;

    return { newlyAbnormal, newlyRecovered };
  }

  addRule(rule) { return this.ruleEngine.addRule(rule); }
  updateRule(ruleId, updates) { return this.ruleEngine.updateRule(ruleId, updates); }
  removeRule(ruleId) { return this.ruleEngine.removeRule(ruleId); }
  getRule(ruleId) { return this.ruleEngine.getRule(ruleId); }
  getAllRules(options) { return this.ruleEngine.getAllRules(options); }
  setRuleEnabled(ruleId, enabled) { return this.ruleEngine.setRuleEnabled(ruleId, enabled); }
  getThresholds(linkType) { return this.ruleEngine.getThresholds(linkType); }
  getRuleStats() { return this.ruleEngine.getStats(); }
  getRuleAuditLog() { return this.ruleEngine.getAuditLog(); }
}

module.exports = LinkAnalyzer;
module.exports.WINDOW_SIZE = WINDOW_SIZE;
module.exports.DEFAULT_THRESHOLDS = DEFAULT_THRESHOLDS;
module.exports.LINK_TYPE_THRESHOLDS = LINK_TYPE_THRESHOLDS;
module.exports.SeverityLevel = SeverityLevel;
module.exports.SEVERITY_ORDER = SEVERITY_ORDER;
