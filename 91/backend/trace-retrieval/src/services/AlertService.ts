import { WebSocket } from 'ws';
import winston from 'winston';
import {
  AlertRule,
  AlertEvent,
  AlertStats,
  AlertLevel,
  AlertType,
  SignalingMessage,
  AlertCondition
} from '../../../shared/types';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [new winston.transports.Console()]
});

const ALERT_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ALERTS = 10000;
const DEFAULT_RATE_WINDOW_MS = 60000;

interface RateWindow {
  timestamps: number[];
  windowMs: number;
}

export class AlertService {
  private rules: Map<string, AlertRule>;
  private alerts: AlertEvent[];
  private webSocketConnections: Set<WebSocket>;
  private rateWindows: Map<string, RateWindow>;
  private cleanupInterval: NodeJS.Timeout | null;
  private static instance: AlertService;

  private constructor() {
    this.rules = new Map();
    this.alerts = [];
    this.webSocketConnections = new Set();
    this.rateWindows = new Map();
    this.cleanupInterval = null;
    this.startCleanup();
    this.loadDefaultRules();
  }

  public static getInstance(): AlertService {
    if (!AlertService.instance) {
      AlertService.instance = new AlertService();
    }
    return AlertService.instance;
  }

  private loadDefaultRules(): void {
    const defaultRules: AlertRule[] = [
      {
        id: 'default_high_error_rate',
        name: '高错误率告警',
        type: 'rate',
        level: 'error',
        enabled: true,
        conditions: [
          {
            field: 'status',
            operator: 'rate_exceeds',
            value: 10,
            windowMs: 60000
          }
        ],
        actions: [{ type: 'websocket', config: {} }],
        description: '当错误消息速率超过10条/分钟时触发',
        createdAt: Date.now(),
        updatedAt: Date.now()
      },
      {
        id: 'default_large_payload',
        name: '大负载告警',
        type: 'threshold',
        level: 'warning',
        enabled: true,
        conditions: [
          {
            field: 'length',
            operator: 'gt',
            value: 10000
          }
        ],
        actions: [{ type: 'websocket', config: {} }],
        description: '当消息负载超过10KB时触发',
        createdAt: Date.now(),
        updatedAt: Date.now()
      },
      {
        id: 'default_parse_failure',
        name: '解析失败告警',
        type: 'pattern',
        level: 'warning',
        enabled: true,
        conditions: [
          {
            field: 'status',
            operator: 'eq',
            value: 'parse_failed'
          }
        ],
        actions: [{ type: 'websocket', config: {} }],
        description: '当消息解析失败时触发',
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
    ];

    defaultRules.forEach(rule => this.rules.set(rule.id, rule));
    logger.info(`Loaded ${defaultRules.length} default alert rules`);
  }

  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      this.alerts = this.alerts.filter(
        alert => now - alert.timestamp < ALERT_TTL_MS
      );
      if (this.alerts.length > MAX_ALERTS) {
        this.alerts = this.alerts.slice(-MAX_ALERTS);
      }
      this.cleanupRateWindows();
    }, 60000);
  }

  private cleanupRateWindows(): void {
    const now = Date.now();
    this.rateWindows.forEach((window, key) => {
      window.timestamps = window.timestamps.filter(
        ts => now - ts < window.windowMs
      );
      if (window.timestamps.length === 0) {
        this.rateWindows.delete(key);
      }
    });
  }

  public registerConnection(ws: WebSocket): void {
    this.webSocketConnections.add(ws);
    logger.info(`WebSocket connection registered for alerts, total: ${this.webSocketConnections.size}`);
  }

  public unregisterConnection(ws: WebSocket): void {
    this.webSocketConnections.delete(ws);
    logger.info(`WebSocket connection unregistered for alerts, total: ${this.webSocketConnections.size}`);
  }

  public addRule(rule: AlertRule): AlertRule {
    const now = Date.now();
    const newRule: AlertRule = {
      ...rule,
      id: rule.id || `rule_${now}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: now,
      updatedAt: now
    };
    this.rules.set(newRule.id, newRule);
    logger.info(`Added alert rule: ${newRule.id} - ${newRule.name}`);
    return newRule;
  }

  public removeRule(ruleId: string): boolean {
    const result = this.rules.delete(ruleId);
    if (result) {
      logger.info(`Removed alert rule: ${ruleId}`);
    }
    return result;
  }

  public updateRule(ruleId: string, updates: Partial<AlertRule>): AlertRule | null {
    const rule = this.rules.get(ruleId);
    if (!rule) {
      return null;
    }

    const updatedRule: AlertRule = {
      ...rule,
      ...updates,
      id: ruleId,
      updatedAt: Date.now()
    };
    this.rules.set(ruleId, updatedRule);
    logger.info(`Updated alert rule: ${ruleId}`);
    return updatedRule;
  }

  public getRules(): AlertRule[] {
    return Array.from(this.rules.values());
  }

  public getRule(ruleId: string): AlertRule | undefined {
    return this.rules.get(ruleId);
  }

  public checkMessage(message: SignalingMessage): AlertEvent[] {
    const triggeredAlerts: AlertEvent[] = [];

    for (const rule of this.rules.values()) {
      if (!rule.enabled) continue;

      let allConditionsMet = true;
      const matchingDetails: Record<string, any> = {};

      for (const condition of rule.conditions) {
        const result = this.checkCondition(message, condition, rule.id);
        if (!result.met) {
          allConditionsMet = false;
          break;
        }
        Object.assign(matchingDetails, result.details);
      }

      if (allConditionsMet) {
        const alert = this.createAlertEvent(rule, message, matchingDetails);
        triggeredAlerts.push(alert);
        this.alerts.push(alert);
        this.executeActions(alert, rule);
      }
    }

    return triggeredAlerts;
  }

  private checkCondition(
    message: SignalingMessage,
    condition: AlertCondition,
    ruleId: string
  ): { met: boolean; details: Record<string, any> } {
    const fieldValue = this.getNestedField(message, condition.field);
    const details: Record<string, any> = {
      field: condition.field,
      fieldValue,
      operator: condition.operator,
      expectedValue: condition.value
    };

    if (condition.operator === 'rate_exceeds') {
      return this.checkRateCondition(ruleId, condition);
    }

    if (fieldValue === undefined || fieldValue === null) {
      return { met: false, details };
    }

    let met = false;
    const conditionValue = condition.value;

    switch (condition.operator) {
      case 'gt':
        met = Number(fieldValue) > Number(conditionValue);
        break;
      case 'lt':
        met = Number(fieldValue) < Number(conditionValue);
        break;
      case 'eq':
        met = String(fieldValue) === String(conditionValue);
        break;
      case 'neq':
        met = String(fieldValue) !== String(conditionValue);
        break;
      case 'contains':
        met = String(fieldValue).includes(String(conditionValue));
        break;
      case 'regex':
        try {
          const regex = new RegExp(String(conditionValue));
          met = regex.test(String(fieldValue));
        } catch {
          met = false;
        }
        break;
      default:
        met = false;
    }

    return { met, details };
  }

  private checkRateCondition(
    ruleId: string,
    condition: AlertCondition
  ): { met: boolean; details: Record<string, any> } {
    const windowMs = condition.windowMs || DEFAULT_RATE_WINDOW_MS;
    const key = `${ruleId}_${condition.field}`;
    const now = Date.now();

    let window = this.rateWindows.get(key);
    if (!window) {
      window = { timestamps: [], windowMs };
      this.rateWindows.set(key, window);
    }

    window.windowMs = windowMs;
    window.timestamps = window.timestamps.filter(ts => now - ts < windowMs);
    window.timestamps.push(now);

    const rate = window.timestamps.length;
    const threshold = Number(condition.value);
    const met = rate > threshold;

    return {
      met,
      details: {
        rate,
        threshold,
        windowMs,
        messageCount: rate
      }
    };
  }

  private getNestedField(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => {
      if (current === null || current === undefined) return undefined;
      return current[key];
    }, obj);
  }

  private createAlertEvent(
    rule: AlertRule,
    message: SignalingMessage,
    details: Record<string, any>
  ): AlertEvent {
    return {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ruleId: rule.id,
      ruleName: rule.name,
      level: rule.level,
      type: rule.type,
      message: this.generateAlertMessage(rule, message, details),
      details: {
        ...details,
        messageId: message.id,
        deviceId: message.device_id,
        deviceName: message.device_name,
        signalingType: message.signaling_type,
        protocol: message.protocol
      },
      timestamp: Date.now(),
      acknowledged: false
    };
  }

  private generateAlertMessage(
    rule: AlertRule,
    message: SignalingMessage,
    details: Record<string, any>
  ): string {
    switch (rule.type) {
      case 'threshold':
        return `阈值告警: ${rule.name} - 设备 ${message.device_name} 的 ${details.field} = ${details.fieldValue} 超过阈值 ${details.expectedValue}`;
      case 'rate':
        return `速率告警: ${rule.name} - 当前速率 ${details.rate} 超过阈值 ${details.threshold} (窗口: ${details.windowMs}ms)`;
      case 'pattern':
        return `模式匹配告警: ${rule.name} - 消息匹配规则条件`;
      case 'anomaly':
        return `异常检测告警: ${rule.name} - 检测到异常行为`;
      default:
        return `告警: ${rule.name} 触发`;
    }
  }

  private executeActions(alert: AlertEvent, rule: AlertRule): void {
    for (const action of rule.actions) {
      switch (action.type) {
        case 'websocket':
          this.broadcastAlert(alert);
          break;
        case 'webhook':
          this.executeWebhook(action.config, alert);
          break;
        case 'email':
          logger.info(`Email alert would be sent: ${alert.message}`, action.config);
          break;
        case 'slack':
          logger.info(`Slack alert would be sent: ${alert.message}`, action.config);
          break;
      }
    }
  }

  private executeWebhook(config: Record<string, any>, alert: AlertEvent): void {
    const url = config.url;
    if (!url) {
      logger.error('Webhook URL not configured');
      return;
    }

    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alert, config })
    }).catch(error => {
      logger.error('Webhook execution failed:', error);
    });
  }

  public broadcastAlert(alert: AlertEvent): void {
    const message = JSON.stringify({
      type: 'alert',
      data: alert,
      timestamp: new Date().toISOString()
    });

    this.webSocketConnections.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    });

    logger.info(`Broadcasted alert: ${alert.id} - ${alert.message}`);
  }

  public acknowledgeAlert(alertId: string, userId?: string): AlertEvent | null {
    const alert = this.alerts.find(a => a.id === alertId);
    if (!alert) {
      return null;
    }

    alert.acknowledged = true;
    alert.acknowledgedBy = userId;
    alert.acknowledgedAt = Date.now();

    logger.info(`Alert ${alertId} acknowledged by ${userId || 'unknown'}`);
    return alert;
  }

  public getAlerts(limit?: number, level?: AlertLevel): AlertEvent[] {
    let filtered = [...this.alerts];

    if (level) {
      filtered = filtered.filter(a => a.level === level);
    }

    filtered.sort((a, b) => b.timestamp - a.timestamp);

    if (limit) {
      filtered = filtered.slice(0, limit);
    }

    return filtered;
  }

  public getStats(): AlertStats {
    const byLevel: Record<AlertLevel, number> = {
      info: 0,
      warning: 0,
      error: 0,
      critical: 0
    };

    const byType: Record<AlertType, number> = {
      anomaly: 0,
      threshold: 0,
      pattern: 0,
      rate: 0,
      custom: 0
    };

    let acknowledgedAlerts = 0;
    let lastAlertAt: number | null = null;

    for (const alert of this.alerts) {
      byLevel[alert.level]++;
      byType[alert.type]++;
      if (alert.acknowledged) acknowledgedAlerts++;
      if (!lastAlertAt || alert.timestamp > lastAlertAt) {
        lastAlertAt = alert.timestamp;
      }
    }

    return {
      totalAlerts: this.alerts.length,
      byLevel,
      byType,
      activeAlerts: this.alerts.filter(a => !a.acknowledged).length,
      acknowledgedAlerts,
      lastAlertAt
    };
  }

  public checkRateMetrics(metrics: any): AlertEvent[] {
    const triggeredAlerts: AlertEvent[] = [];
    logger.debug('Checking rate metrics:', metrics);
    return triggeredAlerts;
  }

  public close(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.webSocketConnections.clear();
    logger.info('AlertService closed');
  }
}

export default AlertService;
