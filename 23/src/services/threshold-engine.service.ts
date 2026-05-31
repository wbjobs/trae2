import { TerminalData, ThresholdRule, AlarmEvent, AlarmLevel } from '../types';
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger';
import { dynamicAlarmAdjuster, DynamicAdjustmentResult } from './dynamic-alarm-adjuster.service';

const defaultThresholdRules: ThresholdRule[] = [
  {
    id: 'rule-voltage-high',
    metricName: 'voltage',
    maxValue: 253,
    alarmLevel: AlarmLevel.WARNING,
    enabled: true,
    description: '电压过高警告阈值',
    consecutiveCount: 3,
    cooldownPeriod: 300000,
  },
  {
    id: 'rule-voltage-critical',
    metricName: 'voltage',
    maxValue: 264,
    alarmLevel: AlarmLevel.CRITICAL,
    enabled: true,
    description: '电压过高严重阈值',
    consecutiveCount: 2,
    cooldownPeriod: 180000,
  },
  {
    id: 'rule-voltage-low',
    metricName: 'voltage',
    minValue: 198,
    alarmLevel: AlarmLevel.WARNING,
    enabled: true,
    description: '电压过低警告阈值',
    consecutiveCount: 3,
    cooldownPeriod: 300000,
  },
  {
    id: 'rule-temperature-high',
    metricName: 'temperature',
    maxValue: 60,
    alarmLevel: AlarmLevel.WARNING,
    enabled: true,
    description: '温度过高警告阈值',
    consecutiveCount: 2,
    cooldownPeriod: 300000,
  },
  {
    id: 'rule-temperature-critical',
    metricName: 'temperature',
    maxValue: 75,
    alarmLevel: AlarmLevel.CRITICAL,
    enabled: true,
    description: '温度过高严重阈值',
    consecutiveCount: 1,
    cooldownPeriod: 120000,
  },
  {
    id: 'rule-battery-low',
    metricName: 'batteryLevel',
    minValue: 20,
    alarmLevel: AlarmLevel.WARNING,
    enabled: true,
    description: '电池电量低警告',
    consecutiveCount: 1,
    cooldownPeriod: 600000,
  },
  {
    id: 'rule-battery-critical',
    metricName: 'batteryLevel',
    minValue: 10,
    alarmLevel: AlarmLevel.CRITICAL,
    enabled: true,
    description: '电池电量严重不足',
    consecutiveCount: 1,
    cooldownPeriod: 300000,
  },
  {
    id: 'rule-signal-weak',
    metricName: 'signalStrength',
    minValue: -100,
    alarmLevel: AlarmLevel.WARNING,
    enabled: true,
    description: '信号强度弱',
    consecutiveCount: 3,
    cooldownPeriod: 600000,
  },
  {
    id: 'rule-cpu-high',
    metricName: 'cpuUsage',
    maxValue: 85,
    alarmLevel: AlarmLevel.WARNING,
    enabled: true,
    description: 'CPU使用率过高',
    consecutiveCount: 3,
    cooldownPeriod: 300000,
  },
  {
    id: 'rule-memory-high',
    metricName: 'memoryUsage',
    maxValue: 90,
    alarmLevel: AlarmLevel.WARNING,
    enabled: true,
    description: '内存使用率过高',
    consecutiveCount: 3,
    cooldownPeriod: 300000,
  },
  {
    id: 'rule-disk-high',
    metricName: 'diskUsage',
    maxValue: 95,
    alarmLevel: AlarmLevel.CRITICAL,
    enabled: true,
    description: '磁盘使用率过高',
    consecutiveCount: 1,
    cooldownPeriod: 3600000,
  },
  {
    id: 'rule-packet-loss',
    metricName: 'packetLoss',
    maxValue: 10,
    alarmLevel: AlarmLevel.WARNING,
    enabled: true,
    description: '网络丢包率过高',
    consecutiveCount: 2,
    cooldownPeriod: 300000,
  },
];

interface ConsecutiveCounter {
  count: number;
  lastTriggered: number;
  lastValue: number;
  history: number[];
}

