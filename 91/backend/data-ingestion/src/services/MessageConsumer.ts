import amqp, { Connection, Channel, ConsumeMessage, Options } from 'amqplib';
import { ParsedSignalingMessage, ParsedPacket, SignalingMessage, MetricsData, RabbitMQConfig, ConsumerStats, parsedPacketToSignalingMessage } from '../shared/types/index';
import { Logger } from '../shared/utils/logger';
import { RabbitMQConnectionError, MessageProcessingError } from '../shared/utils/errors';
import { safeJSONParse, validateParsedMessage, validateMetricsData, withRetry } from '../shared/utils/helpers';

interface Consumer {
  queueName: string;
  consumerTag: string;
  handler: (message: ConsumeMessage) => Promise<void>;
  stats: ConsumerStats;
  paused: boolean;
}

interface ConsumeOptions {
  prefetch?: number;
  noAck?: boolean;
  durable?: boolean;
  autoDelete?: boolean;
}

interface BackpressureCallback {
  (): boolean | Promise<boolean>;
}

export class MessageConsumer {
  private connection: Connection | null = null;
  private channel: Channel | null = null;
  private consumers: Map<string, Consumer> = new Map();
  private config: RabbitMQConfig;
  private logger: Logger;
  private reconnecting = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private onMessageCallback: ((message: ParsedSignalingMessage | SignalingMessage | MetricsData, type: 'signaling' | 'metrics') => Promise<void>) | null = null;
  private backpressureCheck: BackpressureCallback | null = null;
  private readonly requeueDelayMs = parseInt(process.env.RABBITMQ_REQUEUE_DELAY || '1000', 10);
  private readonly maxRequeueAttempts = parseInt(process.env.RABBITMQ_MAX_REQUEUE_ATTEMPTS || '5', 10);

  constructor(config: RabbitMQConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
  }

  setBackpressureCheck(callback: BackpressureCallback): void {
    this.backpressureCheck = callback;
  }

  private async isBackpressured(): Promise<boolean> {
    if (this.backpressureCheck) {
      return await this.backpressureCheck();
    }
    return false;
  }

  async connect(): Promise<void> {
    try {
      this.logger.info('Connecting to RabbitMQ...', { url: this.config.url });
      
      this.connection = await withRetry(
        () => amqp.connect(this.config.url),
        5,
        1000,
        (error) => {
          this.logger.warn('RabbitMQ connection retry failed', { error: error.message, attempt: this.reconnectAttempts });
          return true;
        }
      );

      this.connection.on('error', (error) => this.handleConnectionError(error));
      this.connection.on('close', () => this.handleConnectionClose());

      this.channel = await this.connection.createChannel();
      
      this.channel.on('drain', () => {
        this.logger.info('Channel drain event, resuming consumers if paused');
        this.resumeAllConsumers();
      });
      
      await this.setupExchangesAndQueues();

      this.reconnecting = false;
      this.reconnectAttempts = 0;
      
      this.logger.info('Successfully connected to RabbitMQ');
    } catch (error) {
      throw new RabbitMQConnectionError(
        'Failed to connect to RabbitMQ',
        error as Error,
        { url: this.config.url }
      );
    }
  }

  private async setupExchangesAndQueues(): Promise<void> {
    if (!this.channel) throw new Error('Channel not initialized');

    await this.channel.assertExchange(this.config.dlqExchange, 'direct', {
      durable: true
    });

    await this.channel.assertQueue(this.config.dlqQueue, {
      durable: true
    });

    await this.channel.bindQueue(
      this.config.dlqQueue,
      this.config.dlqExchange,
      this.config.dlqQueue
    );

    const queueOptions: Options.AssertQueue = {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': this.config.dlqExchange,
        'x-dead-letter-routing-key': this.config.dlqQueue
      }
    };

    await this.channel.assertQueue(this.config.parsedQueue, queueOptions);
    await this.channel.assertQueue(this.config.metricsQueue, queueOptions);

