import logger from '../utils/logger';
import { AppDataSource } from '../database/data-source';
import { messageQueueService } from './message-queue.service';
import { terminalLivenessDetector } from './terminal-liveness.service';
import { registerAllHandlers } from './pipeline-handlers';
import { batchProcessingService } from './batch-processor.service';
import { distributedRateLimiter } from './rate-limiter.service';
import { distributedLockService } from './distributed-lock.service';
import { dataProcessingPipeline } from './data-pipeline.service';

export async function initializeServices(): Promise<void> {
  logger.info('Initializing architecture upgrade services...');

  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
      logger.info('Database connected successfully');
    }
  } catch (err) {
    logger.warn('Database initialization warning (may already be connected):', err);
  }

  try {
    if (!messageQueueService.isConnected()) {
      await messageQueueService.connect();
      logger.info('Message queue initialized successfully');
    }
  } catch (err) {
    logger.warn('Message queue connection failed, will retry:', err);
  }

  registerAllHandlers(dataProcessingPipeline);
  logger.info('Data pipeline handlers registered');

  try {
    terminalLivenessDetector.start();
    logger.info('Terminal liveness detector started');
  } catch (err) {
    logger.warn('Liveness detector start warning:', err);
  }
}

export async function shutdownServices(): Promise<void> {
  logger.info('Shutting down services...');

  try {
    await batchProcessingService.shutdown();
    logger.info('Batch processing service stopped');
  } catch (err) {
    logger.error('Error stopping batch processing:', err);
  }

  try {
    terminalLivenessDetector.stop();
    logger.info('Terminal liveness detector stopped');
  } catch (err) {
    logger.error('Error stopping liveness detector:', err);
  }

  try {
    distributedRateLimiter.dispose();
    logger.info('Rate limiter disposed');
  } catch (err) {
    logger.error('Error disposing rate limiter:', err);
  }

  try {
    distributedLockService.disconnect();
    logger.info('Distributed lock service disposed');
  } catch (err) {
    logger.error('Error disposing lock service:', err);
  }

  logger.info('All services shutdown complete');
}
