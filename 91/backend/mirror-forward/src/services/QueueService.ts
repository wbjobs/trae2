import amqplib, { Connection, Channel, ConsumeMessage, Options, Replies } from 'amqplib';
import { EventEmitter } from 'events';
import { logger, QueueError } from 'shared/index';
import {
  RawPacket,
  ParsedPacket,
  ParsedMessage,
  MetricsData,
  QueueStats,
  QUEUE_NAMES,
  EXCHANGE_NAME,
  ROUTING_KEYS,
  QueueName,
} from 'shared/index';

interface BufferedMessage {
  routingKey: string;
  data: unknown;
  options: Options.Publish;
  retryCount: number;
  timestamp: number;
}

interface BufferMetrics {
  totalEnqueued: number;
  totalDequeued: number;
  totalDropped: number;
  totalRetried: number;
  totalConfirmed: number;
  totalNacked: number;
  peakBufferSize: number;
}

interface HighPerformanceQueueOptions {
  highWaterMark: number;
  lowWaterMark: number;
  maxRetries: number;
  retryDelay: number;
  batchSize: number;
  confirmTimeout: number;
}

class HighPerformanceQueue extends EventEmitter {
  private buffer: BufferedMessage[] = [];
  private processing = false;
  private drainEmitted = true;
  private options: HighPerformanceQueueOptions;
  private metrics: BufferMetrics = {
    totalEnqueued: 0,
    totalDequeued: 0,
    totalDropped: 0,
    totalRetried: 0,
    totalConfirmed: 0,
    totalNacked: 0,
    peakBufferSize: 0,
  };

  constructor(options: Partial<HighPerformanceQueueOptions> = {}) {
    super();
    this.options = {
      highWaterMark: options.highWaterMark ?? 10000,
      lowWaterMark: options.lowWaterMark ?? 1000,
      maxRetries: options.maxRetries ?? 3,
      retryDelay: options.retryDelay ?? 1000,
      batchSize: options.batchSize ?? 100,
      confirmTimeout: options.confirmTimeout ?? 30000,
    };
  }

  enqueue(message: BufferedMessage): boolean {
    if (this.buffer.length >= this.options.highWaterMark) {
      this.metrics.totalDropped++;
      return false;
    }

    this.buffer.push(message);
    this.metrics.totalEnqueued++;
    this.metrics.peakBufferSize = Math.max(this.metrics.peakBufferSize, this.buffer.length);
    this.drainEmitted = false;
    this.scheduleProcessing();
    return true;
  }

  enqueueBatch(messages: BufferedMessage[]): { success: number; dropped: number } {
    const available = this.options.highWaterMark - this.buffer.length;
    const toEnqueue = messages.slice(0, available);
    const dropped = messages.length - available;

    if (toEnqueue.length > 0) {
      this.buffer.push(...toEnqueue);
      this.metrics.totalEnqueued += toEnqueue.length;
      this.metrics.peakBufferSize = Math.max(this.metrics.peakBufferSize, this.buffer.length);
      this.drainEmitted = false;
      this.scheduleProcessing();
    }

    this.metrics.totalDropped += dropped;
    return { success: toEnqueue.length, dropped };
  }

  dequeueBatch(maxCount: number): BufferedMessage[] {
    const batch = this.buffer.splice(0, maxCount);
    this.metrics.totalDequeued += batch.length;

    if (this.buffer.length <= this.options.lowWaterMark && !this.drainEmitted) {
      this.drainEmitted = true;
      this.emit('drain');
    }

    return batch;
  }

  private scheduleProcessing(): void {
    if (!this.processing && this.buffer.length > 0) {
      setImmediate(() => {
        if (this.buffer.length > 0) {
          this.emit('process');
        }
      });
    }
  }

  setProcessing(value: boolean): void {
    this.processing = value;
  }

  isProcessing(): boolean {
    return this.processing;
  }

  isFull(): boolean {
    return this.buffer.length >= this.options.highWaterMark;
  }

  getBufferSize(): number {
    return this.buffer.length;
  }

  getOptions(): HighPerformanceQueueOptions {
    return { ...this.options };
  }

  getMetrics(): BufferMetrics {
    return { ...this.metrics };
  }

