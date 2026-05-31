import { TerminalData, ValidationResult } from '../types';
import logger from '../utils/logger';

export type PipelineStage = 'validation' | 'enrichment' | 'normalization' | 'filtering';

export interface PipelineContext {
  data: TerminalData;
  warnings: string[];
  errors: string[];
  metadata: Record<string, unknown>;
  startTime: number;
  requestId: string;
}

export interface PipelineHandler {
  name: string;
  stage: PipelineStage;
  priority: number;
  enabled: boolean;
  handle: (context: PipelineContext) => Promise<void> | void;
}

export class DataProcessingPipeline {
  private handlers: Map<PipelineStage, PipelineHandler[]>;
  private enabled: boolean = true;

  constructor() {
    this.handlers = new Map();
    Object.values(['validation', 'enrichment', 'normalization', 'filtering'] as PipelineStage[]).forEach(
      (stage) => {
        this.handlers.set(stage, []);
      }
    );
  }

  public addHandler(handler: PipelineHandler): void {
    const stageHandlers = this.handlers.get(handler.stage) || [];
    stageHandlers.push(handler);
    stageHandlers.sort((a, b) => a.priority - b.priority);
    this.handlers.set(handler.stage, stageHandlers);
    logger.info('Pipeline handler added:', {
      name: handler.name,
      stage: handler.stage,
      priority: handler.priority,
    });
  }

  public removeHandler(handlerName: string): boolean {
    for (const [stage, handlers] of this.handlers.entries()) {
      const index = handlers.findIndex((h) => h.name === handlerName);
      if (index !== -1) {
        handlers.splice(index, 1);
        this.handlers.set(stage, handlers);
        logger.info('Pipeline handler removed:', { name: handlerName });
        return true;
      }
    }
    return false;
  }

  public setHandlerEnabled(handlerName: string, enabled: boolean): boolean {
    for (const handlers of this.handlers.values()) {
      const handler = handlers.find((h) => h.name === handlerName);
      if (handler) {
        handler.enabled = enabled;
        logger.info('Pipeline handler status updated:', {
          name: handlerName,
          enabled,
        });
        return true;
      }
    }
    return false;
  }

  public async process(
    data: TerminalData,
    requestId: string
  ): Promise<{
    success: boolean;
    data: TerminalData;
    warnings: string[];
    errors: string[];
    duration: number;
  }> {
    const context: PipelineContext = {
      data: { ...data },
      warnings: [],
      errors: [],
      metadata: {},
      startTime: Date.now(),
      requestId,
    };

    if (!this.enabled) {
      return {
        success: true,
        data: context.data,
        warnings: [],
        errors: [],
        duration: Date.now() - context.startTime,
      };
    }

    const stages: PipelineStage[] = ['validation', 'enrichment', 'normalization', 'filtering'];

    for (const stage of stages) {
      const handlers = this.handlers.get(stage) || [];
      
      for (const handler of handlers) {
        if (!handler.enabled) continue;

        try {
          await handler.handle(context);
          
          if (context.errors.length > 0) {
            logger.warn('Pipeline processing failed at handler:', {
              handler: handler.name,
              stage,
              errors: context.errors,
              requestId,
            });
            return {
              success: false,
              data: context.data,
              warnings: context.warnings,
              errors: context.errors,
              duration: Date.now() - context.startTime,
            };
          }
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          context.errors.push(`Handler ${handler.name} failed: ${errorMessage}`);
          logger.error('Pipeline handler error:', {
            handler: handler.name,
            stage,
            error: errorMessage,
            requestId,
          });
          return {
            success: false,
            data: context.data,
            warnings: context.warnings,
            errors: context.errors,
            duration: Date.now() - context.startTime,
          };
        }
      }
    }

    return {
      success: true,
      data: context.data,
      warnings: context.warnings,
      errors: context.errors,
      duration: Date.now() - context.startTime,
    };
  }

  public getHandlers(): Array<{
    name: string;
    stage: PipelineStage;
    priority: number;
    enabled: boolean;
  }> {
    const result: Array<{
      name: string;
      stage: PipelineStage;
      priority: number;
      enabled: boolean;
    }> = [];

    for (const [stage, handlers] of this.handlers.entries()) {
      handlers.forEach((h) => {
        result.push({
          name: h.name,
          stage,
          priority: h.priority,
          enabled: h.enabled,
        });
      });
    }

    return result.sort((a, b) => {
      const stageOrder: Record<PipelineStage, number> = {
        validation: 0,
        enrichment: 1,
        normalization: 2,
        filtering: 3,
      };
      return stageOrder[a.stage] - stageOrder[b.stage] || a.priority - b.priority;
    });
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    logger.info('Data processing pipeline:', { enabled });
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public clear(): void {
    this.handlers.clear();
    logger.info('All pipeline handlers cleared');
  }
}

export const dataProcessingPipeline = new DataProcessingPipeline();
