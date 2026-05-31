import { TerminalData } from '../types';
import { terminalDataRecordRepository } from '../database/repositories/TerminalDataRecordRepository';
import { terminalRepository } from '../database/repositories/TerminalRepository';
import { alarmEventRepository } from '../database/repositories/AlarmEventRepository';
import { thresholdEngine } from './threshold-engine.service';
import { messageQueueService } from './message-queue.service';
import logger from '../utils/logger';

interface BatchItem {
  data: TerminalData;
  warnings: string[];
  resolve: (value: BatchResult) => void;
  reject: (reason: unknown) => void;
}

export interface BatchResult {
  success: boolean;
  recordId?: string;
  alarmsGenerated: number;
  warnings: string[];
  errors?: string[];
}

export class BatchProcessingService {
  private batchSize: number;
  private maxBatchDelayMs: number;
  private currentBatch: BatchItem[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private isProcessing: boolean = false;
  private stats = {
    totalProcessed: 0,
    totalBatches: 0,
    totalFailures: 0,
    avgBatchSize: 0,
    avgProcessingTime: 0,
  };

  constructor(batchSize: number = 100, maxBatchDelayMs: number = 500) {
    this.batchSize = batchSize;
    this.maxBatchDelayMs = maxBatchDelayMs;
  }

  public async addToBatch(
    data: TerminalData,
    warnings: string[] = []
  ): Promise<BatchResult> {
    return new Promise((resolve, reject) => {
      this.currentBatch.push({ data, warnings, resolve, reject });

      if (this.currentBatch.length >= this.batchSize) {
        this.flushBatch();
      } else if (!this.flushTimer) {
        this.scheduleFlush();
      }
    });
  }

  private scheduleFlush(): void {
    this.flushTimer = setTimeout(() => {
      this.flushBatch();
    }, this.maxBatchDelayMs);
  }

  private async flushBatch(): Promise<void> {
    if (this.isProcessing || this.currentBatch.length === 0) {
      return;
    }

    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    const batch = this.currentBatch;
    this.currentBatch = [];
    this.isProcessing = true;

    const startTime = Date.now();

    try {
      await this.processBatch(batch);
      this.stats.totalBatches++;
      this.stats.totalProcessed += batch.length;
      this.stats.avgBatchSize =
        (this.stats.avgBatchSize * (this.stats.totalBatches - 1) + batch.length) /
        this.stats.totalBatches;

      const processingTime = Date.now() - startTime;
      this.stats.avgProcessingTime =
        (this.stats.avgProcessingTime * (this.stats.totalBatches - 1) + processingTime) /
        this.stats.totalBatches;

      logger.debug('Batch processed:', {
        size: batch.length,
        duration: `${processingTime}ms`,
        avgBatchSize: this.stats.avgBatchSize.toFixed(2),
      });
    } catch (err) {
      logger.error('Batch processing failed:', err);
      this.stats.totalFailures += batch.length;

      batch.forEach((item) => {
        item.reject(err);
      });
    } finally {
      this.isProcessing = false;

      if (this.currentBatch.length > 0) {
        this.scheduleFlush();
      }
    }
  }

  private async processBatch(batch: BatchItem[]): Promise<void> {
    const results: BatchResult[] = [];

    for (const item of batch) {
      try {
        const result = await this.processSingleItem(item.data, item.warnings);
        results.push(result);
        item.resolve(result);
      } catch (err) {
        results.push({
          success: false,
          alarmsGenerated: 0,
          warnings: item.warnings,
          errors: [err instanceof Error ? err.message : String(err)],
        });
        item.reject(err);
      }
    }
  }

  private async processSingleItem(
    data: TerminalData,
    warnings: string[]
  ): Promise<BatchResult> {
    await terminalRepository.createOrUpdate(data);

    const dataRecord = await terminalDataRecordRepository.create(data, warnings);

    const { alarms, adjustments } = thresholdEngine.evaluate(data);
    let alarmsGenerated = 0;

    if (alarms.length > 0) {
      await alarmEventRepository.createBatch(alarms);
      await messageQueueService.publishBatchAlarms(alarms);
      alarmsGenerated = alarms.length;

      if (adjustments.length > 0) {
        logger.debug('Dynamic alarm level adjustments applied:', {
          terminalId: data.terminalId,
          adjustments: adjustments.length,
        });
      }
    }

    messageQueueService.publishData(data, dataRecord.id).catch((err) => {
      logger.debug('Failed to publish data to queue:', err);
    });

    return {
      success: true,
      recordId: dataRecord.id,
      alarmsGenerated,
      warnings,
    };
  }

  public async forceFlush(): Promise<void> {
    if (this.currentBatch.length > 0) {
      await this.flushBatch();
    }
  }

  public getStats(): typeof this.stats & { currentBatchSize: number } {
    return {
      ...this.stats,
      currentBatchSize: this.currentBatch.length,
    };
  }

  public updateConfig(batchSize: number, maxBatchDelayMs: number): void {
    this.batchSize = batchSize;
    this.maxBatchDelayMs = maxBatchDelayMs;
    logger.info('Batch processing config updated:', { batchSize, maxBatchDelayMs });
  }

  public async shutdown(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
    }

    if (this.currentBatch.length > 0) {
      logger.info('Flushing remaining items on shutdown:', {
        count: this.currentBatch.length,
      });
      await this.flushBatch();
    }

    logger.info('Batch processing service shutdown complete');
  }
}

export const batchProcessingService = new BatchProcessingService(100, 500);
