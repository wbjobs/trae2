import { taskService } from './service';
import logger from '../utils/logger';

const MAX_BATCH_SIZE = 10;
const MIN_INTERVAL = 100;
const MAX_INTERVAL = 5000;
const LOAD_FACTOR = 0.7;

class TaskScheduler {
  private running: boolean = false;
  private intervalId: NodeJS.Timeout | null = null;
  private checkInterval: number = 1000;
  private isProcessing: boolean = false;
  private consecutiveErrors: number = 0;
  private lastProcessTime: number = 0;

  start(): void {
    if (this.running) {
      logger.warn('任务调度器已在运行');
      return;
    }

    this.running = true;
    this.consecutiveErrors = 0;
    logger.info('任务调度器已启动');

    this.scheduleNext();
  }

  stop(): void {
    this.running = false;
    if (this.intervalId) {
      clearTimeout(this.intervalId);
      this.intervalId = null;
    }
    logger.info('任务调度器已停止');
  }

  private scheduleNext(): void {
    if (!this.running) return;

    this.intervalId = setTimeout(() => {
      this.processQueue().catch((err) => {
        logger.error('任务调度处理失败', { error: err.message });
        this.consecutiveErrors++;
        
        if (this.consecutiveErrors > 10) {
          logger.error('任务调度器连续错误过多，暂停10秒', { consecutiveErrors: this.consecutiveErrors });
          this.checkInterval = 10000;
        }
      }).finally(() => {
        this.scheduleNext();
      });
    }, this.checkInterval);
  }

  private async processQueue(): Promise<void> {
    if (!this.running || this.isProcessing) return;

    this.isProcessing = true;
    const startTime = Date.now();

    try {
      const queueLength = await taskService.getQueueLength();
      if (queueLength === 0) {
        this.adjustInterval(false);
        return;
      }

      const processingCount = taskService.getProcessingTaskCount();
      const batchSize = Math.min(MAX_BATCH_SIZE, Math.max(1, Math.floor(queueLength * 0.1)));

      logger.debug(`开始处理任务队列`, {
        queueLength,
        batchSize,
        processingCount,
        currentInterval: this.checkInterval,
      });

      let processedCount = 0;
      for (let i = 0; i < batchSize; i++) {
        try {
          const task = await taskService.getNextTask();
          if (!task) break;

          const assignedTask = await taskService.assignTaskToRadar(task.id, 'auto-assign');
          if (assignedTask) {
            processedCount++;
            logger.info(`任务已自动分配`, {
              taskId: task.id,
              taskName: task.name,
              priority: task.priority,
              radarId: assignedTask.radarId,
            });
          } else {
            taskService.clearProcessingTask(task.id);
          }
        } catch (taskErr: any) {
          logger.error('处理单个任务失败', { error: taskErr.message });
        }
      }

      this.consecutiveErrors = 0;
      this.adjustInterval(processedCount > 0);
      this.lastProcessTime = Date.now() - startTime;

      logger.debug(`任务批次处理完成`, {
        processedCount,
        processTime: this.lastProcessTime,
      });
    } finally {
      this.isProcessing = false;
    }
  }

  private adjustInterval(hasWork: boolean): void {
    if (hasWork) {
      this.checkInterval = Math.max(MIN_INTERVAL, this.checkInterval * 0.8);
    } else {
      this.checkInterval = Math.min(MAX_INTERVAL, this.checkInterval * 1.2);
    }
  }

  setCheckInterval(interval: number): void {
    this.checkInterval = Math.max(MIN_INTERVAL, Math.min(MAX_INTERVAL, interval));
  }

  isRunning(): boolean {
    return this.running;
  }

  getStats(): Record<string, any> {
    return {
      running: this.running,
      checkInterval: this.checkInterval,
      isProcessing: this.isProcessing,
      consecutiveErrors: this.consecutiveErrors,
      lastProcessTime: this.lastProcessTime,
    };
  }
}

export const taskScheduler = new TaskScheduler();
