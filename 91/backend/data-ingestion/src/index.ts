import dotenv from 'dotenv';
import { createLogger, Logger } from '../shared/utils/logger';
import {
  ClickHouseConfig,
  RabbitMQConfig,
  BatchConfig,
  ParsedSignalingMessage,
  SignalingMessage,
  MetricsData
} from '../shared/types/index';
import { MessageConsumer } from './services/MessageConsumer';
import { ClickHouseWriter } from './services/ClickHouseWriter';
import { BatchProcessor } from './services/BatchProcessor';
import { HealthMonitor } from './monitor/HealthMonitor';

dotenv.config();

let logger: Logger;
let consumer: MessageConsumer;
let writer: ClickHouseWriter;
let batchProcessor: BatchProcessor;
let healthMonitor: HealthMonitor;
let shutdownInProgress = false;

function loadConfig(): {
  rabbitmq: RabbitMQConfig;
  clickhouse: ClickHouseConfig;
  batch: BatchConfig;
  healthPort: number;
  logLevel: string;
} {
  return {
    rabbitmq: {
      url: process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672',
      parsedQueue: process.env.RABBITMQ_PARSED_QUEUE || 'parsed_messages',
      metricsQueue: process.env.RABBITMQ_METRICS_QUEUE || 'metrics',
      dlqExchange: process.env.RABBITMQ_DLQ_EXCHANGE || 'dlx_exchange',
      dlqQueue: process.env.RABBITMQ_DLQ_QUEUE || 'dlq_messages',
      prefetch: parseInt(process.env.RABBITMQ_PREFETCH || '50', 10)
    },
    clickhouse: {
      host: process.env.CLICKHOUSE_HOST || 'http://localhost:8123',
      username: process.env.CLICKHOUSE_USER || 'default',
      password: process.env.CLICKHOUSE_PASSWORD || '',
      database: process.env.CLICKHOUSE_DATABASE || 'signaling'
    },
    batch: {
      maxSize: parseInt(process.env.BATCH_SIZE || '1000', 10),
      flushIntervalMs: parseInt(process.env.BATCH_FLUSH_INTERVAL || '5000', 10)
    },
    healthPort: parseInt(process.env.HEALTH_MONITOR_PORT || '3004', 10),
    logLevel: process.env.LOG_LEVEL || 'info'
  };
}

class BackpressureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackpressureError';
  }
}

async function handleMessage(
  message: ParsedSignalingMessage | SignalingMessage | MetricsData,
  type: 'signaling' | 'metrics'
): Promise<void> {
  if (shutdownInProgress) {
    logger.warn('Shutdown in progress, rejecting message', { messageId: message.id });
    throw new BackpressureError('Shutdown in progress');
  }

  if (batchProcessor.isBackpressured()) {
    logger.debug('Backpressure detected, message will be requeued', {
      messageId: message.id,
      type,
      backpressureInfo: batchProcessor.getBackpressureInfo()
    });
    throw new BackpressureError('Batch processor backpressured');
  }

  try {
    batchProcessor.addToBatch(message);

    logger.debug('Message added to batch', {
      id: message.id,
      type,
      currentBatchSize: batchProcessor.getCurrentBatchSize()
    });
  } catch (error) {
    logger.error('Failed to add message to batch', {
      error: (error as Error).message,
      messageId: message.id,
      type
    });
    throw error;
  }
}

async function init(): Promise<void> {
  const config = loadConfig();

  logger = createLogger('data-ingestion', config.logLevel);

  logger.info('Starting data ingestion service...', {
    pid: process.pid,
    nodeVersion: process.version
  });

  logger.info('Loaded configuration', {
    rabbitmq: { ...config.rabbitmq, url: '***' },
    clickhouse: { ...config.clickhouse, password: '***' },
    batch: config.batch,
    healthPort: config.healthPort
  });

  consumer = new MessageConsumer(config.rabbitmq, logger);
  writer = new ClickHouseWriter(config.clickhouse, logger);
  batchProcessor = new BatchProcessor(config.batch, writer, logger);

  consumer.setBackpressureCheck(() => {
    return batchProcessor.isBackpressured();
  });

  healthMonitor = new HealthMonitor(
    config.healthPort,
    {
      consumer,
      writer,
      batchProcessor,
      rabbitmqConfig: config.rabbitmq
    },
    logger
  );

  consumer.setMessageCallback(handleMessage);

  logger.info('Connecting to ClickHouse...');
  await writer.init();
  logger.info('ClickHouse connected successfully');

  logger.info('Connecting to RabbitMQ...');
  await consumer.connect();
  logger.info('RabbitMQ connected successfully');

  logger.info('Starting consumers...');
  await consumer.startConsuming(
    config.rabbitmq.parsedQueue,
    (msg) => consumer.handleParsedPacketMessage(msg)
  );
  await consumer.startConsuming(
    config.rabbitmq.metricsQueue,
    (msg) => consumer.handleMetricsMessage(msg)
  );
  logger.info('Consumers started successfully');

  batchProcessor.startAutoFlush();

  await healthMonitor.start();

  logger.info('Data ingestion service started successfully');
  logger.info(`Health endpoint: http://localhost:${config.healthPort}/health`);
  logger.info(`Stats endpoint: http://localhost:${config.healthPort}/stats`);
}

async function gracefulShutdown(signal: string): Promise<void> {
  if (shutdownInProgress) {
    logger.warn('Shutdown already in progress, ignoring signal', { signal });
    return;
  }

  shutdownInProgress = true;
  logger.info(`Received ${signal} signal, starting graceful shutdown...`);

  const shutdownTimeout = setTimeout(() => {
    logger.error('Shutdown timeout exceeded, forcing exit');
    process.exit(1);
  }, 60000);

  try {
    logger.info('Stopping consumers...');
    await consumer.stopConsuming(process.env.RABBITMQ_PARSED_QUEUE || 'parsed_messages');
    await consumer.stopConsuming(process.env.RABBITMQ_METRICS_QUEUE || 'metrics');
    logger.info('Consumers stopped');

    logger.info('Shutting down batch processor...');
    await batchProcessor.shutdown();
    logger.info('Batch processor shut down');

    logger.info('Stopping health monitor...');
    await healthMonitor.stop();
    logger.info('Health monitor stopped');

    logger.info('Disconnecting from RabbitMQ...');
    await consumer.disconnect();
    logger.info('RabbitMQ disconnected');

    logger.info('Disconnecting from ClickHouse...');
    await writer.disconnect();
    logger.info('ClickHouse disconnected');

    clearTimeout(shutdownTimeout);
    logger.info('Graceful shutdown completed successfully');
    process.exit(0);
  } catch (error) {
    logger.error('Error during graceful shutdown', { error: (error as Error).message, stack: (error as Error).stack });
    clearTimeout(shutdownTimeout);
    process.exit(1);
  }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', {
    error: error.message,
    stack: error.stack
  });
  if (!shutdownInProgress) {
    gracefulShutdown('uncaughtException');
  }
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', {
    reason: reason as string,
    promise: promise.toString()
  });
  if (!shutdownInProgress) {
    gracefulShutdown('unhandledRejection');
  }
});

init().catch((error) => {
  if (logger) {
    logger.error('Failed to initialize service', {
      error: error.message,
      stack: error.stack
    });
  } else {
    console.error('Failed to initialize service:', error);
  }
  process.exit(1);
});
