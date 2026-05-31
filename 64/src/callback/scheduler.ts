import { callbackService } from './service';
import logger from '../utils/logger';

const MIN_EVENT_INTERVAL = 100;
const MAX_EVENT_INTERVAL = 2000;
const MIN_RETRY_INTERVAL = 10000;
const MAX_RETRY_INTERVAL = 60000;

class CallbackScheduler {
  private running: boolean = false;
  private eventTimeoutId: NodeJS.Timeout | null = null;
  private retryTimeoutId: NodeJS.Timeout | null = null;
  private eventCheckInterval: number = 500;
  private retryCheckInterval: number = 30000;
  private isProcessingEvents: boolean = false;
  private isProcessingRetries: boolean = false;

  start(): void {
    if (this.running) {
      logger.warn('回调调度器已在运行');
      return;
    }

    this.running = true;
    logger.info('回调调度器已启动');

    this.scheduleEventProcessing();
    this.scheduleRetryProcessing();
  }

  stop(): void {
    this.running = false;
    if (this.eventTimeoutId) {
      clearTimeout(this.eventTimeoutId);
      this.eventTimeoutId = null;
    }
    if (this.retryTimeoutId) {
      clearTimeout(this.retryTimeoutId);
      this.retryTimeoutId = null;
    }
    logger.info('回调调度器已停止');
  }

  private scheduleEventProcessing(): void {
    if (!this.running) return;

    this.eventTimeoutId = setTimeout(async () => {
      if (!this.isProcessingEvents) {
        this.isProcessingEvents = true;
        try {
          const processedCount = await callbackService.processEventQueue();
          this.adjustEventInterval(processedCount > 0);
        } catch (err: any) {
          logger.error('处理事件队列失败', { error: err.message });
        } finally {
          this.isProcessingEvents = false;
        }
      }
      this.scheduleEventProcessing();
    }, this.eventCheckInterval);
  }

  private scheduleRetryProcessing(): void {
    if (!this.running) return;

    this.retryTimeoutId = setTimeout(async () => {
      if (!this.isProcessingRetries) {
        this.isProcessingRetries = true;
        try {
          const retryCount = await callbackService.retryFailedDeliveries();
          this.adjustRetryInterval(retryCount > 0);
        } catch (err: any) {
          logger.error('重试失败回调失败', { error: err.message });
        } finally {
          this.isProcessingRetries = false;
        }
      }
      this.scheduleRetryProcessing();
    }, this.retryCheckInterval);
  }

  private adjustEventInterval(hasWork: boolean): void {
    if (hasWork) {
      this.eventCheckInterval = Math.max(MIN_EVENT_INTERVAL, this.eventCheckInterval * 0.8);
    } else {
      this.eventCheckInterval = Math.min(MAX_EVENT_INTERVAL, this.eventCheckInterval * 1.2);
    }
  }

  private adjustRetryInterval(hasWork: boolean): void {
    if (hasWork) {
      this.retryCheckInterval = Math.max(MIN_RETRY_INTERVAL, this.retryCheckInterval * 0.8);
    } else {
      this.retryCheckInterval = Math.min(MAX_RETRY_INTERVAL, this.retryCheckInterval * 1.2);
    }
  }

  isRunning(): boolean {
    return this.running;
  }

  getStats(): Record<string, any> {
    return {
      running: this.running,
      eventCheckInterval: this.eventCheckInterval,
      retryCheckInterval: this.retryCheckInterval,
      isProcessingEvents: this.isProcessingEvents,
      isProcessingRetries: this.isProcessingRetries,
      processingEventCount: callbackService.getProcessingEventCount(),
    };
  }
}

export const callbackScheduler = new CallbackScheduler();