    this.logger.info('Exchanges and queues set up successfully');
  }

  async startConsuming(
    queueName: string,
    handler: (message: ConsumeMessage) => Promise<void>,
    options: ConsumeOptions = {}
  ): Promise<void> {
    if (!this.channel) {
      throw new RabbitMQConnectionError('Channel not initialized. Call connect() first.');
    }

    const prefetch = options.prefetch ?? this.config.prefetch;
    const noAck = options.noAck ?? false;

    await this.channel.prefetch(prefetch, true);

    const { consumerTag } = await this.channel.consume(
      queueName,
      async (message) => {
        if (!message) return;
        await handler(message);
      },
      { noAck }
    );

    const stats: ConsumerStats = {
      queueName,
      messagesConsumed: 0,
      messagesProcessed: 0,
      messagesFailed: 0,
      messagesRequeued: 0,
      lastMessageTime: null,
      prefetchCount: prefetch,
      currentBacklog: 0
    };

    this.consumers.set(queueName, {
      queueName,
      consumerTag,
      handler,
      stats,
      paused: false
    });

    this.logger.info('Started consuming from queue', { queueName, consumerTag, prefetch });
  }

  private pauseConsumer(queueName: string): void {
    const consumer = this.consumers.get(queueName);
    if (consumer && !consumer.paused) {
      consumer.paused = true;
      this.logger.warn('Pausing consumer due to backpressure', { queueName });
    }
  }

  private resumeConsumer(queueName: string): void {
    const consumer = this.consumers.get(queueName);
    if (consumer && consumer.paused) {
      consumer.paused = false;
      this.logger.info('Resuming consumer', { queueName });
    }
  }

  private resumeAllConsumers(): void {
    for (const queueName of this.consumers.keys()) {
      this.resumeConsumer(queueName);
    }
  }

  async stopConsuming(queueName: string): Promise<void> {
    const consumer = this.consumers.get(queueName);
    if (!consumer) {
      this.logger.warn('No consumer found for queue', { queueName });
      return;
    }

    if (this.channel) {
      await this.channel.cancel(consumer.consumerTag);
    }

    this.consumers.delete(queueName);
    this.logger.info('Stopped consuming from queue', { queueName });
  }

  setMessageCallback(
    callback: (message: ParsedSignalingMessage | SignalingMessage | MetricsData, type: 'signaling' | 'metrics') => Promise<void>
  ): void {
    this.onMessageCallback = callback;
  }

  private getRequeueCount(message: ConsumeMessage): number {
    const deathHeader = message.properties.headers?.['x-death'];
    if (Array.isArray(deathHeader) && deathHeader.length > 0) {
      return deathHeader[0].count || 0;
    }
    return 0;
  }

  private async requeueWithDelay(message: ConsumeMessage): Promise<void> {
    const requeueCount = this.getRequeueCount(message);
    
    if (requeueCount >= this.maxRequeueAttempts) {
      this.logger.warn('Max requeue attempts reached, sending to DLQ', {
        messageId: message.properties.messageId,
        requeueCount
      });
      await this.sendToDLQ(message, new Error(`Max requeue attempts reached: ${requeueCount}`));
      this.nack(message, false);
      return;
    }

    const delay = Math.min(this.requeueDelayMs * Math.pow(2, requeueCount), 30000);
    
    this.logger.debug('Requeuing message with delay', {
      messageId: message.properties.messageId,
      requeueCount,
      delayMs: delay
    });

    setTimeout(() => {
      this.nack(message, true);
    }, delay);
  }

  async handleParsedMessage(message: ConsumeMessage): Promise<void> {
    const consumer = this.consumers.get(this.config.parsedQueue);
    if (consumer) {
      consumer.stats.messagesConsumed++;
      consumer.stats.lastMessageTime = Date.now();
    }

    try {
      if (await this.isBackpressured()) {
        this.pauseConsumer(this.config.parsedQueue);
        if (consumer) {
          consumer.stats.messagesRequeued = (consumer.stats.messagesRequeued || 0) + 1;
        }
        await this.requeueWithDelay(message);
        return;
      }

      const content = message.content.toString();
      const parsed = safeJSONParse<ParsedSignalingMessage>(content);

      if (!parsed || !validateParsedMessage(parsed)) {
        throw new MessageProcessingError('Invalid parsed message format', undefined, {
          content: content.substring(0, 200)
        });
      }

      parsed.processingLatencyMs = Date.now() - parsed.timestamp;

      if (this.onMessageCallback) {
        await this.onMessageCallback(parsed, 'signaling');
      }

      this.ack(message);

      if (consumer) {
        consumer.stats.messagesProcessed++;
      }
    } catch (error) {
      this.logger.error('Failed to process parsed message', {
        error: (error as Error).message,
        messageId: message.properties.messageId
      });

      if (consumer) {
        consumer.stats.messagesFailed++;
      }

      await this.sendToDLQ(message, error as Error);
      this.nack(message, false);
    }
  }

  async handleParsedPacketMessage(message: ConsumeMessage): Promise<void> {
    const consumer = this.consumers.get(this.config.parsedQueue);
    if (consumer) {
      consumer.stats.messagesConsumed++;
      consumer.stats.lastMessageTime = Date.now();
    }

    try {
      if (await this.isBackpressured()) {
        this.pauseConsumer(this.config.parsedQueue);
        if (consumer) {
          consumer.stats.messagesRequeued = (consumer.stats.messagesRequeued || 0) + 1;
        }
        await this.requeueWithDelay(message);
        return;
      }

      const content = message.content.toString();
      const parsed = safeJSONParse<ParsedPacket>(content);

      if (!parsed || !parsed.id || !parsed.timestamp) {
        throw new MessageProcessingError('Invalid parsed packet format', undefined, {
          content: content.substring(0, 200)
        });
      }

      const signalingMessage = parsedPacketToSignalingMessage(parsed);

      if (this.onMessageCallback) {
        await this.onMessageCallback(signalingMessage, 'signaling');
      }

      this.ack(message);

      if (consumer) {
        consumer.stats.messagesProcessed++;
      }
    } catch (error) {
      this.logger.error('Failed to process parsed packet message', {
        error: (error as Error).message,
        messageId: message.properties.messageId
      });

      if (consumer) {
        consumer.stats.messagesFailed++;
      }

      await this.sendToDLQ(message, error as Error);
      this.nack(message, false);
    }
  }

  async handleMetricsMessage(message: ConsumeMessage): Promise<void> {
    const consumer = this.consumers.get(this.config.metricsQueue);
    if (consumer) {
      consumer.stats.messagesConsumed++;
      consumer.stats.lastMessageTime = Date.now();
    }

    try {
      if (await this.isBackpressured()) {
        this.pauseConsumer(this.config.metricsQueue);
        if (consumer) {
          consumer.stats.messagesRequeued = (consumer.stats.messagesRequeued || 0) + 1;
        }
        await this.requeueWithDelay(message);
        return;
      }

      const content = message.content.toString();
      const parsed = safeJSONParse<MetricsData>(content);

      if (!parsed || !validateMetricsData(parsed)) {
        throw new MessageProcessingError('Invalid metrics data format', undefined, {
          content: content.substring(0, 200)
        });
      }

      if (this.onMessageCallback) {
        await this.onMessageCallback(parsed, 'metrics');
      }

      this.ack(message);

      if (consumer) {
        consumer.stats.messagesProcessed++;
      }
    } catch (error) {
      this.logger.error('Failed to process metrics message', {
        error: (error as Error).message,
        messageId: message.properties.messageId
      });

      if (consumer) {
        consumer.stats.messagesFailed++;
      }

      await this.sendToDLQ(message, error as Error);
      this.nack(message, false);
    }
  }

  async sendToDLQ(message: ConsumeMessage, error: Error): Promise<void> {
    if (!this.channel) {
      this.logger.error('Cannot send to DLQ: channel not initialized');
      return;
    }

    try {
      const dlqMessage = {
        originalContent: message.content.toString(),
        error: {
          message: error.message,
          stack: error.stack
        },
        timestamp: Date.now(),
        originalQueue: message.fields.routingKey,
        headers: message.properties.headers,
        requeueCount: this.getRequeueCount(message)
      };

      const sent = this.channel.publish(
        this.config.dlqExchange,
        this.config.dlqQueue,
        Buffer.from(JSON.stringify(dlqMessage)),
        {
          persistent: true,
          messageId: message.properties.messageId || `dlq-${Date.now()}`
        }
      );

      if (!sent) {
        this.logger.warn('DLQ message buffer is full, message may be lost');
      }

      this.logger.info('Message sent to DLQ', {
        messageId: message.properties.messageId,
        originalQueue: message.fields.routingKey
      });
    } catch (dlqError) {
      this.logger.error('Failed to send message to DLQ', {
        error: (dlqError as Error).message,
        originalError: error.message
      });
    }
  }

  private ack(message: ConsumeMessage): void {
    if (this.channel) {
      this.channel.ack(message);
    }
  }

  private nack(message: ConsumeMessage, requeue: boolean = true): void {
    if (this.channel) {
      this.channel.nack(message, false, requeue);
    }
  }

  private handleConnectionError(error: Error): void {
    this.logger.error('RabbitMQ connection error', { error: error.message });
    this.scheduleReconnect();
  }

  private handleConnectionClose(): void {
    this.logger.warn('RabbitMQ connection closed');
    this.scheduleReconnect();
  }

  private async scheduleReconnect(): Promise<void> {
    if (this.reconnecting) return;

    this.reconnecting = true;
    this.reconnectAttempts++;

    if (this.reconnectAttempts > this.maxReconnectAttempts) {
      this.logger.error('Max reconnect attempts reached, giving up');
      this.reconnecting = false;
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 30000);
    this.logger.info(`Scheduling reconnect in ${delay}ms`, { attempt: this.reconnectAttempts });

    setTimeout(async () => {
      try {
        await this.connect();
        await this.restartConsumers();
      } catch (error) {
        this.logger.error('Reconnect failed', { error: (error as Error).message });
        this.reconnecting = false;
        this.scheduleReconnect();
      }
    }, delay);
  }

  private async restartConsumers(): Promise<void> {
    for (const [queueName, consumer] of this.consumers) {
      this.logger.info('Restarting consumer for queue', { queueName });
      await this.startConsuming(queueName, consumer.handler, {
        prefetch: consumer.stats.prefetchCount
      });
    }
  }

  async getQueueMessageCount(queueName: string): Promise<number> {
    if (!this.channel) return 0;

    try {
      const queueInfo = await this.channel.assertQueue(queueName, { passive: true });
      return queueInfo.messageCount;
    } catch (error) {
      this.logger.warn('Failed to get queue message count', { queueName, error: (error as Error).message });
      return 0;
    }
  }

  getConsumerStats(): ConsumerStats[] {
    return Array.from(this.consumers.values()).map(c => ({ ...c.stats }));
  }

  isConnected(): boolean {
    return this.connection !== null && !this.connection.connection.stream.destroyed;
  }

  async disconnect(): Promise<void> {
    this.logger.info('Disconnecting from RabbitMQ...');

    for (const queueName of this.consumers.keys()) {
      await this.stopConsuming(queueName);
    }

    if (this.channel) {
      await this.channel.close();
      this.channel = null;
    }

    if (this.connection) {
      await this.connection.close();
      this.connection = null;
    }

    this.logger.info('Disconnected from RabbitMQ');
  }
}
