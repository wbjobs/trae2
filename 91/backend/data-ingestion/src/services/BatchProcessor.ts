import { ParsedSignalingMessage, SignalingMessage, MetricsData, BatchConfig } from '../shared/types/index';
import { Logger } from '../shared/utils/logger';
import { BatchInsertError } from '../shared/utils/errors';
import { ClickHouseWriter } from './ClickHouseWriter';

type BatchItem = ParsedSignalingMessage | SignalingMessage | MetricsData;

interface BatchStats {
  totalAdded: number;
  totalFlushed: number;
  totalFailed: number;
  flushCount: number;
  lastFlushTime: number | null;
  lastFlushSize: number;
  averageFlushLatencyMs: number;
  flushLatencyHistory: number[];
  batchSizeHistory: number[];
  backpressureEvents: number;
  currentBackpressureDurationMs: number;
}

interface Lock {
  acquired: boolean;
  queue: Array<() => void>;
}

export class BatchProcessor {
  private signalingBatch: (ParsedSignalingMessage | SignalingMessage)[] = [];
  private metricsBatch: MetricsData[] = [];
  private config: BatchConfig;
  private logger: Logger;
  private writer: ClickHouseWriter;
  private flushTimer: NodeJS.Timeout | null = null;
  private stats: BatchStats;
  private readonly maxHistorySize = 100;
  private backpressureThreshold: number;
  private flushLock: Lock = { acquired: false, queue: [] };
  private backpressureStartTime: number | null = null;

  constructor(config: BatchConfig, writer: ClickHouseWriter, logger: Logger) {
    this.config = config;
    this.writer = writer;
    this.logger = logger;
    this.backpressureThreshold = config.maxSize * 2;
    this.stats = {
      totalAdded: 0,
      totalFlushed: 0,
      totalFailed: 0,
      flushCount: 0,
      lastFlushTime: null,
      lastFlushSize: 0,
      averageFlushLatencyMs: 0,
      flushLatencyHistory: [],
      batchSizeHistory: [],
      backpressureEvents: 0,
      currentBackpressureDurationMs: 0
    };
  }

  private async acquireLock(): Promise<void> {
    if (!this.flushLock.acquired) {
      this.flushLock.acquired = true;
      return;
    }
    return new Promise<void>((resolve) => {
      this.flushLock.queue.push(resolve);
    });
  }

  private releaseLock(): void {
    if (this.flushLock.queue.length > 0) {
      const next = this.flushLock.queue.shift();
      if (next) next();
    } else {
      this.flushLock.acquired = false;
    }
  }

  addToBatch(message: ParsedSignalingMessage | SignalingMessage | MetricsData): void {
    if ('parsedContent' in message || 'device_id' in message) {
      this.signalingBatch.push(message);
    } else {
      this.metricsBatch.push(message);
    }

    this.stats.totalAdded++;

    const totalSize = this.signalingBatch.length + this.metricsBatch.length;

    if (this.isBackpressured() && !this.backpressureStartTime) {
      this.backpressureStartTime = Date.now();
      this.stats.backpressureEvents++;
      this.logger.warn('Backpressure started', {
        currentSize: totalSize,
        threshold: this.backpressureThreshold
      });
    }

    if (totalSize >= this.config.maxSize) {
      this.logger.debug('Batch size threshold reached, triggering flush', {
        signalingSize: this.signalingBatch.length,
        metricsSize: this.metricsBatch.length,
        totalSize
      });
      setImmediate(() => this.tryFlush());
    }
  }

  async tryFlush(): Promise<boolean> {
    const signalingCount = this.signalingBatch.length;
    const metricsCount = this.metricsBatch.length;
    const totalCount = signalingCount + metricsCount;

    if (totalCount === 0) {
      return true;
    }

    if (this.flushLock.acquired) {
      this.logger.debug('Flush already in progress, skipping');
      return false;
    }

    await this.acquireLock();

    try {
      return await this.performFlush(signalingCount, metricsCount, totalCount);
    } finally {
      this.releaseLock();

      if (this.backpressureStartTime && !this.isBackpressured()) {
        const duration = Date.now() - this.backpressureStartTime;
        this.stats.currentBackpressureDurationMs = duration;
        this.backpressureStartTime = null;
        this.logger.info('Backpressure resolved', { durationMs: duration });
      }
    }
  }