  incrementRetried(): void {
    this.metrics.totalRetried++;
  }

  incrementConfirmed(): void {
    this.metrics.totalConfirmed++;
  }

  incrementNacked(): void {
    this.metrics.totalNacked++;
  }

  resetMetrics(): void {
    this.metrics = {
      totalEnqueued: 0,
      totalDequeued: 0,
      totalDropped: 0,
      totalRetried: 0,
      totalConfirmed: 0,
      totalNacked: 0,
      peakBufferSize: this.buffer.length,
    };
  }
}

export class QueueService {
  private connection: Connection | null = null;
  private channel: Channel | null = null;
  private confirmChannel: Channel | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts: number;
  private reconnectInterval: number;
  private exchangeName: string;
  private exchangeType: string;
  private durable: boolean;
  private publisherConfirms: boolean;
  private highPerformanceQueue: HighPerformanceQueue;
  private unconfirmedMessages: Map<number, BufferedMessage> = new Map();
  private nextDeliveryTag = 1;

  constructor() {
    this.maxReconnectAttempts = parseInt(process.env.RABBITMQ_RECONNECT_ATTEMPTS || '10', 10);
    this.reconnectInterval = parseInt(process.env.RABBITMQ_RECONNECT_INTERVAL || '3000', 10);
    this.exchangeName = process.env.RABBITMQ_EXCHANGE || EXCHANGE_NAME;
    this.exchangeType = process.env.RABBITMQ_EXCHANGE_TYPE || 'topic';
    this.durable = process.env.RABBITMQ_DURABLE !== 'false';
    this.publisherConfirms = process.env.RABBITMQ_PUBLISHER_CONFIRMS !== 'false';

    this.highPerformanceQueue = new HighPerformanceQueue({
      highWaterMark: parseInt(process.env.BUFFER_HIGH_WATER_MARK || '10000', 10),
      lowWaterMark: parseInt(process.env.BUFFER_LOW_WATER_MARK || '1000', 10),
      maxRetries: parseInt(process.env.PUBLISH_MAX_RETRIES || '3', 10),
      retryDelay: parseInt(process.env.PUBLISH_RETRY_DELAY || '1000', 10),
      batchSize: parseInt(process.env.PUBLISH_BATCH_SIZE || '100', 10),
      confirmTimeout: parseInt(process.env.PUBLISH_CONFIRM_TIMEOUT || '30000', 10),
    });

    this.highPerformanceQueue.on('process', () => this.processBuffer());
    this.highPerformanceQueue.on('drain', () => {
      logger.info('[QueueService] Buffer drained below low water mark');
    });
  }

  async connect(): Promise<void> {
    try {
      const url = this.buildConnectionUrl();
      logger.info(`[QueueService] Connecting to RabbitMQ at ${process.env.RABBITMQ_HOST}`);

      const conn = await amqplib.connect(url) as unknown as { createChannel: () => Promise<Channel>; createConfirmChannel: () => Promise<Channel>; on: (event: string, handler: (err?: Error) => void) => void };
      this.connection = conn as unknown as Connection;
      this.channel = await conn.createChannel();

      if (this.publisherConfirms) {
        this.confirmChannel = await conn.createConfirmChannel();
        this.setupConfirmChannel();
      }

      this.connection.on('error', (err: Error) => {
        logger.error('[QueueService] Connection error:', err);
        this.handleReconnect();
      });

      this.connection.on('close', () => {
        logger.warn('[QueueService] Connection closed');
        this.handleReconnect();
      });

      this.channel.on('error', (err: Error) => {
        logger.error('[QueueService] Channel error:', err);
      });

      this.channel.on('close', () => {
        logger.warn('[QueueService] Channel closed');
      });

      this.reconnectAttempts = 0;
      logger.info('[QueueService] Successfully connected to RabbitMQ');

      await this.setupExchangesAndQueues();
    } catch (error) {
      logger.error('[QueueService] Failed to connect:', error);
      this.handleReconnect();
      throw new QueueError('Failed to connect to RabbitMQ');
    }
  }

