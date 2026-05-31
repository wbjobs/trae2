import { PipelineHandler, PipelineContext } from './data-pipeline.service';
import { dataValidator } from './data-validator.service';
import { TerminalStatus } from '../types';
import logger from '../utils/logger';

export const createSchemaValidationHandler: PipelineHandler = {
  name: 'schema_validation',
  stage: 'validation',
  priority: 10,
  enabled: true,
  handle: (context: PipelineContext): void => {
    const validation = dataValidator.validate(context.data);

    if (!validation.valid) {
      context.warnings.push(...validation.warnings);
    } else {
      context.errors.push(...validation.errors);
    }
  },
};

export const createTerminalRegistrationHandler: PipelineHandler = {
  name: 'terminal_registration',
  stage: 'validation',
  priority: 20,
  enabled: true,
  handle: (context: PipelineContext): void => {
    const isRegistered = dataValidator.isTerminalRegistered(context.data.terminalId);
    if (!isRegistered) {
      context.warnings.push(
        `Terminal ${context.data.terminalId} is not registered, auto-registering`
      );
    }
  },
};

export const createMetricsEnrichmentHandler: PipelineHandler = {
  name: 'metrics_enrichment',
  stage: 'enrichment',
  priority: 10,
  enabled: true,
  handle: (context: PipelineContext): void => {
    const data = context.data;
    const metrics = data.metrics;

    if (metrics.voltage !== undefined && metrics.current !== undefined) {
      metrics.power = metrics.voltage * metrics.current;
    }

    if (metrics.cpuUsage !== undefined && metrics.memoryUsage !== undefined) {
      metrics.systemLoad = (metrics.cpuUsage + metrics.memoryUsage) / 2;
    }

    if (metrics.signalStrength !== undefined) {
      const signalScore =
        metrics.signalStrength >= -70
          ? 100
          : metrics.signalStrength >= -85
          ? 75
          : metrics.signalStrength >= -100
          ? 50
          : 25;
      (metrics as Record<string, number | undefined>).signalQualityScore = signalScore;
    }

    context.metadata.enriched = true;
  },
};

export const createStatusNormalizationHandler: PipelineHandler = {
  name: 'status_normalization',
  stage: 'normalization',
  priority: 10,
  enabled: true,
  handle: (context: PipelineContext): void => {
    const data = context.data;

    if (data.status === 'online' && data.metrics.batteryLevel !== undefined && data.metrics.batteryLevel < 5) {
      data.status = TerminalStatus.FAULT;
      context.warnings.push('Terminal status changed to FAULT due to low battery');
    }

    if (
      data.status === 'online' &&
      data.metrics.signalStrength !== undefined &&
      data.metrics.signalStrength < -110
    ) {
      context.warnings.push('Terminal has very weak signal');
    }

    if (data.metrics.temperature !== undefined && data.metrics.temperature > 70) {
      context.warnings.push('Terminal operating at high temperature');
    }
  },
};

export const createDataFilterHandler: PipelineHandler = {
  name: 'data_filter',
  stage: 'filtering',
  priority: 10,
  enabled: true,
  handle: (context: PipelineContext): void => {
    const data = context.data;
    const metrics = data.metrics;

    for (const [key, value] of Object.entries(metrics)) {
      if (value === null || value === undefined) {
        delete metrics[key as keyof typeof metrics];
      }
    }

    if (Object.keys(metrics).length === 0) {
      context.errors.push('No valid metrics after filtering');
    }
  },
};

export const createLatencyFilterHandler: PipelineHandler = {
  name: 'latency_filter',
  stage: 'filtering',
  priority: 20,
  enabled: true,
  handle: (context: PipelineContext): void => {
    const now = Date.now();
    const dataAge = now - context.data.timestamp;

    if (dataAge > 86400000) {
      context.warnings.push('Data is older than 24 hours');
    }

    context.metadata.dataAge = dataAge;
  },
};

export function registerAllHandlers(pipeline: { addHandler: (handler: PipelineHandler) => void }): void {
  const handlers = [
    createSchemaValidationHandler,
    createTerminalRegistrationHandler,
    createMetricsEnrichmentHandler,
    createStatusNormalizationHandler,
    createDataFilterHandler,
    createLatencyFilterHandler,
  ];

  handlers.forEach((handler) => {
    pipeline.addHandler(handler);
  });

  logger.info('All pipeline handlers registered');
}