  private async performFlush(
    signalingCount: number,
    metricsCount: number,
    totalCount: number
  ): Promise<boolean> {
    const startTime = Date.now();

    try {
      this.logger.debug('Flushing batch', {
        signalingCount,
        metricsCount,
        totalCount
      });

      const flushPromises: Promise<void>[] = [];

      if (this.signalingBatch.length > 0) {
        const batch = [...this.signalingBatch];
        this.signalingBatch = [];
        flushPromises.push(this.writer.insertSignalingBatchAsync(batch));
      }

      if (this.metricsBatch.length > 0) {
        const batch = [...this.metricsBatch];
        this.metricsBatch = [];
        flushPromises.push(this.writer.insertMetricsBatchAsync(batch));
      }

      await Promise.all(flushPromises);

      const latency = Date.now() - startTime;
      this.updateFlushStats(totalCount, latency, true);

      this.logger.debug('Batch flushed successfully', {
        count: totalCount,
        latencyMs: latency
      });

      return true;
    } catch (error) {
      const latency = Date.now() - startTime;
      this.updateFlushStats(totalCount, latency, false);

      this.logger.error('Batch flush failed', {
        error: (error as Error).message,
        signalingCount,
        metricsCount
      });

      throw new BatchInsertError(
        'Failed to flush batch to ClickHouse',
        error as Error,
        { signalingCount, metricsCount }
      );
    }
  }

  async flushBatch(): Promise<void> {
    await this.tryFlush();
  }

  startAutoFlush(intervalMs?: number): void {
    const interval = intervalMs ?? this.config.flushIntervalMs;

    if (this.flushTimer) {
      this.stopAutoFlush();
    }

    this.flushTimer = setInterval(async () => {
      try {
        await this.tryFlush();
      } catch (error) {
        this.logger.error('Auto-flush error', { error: (error as Error).message });
      }
    }, interval);

    this.logger.info('Auto-flush started', { intervalMs: interval });
  }

  stopAutoFlush(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
      this.logger.info('Auto-flush stopped');
    }
  }

  private updateFlushStats(count: number, latencyMs: number, success: boolean): void {
    this.stats.flushCount++;
    this.stats.lastFlushTime = Date.now();
    this.stats.lastFlushSize = count;

    if (success) {
      this.stats.totalFlushed += count;
    } else {
      this.stats.totalFailed += count;
    }

    this.stats.flushLatencyHistory.push(latencyMs);
    if (this.stats.flushLatencyHistory.length > this.maxHistorySize) {
      this.stats.flushLatencyHistory.shift();
    }

    this.stats.batchSizeHistory.push(count);
    if (this.stats.batchSizeHistory.length > this.maxHistorySize) {
      this.stats.batchSizeHistory.shift();
    }

    const avgLatency =
      this.stats.flushLatencyHistory.reduce((sum, l) => sum + l, 0) /
      this.stats.flushLatencyHistory.length;
    this.stats.averageFlushLatencyMs = Math.round(avgLatency * 100) / 100;
  }

  getCurrentBatchSize(): { signaling: number; metrics: number; total: number } {
    return {
      signaling: this.signalingBatch.length,
      metrics: this.metricsBatch.length,
      total: this.signalingBatch.length + this.metricsBatch.length
    };
  }

  isBackpressured(): boolean {
    const totalSize = this.signalingBatch.length + this.metricsBatch.length;
    return totalSize >= this.backpressureThreshold || this.flushLock.acquired;
  }

  getBackpressureInfo(): {
    isBackpressured: boolean;
    currentSize: number;
    threshold: number;
    durationMs: number;
    queueDepth: number;
  } {
    const totalSize = this.signalingBatch.length + this.metricsBatch.length;
    return {
      isBackpressured: this.isBackpressured(),
      currentSize: totalSize,
      threshold: this.backpressureThreshold,
      durationMs: this.backpressureStartTime ? Date.now() - this.backpressureStartTime : 0,
      queueDepth: this.flushLock.queue.length
    };
  }

  getStats(): BatchStats {
    return {
      ...this.stats,
      flushLatencyHistory: [...this.stats.flushLatencyHistory],
      batchSizeHistory: [...this.stats.batchSizeHistory]
    };
  }

  getConfig(): BatchConfig {
    return { ...this.config };
  }

  updateConfig(config: Partial<BatchConfig>): void {
    this.config = { ...this.config, ...config };
    this.backpressureThreshold = this.config.maxSize * 2;
    this.logger.info('Batch config updated', this.config);
  }

  async shutdown(): Promise<void> {
    this.logger.info('Shutting down batch processor...');

    this.stopAutoFlush();

    const maxWaitTime = 30000;
    const startTime = Date.now();

    while (this.flushLock.acquired && Date.now() - startTime < maxWaitTime) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (this.flushLock.acquired) {
      this.logger.warn('Flush still in progress during shutdown, forcing flush');
    }

    try {
      await this.tryFlush();
    } catch (error) {
      this.logger.error('Final flush failed during shutdown', {
        error: (error as Error).message
      });
    }

    const remaining = this.signalingBatch.length + this.metricsBatch.length;
    if (remaining > 0) {
      this.logger.warn('Messages remaining in batch after shutdown', {
        remaining,
        signaling: this.signalingBatch.length,
        metrics: this.metricsBatch.length
      });
    }

    this.logger.info('Batch processor shut down complete');
  }
}