  private setupConfirmChannel(): void {
    if (!this.confirmChannel) return;

    this.confirmChannel.on('error', (err: Error) => {
      logger.error('[QueueService] Confirm channel error:', err);
    });

    this.confirmChannel.on('close', () => {
      logger.warn('[QueueService] Confirm channel closed');
    });

    this.confirmChannel.on('ack', (data: { deliveryTag: number; multiple: boolean }) => {
      this.handleConfirm(data.deliveryTag, data.multiple, true);
    });

    this.confirmChannel.on('nack', (data: { deliveryTag: number; multiple: boolean }) => {
      this.handleConfirm(data.deliveryTag, data.multiple, false);
    });
  }

  private handleConfirm(deliveryTag: number, multiple: boolean, ack: boolean): void {
    if (multiple) {
      for (const tag of this.unconfirmedMessages.keys()) {
        if (tag <= deliveryTag) {
          const message = this.unconfirmedMessages.get(tag);
          if (message) {
            if (ack) {
              this.highPerformanceQueue.incrementConfirmed();
            } else {
              this.highPerformanceQueue.incrementNacked();
              this.handleNackedMessage(message);
            }
          }
          this.unconfirmedMessages.delete(tag);
        }
      }
    } else {
      const message = this.unconfirmedMessages.get(deliveryTag);
      if (message) {
        if (ack) {
          this.highPerformanceQueue.incrementConfirmed();
        } else {
          this.highPerformanceQueue.incrementNacked();
          this.handleNackedMessage(message);
        }
        this.unconfirmedMessages.delete(deliveryTag);
      }
    }
  }

  private handleNackedMessage(message: BufferedMessage): void {
    const options = this.highPerformanceQueue.getOptions();
    if (message.retryCount < options.maxRetries) {
      message.retryCount++;
      this.highPerformanceQueue.incrementRetried();
      setTimeout(() => {
        this.highPerformanceQueue.enqueue(message);
      }, options.retryDelay * message.retryCount);
      logger.warn(`[QueueService] Message nacked, retrying (${message.retryCount}/${options.maxRetries})`);
    } else {
      logger.error('[QueueService] Message dropped after max retries');
    }
  }

  private buildConnectionUrl(): string {
    const host = process.env.RABBITMQ_HOST || 'localhost';
    const port = process.env.RABBITMQ_PORT || '5672';
    const username = encodeURIComponent(process.env.RABBITMQ_USERNAME || 'guest');
    const password = encodeURIComponent(process.env.RABBITMQ_PASSWORD || 'guest');
    const vhost = encodeURIComponent(process.env.RABBITMQ_VHOST || '/');

    return `amqp://${username}:${password}@${host}:${port}${vhost}`;
  }

