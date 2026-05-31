import Joi from 'joi';
import { TerminalData, ValidationResult, TerminalStatus } from '../types';
import logger from '../utils/logger';

const terminalDataSchema = Joi.object({
  terminalId: Joi.string().required().min(1).max(100),
  timestamp: Joi.number().required().integer().min(946656000000).max(Date.now() + 86400000),
  location: Joi.object({
    latitude: Joi.number().required().min(-90).max(90),
    longitude: Joi.number().required().min(-180).max(180),
  }).required(),
  status: Joi.string()
    .required()
    .valid(...Object.values(TerminalStatus)),
  metrics: Joi.object()
    .pattern(
      Joi.string(),
      Joi.number().optional().allow(null)
    )
    .required(),
  alarms: Joi.array().items(Joi.string()).optional(),
  rawData: Joi.object().optional(),
});

const registeredTerminals = new Set<string>([
  'PWR-INS-001',
  'PWR-INS-002',
  'PWR-INS-003',
  'PWR-INS-004',
  'PWR-INS-005',
]);

export class DataValidatorService {
  public validate(data: TerminalData): ValidationResult {
    const result: ValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
    };

    const { error, warning } = terminalDataSchema.validate(data, {
      abortEarly: false,
      allowUnknown: true,
    });

    if (error) {
      result.valid = false;
      result.errors = error.details.map((d) => d.message);
      logger.warn('Data validation schema errors:', {
        terminalId: data.terminalId,
        errors: result.errors,
      });
      return result;
    }

    if (warning) {
      result.warnings.push(...warning.details.map((d) => d.message));
    }

    if (!this.validateTerminalRegistration(data.terminalId)) {
      result.warnings.push(`Terminal ${data.terminalId} is not registered`);
    }

    if (!this.validateTimestamp(data.timestamp)) {
      result.warnings.push('Timestamp is older than 24 hours');
    }

    this.validateMetricsRange(data, result);
    this.validateDataConsistency(data, result);

    return result;
  }

  private validateTerminalRegistration(terminalId: string): boolean {
    return registeredTerminals.has(terminalId);
  }

  private validateTimestamp(timestamp: number): boolean {
    const twentyFourHoursAgo = Date.now() - 86400000;
    return timestamp >= twentyFourHoursAgo;
  }

  private validateMetricsRange(data: TerminalData, result: ValidationResult): void {
    const metricRanges: Record<string, { min: number; max: number }> = {
      voltage: { min: 0, max: 500 },
      current: { min: 0, max: 100 },
      temperature: { min: -40, max: 85 },
      humidity: { min: 0, max: 100 },
      pressure: { min: 800, max: 1200 },
      vibration: { min: 0, max: 100 },
      signalStrength: { min: -120, max: 0 },
      batteryLevel: { min: 0, max: 100 },
      cpuUsage: { min: 0, max: 100 },
      memoryUsage: { min: 0, max: 100 },
      diskUsage: { min: 0, max: 100 },
      networkLatency: { min: 0, max: 10000 },
      packetLoss: { min: 0, max: 100 },
    };

    for (const [metric, value] of Object.entries(data.metrics)) {
      if (value === undefined || value === null) continue;
      
      const range = metricRanges[metric];
      if (range) {
        if (value < range.min || value > range.max) {
          result.warnings.push(
            `Metric ${metric} value ${value} is outside normal range [${range.min}, ${range.max}]`
          );
        }
      }
    }
  }

  private validateDataConsistency(data: TerminalData, result: ValidationResult): void {
    if (data.status === TerminalStatus.FAULT && !data.alarms?.length) {
      result.warnings.push('Terminal status is FAULT but no alarms reported');
    }

    if (data.metrics.batteryLevel !== undefined && data.metrics.batteryLevel < 10) {
      result.warnings.push('Battery level is critically low');
    }

    if (data.metrics.signalStrength !== undefined && data.metrics.signalStrength < -110) {
      result.warnings.push('Signal strength is very weak');
    }
  }

  public registerTerminal(terminalId: string): void {
    registeredTerminals.add(terminalId);
    logger.info('Terminal registered:', { terminalId });
  }

  public unregisterTerminal(terminalId: string): boolean {
    const removed = registeredTerminals.delete(terminalId);
    if (removed) {
      logger.info('Terminal unregistered:', { terminalId });
    }
    return removed;
  }

  public isTerminalRegistered(terminalId: string): boolean {
    return registeredTerminals.has(terminalId);
  }
}

export const dataValidator = new DataValidatorService();
