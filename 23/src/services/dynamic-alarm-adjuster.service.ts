import { AlarmLevel, ThresholdRule, TerminalData } from '../types';
import logger from '../utils/logger';

export interface AdjustmentFactor {
  name: string;
  weight: number;
  calculate: (data: TerminalData, context?: AdjustmentContext) => number;
}

export interface AdjustmentContext {
  consecutiveViolations: number;
  historicalTrend: 'increasing' | 'decreasing' | 'stable';
  offlineDuration?: number;
  peakHours?: boolean;
  maintenanceMode?: boolean;
}

export interface DynamicAdjustmentResult {
  originalLevel: AlarmLevel;
  adjustedLevel: AlarmLevel;
  adjusted: boolean;
  reasons: string[];
  factors: Array<{ name: string; score: number; weight: number }>;
}

const levelOrder: AlarmLevel[] = [
  AlarmLevel.INFO,
  AlarmLevel.WARNING,
  AlarmLevel.CRITICAL,
  AlarmLevel.FATAL,
];

export class DynamicAlarmAdjuster {
  private adjustmentFactors: Map<string, AdjustmentFactor>;
  private adjustmentCache: Map<string, { result: DynamicAdjustmentResult; timestamp: number }>;
  private cacheTtl: number = 30000;
  private enabled: boolean = true;

  constructor() {
    this.adjustmentFactors = new Map();
    this.adjustmentCache = new Map();
    this.initializeDefaultFactors();
  }

  private initializeDefaultFactors(): void {
    this.registerFactor({
      name: 'consecutive_violations',
      weight: 0.3,
      calculate: (_data, context) => {
        if (!context) return 0;
        if (context.consecutiveViolations >= 5) return 1;
        if (context.consecutiveViolations >= 3) return 0.5;
        return 0;
      },
    });

    this.registerFactor({
      name: 'critical_metric',
      weight: 0.3,
      calculate: (data) => {
        const criticalMetrics = ['voltage', 'current', 'temperature'];
        const violatedCriticalMetrics = criticalMetrics.filter((m) => {
          const value = data.metrics[m];
          if (value === undefined) return false;
          if (m === 'voltage' && (value < 198 || value > 253)) return true;
          if (m === 'current' && value > 50) return true;
          if (m === 'temperature' && value > 70) return true;
          return false;
        });
        return violatedCriticalMetrics.length / criticalMetrics.length;
      },
    });

    this.registerFactor({
      name: 'trend_worsening',
      weight: 0.2,
      calculate: (_data, context) => {
        if (!context) return 0;
        return context.historicalTrend === 'increasing' ? 1 : 0;
      },
    });

    this.registerFactor({
      name: 'peak_hours',
      weight: 0.1,
      calculate: (_data, context) => {
        return context?.peakHours ? 0.8 : 0;
      },
    });

    this.registerFactor({
      name: 'multiple_alarms',
      weight: 0.1,
      calculate: (data) => {
        if (data.alarms && data.alarms.length > 0) {
          return Math.min(data.alarms.length / 5, 1);
        }
        return 0;
      },
    });
  }

  public registerFactor(factor: AdjustmentFactor): void {
    this.adjustmentFactors.set(factor.name, factor);
    logger.info('Adjustment factor registered:', { name: factor.name });
  }

  public unregisterFactor(factorName: string): boolean {
    return this.adjustmentFactors.delete(factorName);
  }

  public adjustAlarmLevel(
    originalRule: ThresholdRule,
    data: TerminalData,
    context: Partial<AdjustmentContext> = {}
  ): DynamicAdjustmentResult {
    if (!this.enabled) {
      return {
        originalLevel: originalRule.alarmLevel,
        adjustedLevel: originalRule.alarmLevel,
        adjusted: false,
        reasons: ['Dynamic adjustment disabled'],
        factors: [],
      };
    }

    const cacheKey = `${data.terminalId}:${originalRule.id}:${Date.now() - (Date.now() % this.cacheTtl)}`;
    const cached = this.adjustmentCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTtl) {
      return cached.result;
    }

    const fullContext: AdjustmentContext = {
      consecutiveViolations: context.consecutiveViolations || 0,
      historicalTrend: context.historicalTrend || 'stable',
      offlineDuration: context.offlineDuration,
      peakHours: context.peakHours ?? this.isPeakHours(),
      maintenanceMode: context.maintenanceMode ?? false,
    };

    const scores: Array<{ name: string; score: number; weight: number }> = [];
    let totalScore = 0;

    for (const [name, factor] of this.adjustmentFactors) {
      try {
        const score = factor.calculate(data, fullContext);
        const weightedScore = score * factor.weight;
        scores.push({ name, score: weightedScore, weight: factor.weight });
        totalScore += weightedScore;
      } catch (err) {
        logger.warn('Error calculating adjustment factor:', {
          factor: name,
          error: err,
        });
      }
    }

    const reasons: string[] = [];
    let levelAdjustment = 0;

    if (totalScore >= 0.8) {
      levelAdjustment = 2;
      reasons.push('Critical conditions detected: multiple high-risk factors');
    } else if (totalScore >= 0.5) {
      levelAdjustment = 1;
      reasons.push('Elevated risk: several warning factors present');
    } else if (totalScore <= 0.1) {
      levelAdjustment = -1;
      reasons.push('Low risk conditions: minimal warning factors');
    }

    const originalIndex = levelOrder.indexOf(originalRule.alarmLevel);
    const adjustedIndex = Math.max(
      0,
      Math.min(levelOrder.length - 1, originalIndex + levelAdjustment)
    );
    const adjustedLevel = levelOrder[adjustedIndex];
    const adjusted = adjustedIndex !== originalIndex;

    const result: DynamicAdjustmentResult = {
      originalLevel: originalRule.alarmLevel,
      adjustedLevel,
      adjusted,
      reasons,
      factors: scores,
    };

    this.adjustmentCache.set(cacheKey, {
      result,
      timestamp: Date.now(),
    });

    if (adjusted) {
      logger.debug('Alarm level dynamically adjusted:', {
        terminalId: data.terminalId,
        ruleId: originalRule.id,
        original: originalRule.alarmLevel,
        adjusted: adjustedLevel,
        totalScore,
      });
    }

    return result;
  }

  private isPeakHours(): boolean {
    const hour = new Date().getHours();
    return (hour >= 8 && hour <= 11) || (hour >= 14 && hour <= 17);
  }

  public clearCache(): void {
    this.adjustmentCache.clear();
    logger.info('Dynamic adjustment cache cleared');
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    logger.info('Dynamic alarm adjustment:', { enabled });
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public getFactors(): string[] {
    return Array.from(this.adjustmentFactors.keys());
  }

  public getStats(): {
    enabled: boolean;
    factorCount: number;
    cacheSize: number;
    cacheTtl: number;
  } {
    return {
      enabled: this.enabled,
      factorCount: this.adjustmentFactors.size,
      cacheSize: this.adjustmentCache.size,
      cacheTtl: this.cacheTtl,
    };
  }
}

export const dynamicAlarmAdjuster = new DynamicAlarmAdjuster();