export interface EvaluateResult {
  alarms: AlarmEvent[];
  adjustments: Array<{
    ruleId: string;
    originalLevel: AlarmLevel;
    adjustedLevel: AlarmLevel;
    reasons: string[];
  }>;
}

export class ThresholdEngineService {
  private rules: Map<string, ThresholdRule>;
  private consecutiveCounters: Map<string, ConsecutiveCounter>;
  private lastAlarmTimestamps: Map<string, number>;
  private dynamicAdjustmentEnabled: boolean = true;

  constructor() {
    this.rules = new Map();
    this.consecutiveCounters = new Map();
    this.lastAlarmTimestamps = new Map();
    defaultThresholdRules.forEach((rule) => this.rules.set(rule.id, rule));
  }

  public evaluate(data: TerminalData): EvaluateResult {
    const alarms: AlarmEvent[] = [];
    const adjustments: EvaluateResult['adjustments'] = [];
    const now = Date.now();

    for (const [metricName, value] of Object.entries(data.metrics)) {
      if (value === undefined || value === null) continue;

      const applicableRules = this.getApplicableRules(metricName, data.terminalId);

      for (const rule of applicableRules) {
        if (!rule.enabled) continue;

        const isViolation = this.checkThresholdViolation(value, rule);
        const counterKey = `${data.terminalId}:${rule.id}`;

        if (isViolation) {
          const counter = this.updateCounter(counterKey, value, now);

          if (counter.count >= rule.consecutiveCount) {
            const lastAlarmKey = `${data.terminalId}:${rule.id}:lastAlarm`;
            const lastAlarmTime = this.lastAlarmTimestamps.get(lastAlarmKey) || 0;

            if (now - lastAlarmTime >= rule.cooldownPeriod) {
              let adjustedRule = { ...rule };
              let adjustmentResult: DynamicAdjustmentResult | null = null;

              if (this.dynamicAdjustmentEnabled) {
                adjustmentResult = dynamicAlarmAdjuster.adjustAlarmLevel(
                  rule,
                  data,
                  {
                    consecutiveViolations: counter.count,
                    historicalTrend: this.detectTrend(counter),
                  }
                );

                if (adjustmentResult.adjusted) {
                  adjustedRule = { ...rule, alarmLevel: adjustmentResult.adjustedLevel };
                  adjustments.push({
                    ruleId: rule.id,
                    originalLevel: adjustmentResult.originalLevel,
                    adjustedLevel: adjustmentResult.adjustedLevel,
                    reasons: adjustmentResult.reasons,
                  });
                }
              }

              const alarm = this.createAlarmEvent(
                data,
                metricName,
                value,
                adjustedRule,
                adjustmentResult
              );
              alarms.push(alarm);
              this.lastAlarmTimestamps.set(lastAlarmKey, now);
              this.resetCounter(counterKey);

              logger.info('Threshold violation detected:', {
                terminalId: data.terminalId,
                metricName,
                value,
                ruleId: rule.id,
                originalLevel: rule.alarmLevel,
                adjustedLevel: adjustedRule.alarmLevel,
                dynamicallyAdjusted: adjustmentResult?.adjusted || false,
              });
            }
          }
        } else {
          this.resetCounter(counterKey);
        }
      }
    }

    return { alarms, adjustments };
  }

  private detectTrend(counter: ConsecutiveCounter): 'increasing' | 'decreasing' | 'stable' {
    if (counter.history.length < 3) return 'stable';

    const recent = counter.history.slice(-3);
    const diffs: number[] = [];

    for (let i = 1; i < recent.length; i++) {
      diffs.push(recent[i] - recent[i - 1]);
    }

    const avgDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length;

    if (Math.abs(avgDiff) < 1) return 'stable';
    return avgDiff > 0 ? 'increasing' : 'decreasing';
  }

  private getApplicableRules(metricName: string, terminalId: string): ThresholdRule[] {
    return Array.from(this.rules.values()).filter(
      (rule) =>
        rule.metricName === metricName &&
        (!rule.terminalId || rule.terminalId === terminalId)
    );
  }