  private handleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('[QueueService] Max reconnect attempts reached, giving up');
      return;
    }

    this.reconnectAttempts++;
    logger.info(
      `[QueueService] Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts}) in ${this.reconnectInterval}ms`
    );

    setTimeout(() => {
      this.connect().catch((err) => {
        logger.error('[QueueService] Reconnect attempt failed:', err);
      });
    }, this.reconnectInterval);
  }

  private async setupExchangesAndQueues(): Promise<void> {
    if (!this.channel) {
      throw new QueueError('Channel not initialized');
    }

    await this.channel.assertExchange(this.exchangeName, this.exchangeType, {
      durable: this.durable,
    });

    const queueConfigs = [
      { name: QUEUE_NAMES.RAW_PACKETS, routingKey: ROUTING_KEYS.RAW_PACKET },
      { name: QUEUE_NAMES.PARSED_MESSAGES, routingKey: ROUTING_KEYS.PARSED_MESSAGE },
      { name: QUEUE_NAMES.METRICS, routingKey: ROUTING_KEYS.METRICS },
    ];

    for (const config of queueConfigs) {
      await this.assertAndBindQueue(config.name, config.routingKey);
    }

    await this.channel.assertQueue(QUEUE_NAMES.DLQ, {
      durable: this.durable,
    });

    logger.info('[QueueService] Exchanges and queues setup complete');
  }

  private async assertAndBindQueue(queueName: string, routingKey: string): Promise<void> {
    if (!this.channel) {
      throw new QueueError('Channel not initialized');
    }

    await this.channel.assertQueue(queueName, {
      durable: this.durable,
      deadLetterExchange: this.exchangeName,
      deadLetterRoutingKey: QUEUE_NAMES.DLQ,
    });

    await this.channel.bindQueue(queueName, this.exchangeName, routingKey);

    logger.info(`[QueueService] Queue '${queueName}' bound with routing key '${routingKey}'`);
  }

  private async processBuffer(): Promise<void> {
    if (this.highPerformanceQueue.isProcessing()) return;
    this.highPerformanceQueue.setProcessing(true);

    try {
      const options = this.highPerformanceQueue.getOptions();
      const useConfirms = this.publisherConfirms && this.confirmChannel;

      while (this.highPerformanceQueue.getBufferSize() > 0) {
        const batch = this.highPerformanceQueue.dequeueBatch(options.batchSize);
        if (batch.length === 0) break;

        if (useConfirms) {
          await this.publishBatchWithConfirms(batch);
        } else {
          await this.publishBatchDirect(batch);
        }
      }
    } catch (error) {
      logger.error('[QueueService] Error processing buffer:', error);
    } finally {
      this.highPerformanceQueue.setProcessing(false);
    }
  }

  private async publishBatchWithConfirms(batch: BufferedMessage[]): Promise<void> {
    if (!this.confirmChannel) return;

    const queueOptions = this.highPerformanceQueue.getOptions();

    for (const message of batch) {
      const deliveryTag = this.nextDeliveryTag++;
      this.unconfirmedMessages.set(deliveryTag, message);

      try {
        const content = Buffer.from(JSON.stringify(message.data));
        const published = this.confirmChannel.publish(
          this.exchangeName,
          message.routingKey,
          content,
          message.options
        );

        if (!published) {
          await new Promise<void>((resolve) => {
            this.confirmChannel?.once('drain', resolve);
          });
        }
      } catch (error) {
        logger.error('[QueueService] Error publishing message:', error);
        this.unconfirmedMessages.delete(deliveryTag);
        this.handleNackedMessage(message);
      }
    }

    try {
      await this.confirmChannel.waitForConfirms(queueOptions.confirmTimeout);
    } catch (error) {
      logger.warn('[QueueService] Wait for confirms timed out or failed:', error);
    }
  }

  private async publishBatchDirect(batch: BufferedMessage[]): Promise<void> {
    if (!this.channel) return;

    for (const message of batch) {
      try {
        const content = Buffer.from(JSON.stringify(message.data));
        const published = this.channel.publish(
          this.exchangeName,
          message.routingKey,
          content,
          message.options
        );

        if (!published) {
          await new Promise<void>((resolve) => {
            this.channel?.once('drain', resolve);
          });
        }

        this.highPerformanceQueue.incrementConfirmed();
      } catch (error) {
        logger.error('[QueueService] Error publishing message:', error);
        this.handleNackedMessage(message);
      }
    }
  }

  async publishBatch(routingKey: string, messages: unknown[]): Promise<{ success: number; dropped: number }> {
    const bufferedMessages: BufferedMessage[] = messages.map((data) => ({
      routingKey,
      data,
      options: {
        persistent: this.durable,
        contentType: 'application/json',
        timestamp: Date.now(),
      },
      retryCount: 0,
      timestamp: Date.now(),
    }));

    return this.highPerformanceQueue.enqueueBatch(bufferedMessages);
  }

  async publishRawPacket(packet: RawPacket): Promise<void> {
    const buffered: BufferedMessage = {
      routingKey: ROUTING_KEYS.RAW_PACKET,
      data: packet,
      options: {
        persistent: this.durable,
        contentType: 'application/json',
        timestamp: Date.now(),
      },
      retryCount: 0,
      timestamp: Date.now(),
    };

    if (!this.highPerformanceQueue.enqueue(buffered)) {
      throw new QueueError('Buffer full, message dropped');
    }
  }

  async publishParsedMessage(message: ParsedMessage): Promise<void> {
    const buffered: BufferedMessage = {
      routingKey: ROUTING_KEYS.PARSED_MESSAGE,
      data: message,
      options: {
        persistent: this.durable,
        contentType: 'application/json',
        timestamp: Date.now(),
      },
      retryCount: 0,
      timestamp: Date.now(),
    };

    if (!this.highPerformanceQueue.enqueue(buffered)) {
      throw new QueueError('Buffer full, message dropped');
    }
  }

  async publishParsedPacket(packet: ParsedPacket): Promise<void> {
    return this.publishParsedMessage(packet);
  }

  async publishMetrics(metrics: MetricsData): Promise<void> {
    const buffered: BufferedMessage = {
      routingKey: ROUTING_KEYS.METRICS,
      data: metrics,
      options: {
        persistent: this.durable,
        contentType: 'application/json',
        timestamp: Date.now(),
      },
      retryCount: 0,
      timestamp: Date.now(),
    };

    if (!this.highPerformanceQueue.enqueue(buffered)) {
      throw new QueueError('Buffer full, message dropped');
    }
  }

  isBufferFull(): boolean {
    return this.highPerformanceQueue.isFull();
  }

  getBufferSize(): number {
    return this.highPerformanceQueue.getBufferSize();
  }

  getBufferMetrics(): BufferMetrics {
    return this.highPerformanceQueue.getMetrics();
  }

  async consume(
    queueName: QueueName,
    handler: (message: ConsumeMessage, channel: Channel) => Promise<void>,
    options: Options.Consume = {}
  ): Promise<void> {
    if (!this.channel) {
      throw new QueueError('Channel not initialized');
    }

    const consumeOptions: Options.Consume = {
      noAck: false,
      ...options,
    };

    await this.channel.consume(queueName, async (msg) => {
      if (!msg) {
        return;
      }

      try {
        await handler(msg, this.channel!);
      } catch (error) {
        logger.error(`[QueueService] Error processing message from ${queueName}:`, error);
        this.nack(msg, false);
      }
    }, consumeOptions);

    logger.info(`[QueueService] Consumer started for queue: ${queueName}`);
  }

  ack(message: ConsumeMessage, multiple: boolean = false): void {
    if (!this.channel) {
      logger.warn('[QueueService] Cannot ack: channel not initialized');
      return;
    }
    this.channel.ack(message, multiple);
  }

  nack(message: ConsumeMessage, requeue: boolean = false, multiple: boolean = false): void {
    if (!this.channel) {
      logger.warn('[QueueService] Cannot nack: channel not initialized');
      return;
    }
    this.channel.nack(message, multiple, requeue);
  }

  async getQueueStats(queueName: QueueName): Promise<QueueStats> {
    if (!this.channel) {
      throw new QueueError('Channel not initialized');
    }

    try {
      const info = await this.channel.checkQueue(queueName);
      return {
        queueName,
        messageCount: info.messageCount,
        consumerCount: info.consumerCount,
      };
    } catch (error) {
      logger.error(`[QueueService] Failed to get stats for ${queueName}:`, error);
      throw new QueueError(`Failed to get queue stats: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getAllQueueStats(): Promise<QueueStats[]> {
    const queues: QueueName[] = [
      QUEUE_NAMES.RAW_PACKETS,
      QUEUE_NAMES.PARSED_MESSAGES,
      QUEUE_NAMES.METRICS,
      QUEUE_NAMES.DLQ,
    ];

    const stats = await Promise.all(
      queues.map((queue) =>
        this.getQueueStats(queue).catch(() => ({
          queueName: queue,
          messageCount: -1,
          consumerCount: -1,
        }))
      )
    );

    return stats;
  }

  isConnected(): boolean {
    return this.connection !== null && this.channel !== null;
  }

  async close(): Promise<void> {
    logger.info('[QueueService] Closing connection...');

    if (this.confirmChannel) {
      try {
        await this.confirmChannel.close();
      } catch (error) {
        logger.error('[QueueService] Error closing confirm channel:', error);
      }
      this.confirmChannel = null;
    }

    if (this.channel) {
      try {
        await this.channel.close();
      } catch (error) {
        logger.error('[QueueService] Error closing channel:', error);
      }
      this.channel = null;
    }

    if (this.connection) {
      try {
        await (this.connection as unknown as { close: () => Promise<void> }).close();
      } catch (error) {
        logger.error('[QueueService] Error closing connection:', error);
      }
      this.connection = null;
    }

    logger.info('[QueueService] Connection closed');
  }
}

export const queueService = new QueueService();
export default queueService;