  private checkThresholdViolation(value: number, rule: ThresholdRule): boolean {
    if (rule.maxValue !== undefined && value > rule.maxValue) {
      return true;
    }
    if (rule.minValue !== undefined && value < rule.minValue) {
      return true;
    }
    return false;
  }

  private updateCounter(
    counterKey: string,
    value: number,
    timestamp: number
  ): ConsecutiveCounter {
    const existing = this.consecutiveCounters.get(counterKey);
    const history = existing?.history || [];
    history.push(value);
    if (history.length > 10) history.shift();

    const counter: ConsecutiveCounter = {
      count: (existing?.count || 0) + 1,
      lastTriggered: timestamp,
      lastValue: value,
      history,
    };
    this.consecutiveCounters.set(counterKey, counter);
    return counter;
  }

  private resetCounter(counterKey: string): void {
    this.consecutiveCounters.delete(counterKey);
  }

  private createAlarmEvent(
    data: TerminalData,
    metricName: string,
    value: number,
    rule: ThresholdRule,
    adjustment: DynamicAdjustmentResult | null
  ): AlarmEvent {
    const message = this.generateAlarmMessage(metricName, value, rule, adjustment);

    return {
      id: uuidv4(),
      terminalId: data.terminalId,
      metricName,
      metricValue: value,
      thresholdRule: rule,
      timestamp: Date.now(),
      alarmLevel: rule.alarmLevel,
      message,
      acknowledged: false,
      resolved: false,
    };
  }

  private generateAlarmMessage(
    metricName: string,
    value: number,
    rule: ThresholdRule,
    adjustment: DynamicAdjustmentResult | null
  ): string {
    const direction =
      rule.maxValue !== undefined && value > rule.maxValue ? '超过' : '低于';
    const threshold =
      rule.maxValue !== undefined && value > rule.maxValue
        ? rule.maxValue
        : rule.minValue;

    let baseMessage = `指标[${metricName}]当前值${value}${direction}阈值${threshold}，${rule.description}`;

    if (adjustment?.adjusted) {
      baseMessage += ` [告警级别已调整: ${adjustment.originalLevel} → ${adjustment.adjustedLevel}]`;
    }

    return baseMessage;
  }

  public addRule(rule: ThresholdRule): void {
    this.rules.set(rule.id, rule);
    logger.info('Threshold rule added:', { ruleId: rule.id });
  }

  public updateRule(ruleId: string, updates: Partial<ThresholdRule>): ThresholdRule | null {
    const existing = this.rules.get(ruleId);
    if (!existing) return null;

    const updated = { ...existing, ...updates };
    this.rules.set(ruleId, updated);
    logger.info('Threshold rule updated:', { ruleId });
    return updated;
  }

  public deleteRule(ruleId: string): boolean {
    const deleted = this.rules.delete(ruleId);
    if (deleted) {
      logger.info('Threshold rule deleted:', { ruleId });
    }
    return deleted;
  }

  public getRule(ruleId: string): ThresholdRule | undefined {
    return this.rules.get(ruleId);
  }

  public getAllRules(): ThresholdRule[] {
    return Array.from(this.rules.values());
  }

  public getRulesByTerminal(terminalId: string): ThresholdRule[] {
    return Array.from(this.rules.values()).filter(
      (r) => !r.terminalId || r.terminalId === terminalId
    );
  }

  public setDynamicAdjustmentEnabled(enabled: boolean): void {
    this.dynamicAdjustmentEnabled = enabled;
    logger.info('Dynamic alarm level adjustment:', { enabled });
  }

  public isDynamicAdjustmentEnabled(): boolean {
    return this.dynamicAdjustmentEnabled;
  }

  public clearCounters(): void {
    this.consecutiveCounters.clear();
    this.lastAlarmTimestamps.clear();
    logger.info('All threshold counters cleared');
  }

  public getStats(): {
    ruleCount: number;
    activeCounters: number;
    dynamicAdjustmentEnabled: boolean;
  } {
    return {
      ruleCount: this.rules.size,
      activeCounters: this.consecutiveCounters.size,
      dynamicAdjustmentEnabled: this.dynamicAdjustmentEnabled,
    };
  }
}

export const thresholdEngine = new ThresholdEngineService();
