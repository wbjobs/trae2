import amqp, { Connection, Channel, ConsumeMessage } from 'amqplib';
import { config } from '../config/environment';
import logger from '../utils/logger';
import { AlarmEvent, TerminalData } from '../types';
import { messagePushService } from './message-push.service';

export interface QueueMessage<T = unknown> {
  type: string;
  payload: T;
  timestamp: number;
  messageId: string;
}

export class MessageQueueService {
  private connection: Connection | null = null;
  private channel: Channel | null = null;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;
  private reconnectDelay: number = 5000;
  private publishedAlarmIds: Set<string> = new Set();
  private failedMessages: Array<{ queue: string; message: QueueMessage; error: string }> = [];

  constructor() {}

  public async connect(): Promise<void> {
    try {
      const url = `amqp://${config.rabbitmq.username}:${config.rabbitmq.password}@${config.rabbitmq.host}:${config.rabbitmq.port}`;
      this.connection = await amqp.connect(url);
      this.channel = await this.connection.createChannel();

      await this.setupExchangeAndQueues();

      await this.channel.prefetch(100);

      this.connection.on('error', (err) => {
        logger.error('RabbitMQ connection error:', err);
        this.reconnect();
      });

      this.connection.on('close', () => {
        logger.warn('RabbitMQ connection closed, attempting reconnect...');
        this.reconnect();
      });

      this.connection.on('blocked', (reason) => {
        logger.warn('RabbitMQ connection blocked:', { reason });
      });

      this.connection.on('unblocked', () => {
        logger.info('RabbitMQ connection unblocked');
      });

      this.reconnectAttempts = 0;
      logger.info('Connected to RabbitMQ successfully');

      await this.startConsumers();
    } catch (err) {
      logger.error('Failed to connect to RabbitMQ:', err);
      this.reconnect();
    }
  }

  private async setupExchangeAndQueues(): Promise<void> {
    if (!this.channel) return;

    const alarmDLX = `${config.rabbitmq.alarmQueue}_dlx`;
    const alarmDLQ = `${config.rabbitmq.alarmQueue}_dlq`;
    const dataDLX = `${config.rabbitmq.dataQueue}_dlx`;
    const dataDLQ = `${config.rabbitmq.dataQueue}_dlq`;

    await this.channel.assertExchange(alarmDLX, 'direct', { durable: true });
    await this.channel.assertQueue(alarmDLQ, { durable: true });
    await this.channel.bindQueue(alarmDLQ, alarmDLX, alarmDLQ);

    await this.channel.assertExchange(dataDLX, 'direct', { durable: true });
    await this.channel.assertQueue(dataDLQ, { durable: true });
    await this.channel.bindQueue(dataDLQ, dataDLX, dataDLQ);

    await this.channel.assertQueue(config.rabbitmq.alarmQueue, {
      durable: true,
      deadLetterExchange: alarmDLX,
      deadLetterRoutingKey: alarmDLQ,
    });

    await this.channel.assertQueue(config.rabbitmq.dataQueue, {
      durable: true,
      deadLetterExchange: dataDLX,
      deadLetterRoutingKey: dataDLQ,
    });

    logger.info('Exchanges and queues configured with dead letter support');
  }

  private async reconnect(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('Max reconnect attempts reached for RabbitMQ');
      return;
    }

    this.reconnectAttempts++;
    logger.info(
      `Attempting to reconnect to RabbitMQ (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`
    );

    setTimeout(() => {
      this.connect();
    }, this.reconnectDelay * this.reconnectAttempts);
  }

  private async startConsumers(): Promise<void> {
    if (!this.channel) return;

    await this.consumeAlarmQueue();
    await this.consumeDataQueue();
  }

  private async consumeAlarmQueue(): Promise<void> {
    if (!this.channel) return;

    logger.info('Starting alarm queue consumer');
    await this.channel.consume(
      config.rabbitmq.alarmQueue,
      async (msg: ConsumeMessage | null) => {
        if (!msg) return;

        try {
          const content = msg.content.toString();
          const message: QueueMessage<AlarmEvent> = JSON.parse(content);

          if (this.publishedAlarmIds.has(message.messageId)) {
            logger.debug('Duplicate alarm message ignored:', {
              messageId: message.messageId,
              alarmId: message.payload.id,
            });
            this.channel?.ack(msg);
            return;
          }
          this.publishedAlarmIds.add(message.messageId);

          logger.debug('Received alarm message from queue:', {
            messageId: message.messageId,
            alarmId: message.payload.id,
            terminalId: message.payload.terminalId,
          });

          await messagePushService.pushAlarm(message.payload);
          this.channel?.ack(msg);

          setTimeout(() => {
            this.publishedAlarmIds.delete(message.messageId);
          }, 60000);
        } catch (err) {
          logger.error('Error processing alarm message:', err);
          this.failedMessages.push({
            queue: config.rabbitmq.alarmQueue,
            message: JSON.parse(msg.content.toString()),
            error: err instanceof Error ? err.message : String(err),
          });
          this.channel?.nack(msg, false, false);
        }
      },
      { noAck: false }
    );
  }

  private async consumeDataQueue(): Promise<void> {
    if (!this.channel) return;

    logger.info('Starting data queue consumer');
    await this.channel.consume(
      config.rabbitmq.dataQueue,
      async (msg: ConsumeMessage | null) => {
        if (!msg) return;

        try {
          const content = msg.content.toString();
          const message: QueueMessage<TerminalData> = JSON.parse(content);

          logger.debug('Received data message from queue:', {
            messageId: message.messageId,
            terminalId: message.payload.terminalId,
          });

          this.channel?.ack(msg);
        } catch (err) {
          logger.error('Error processing data message:', err);
          this.failedMessages.push({
            queue: config.rabbitmq.dataQueue,
            message: JSON.parse(msg.content.toString()),
            error: err instanceof Error ? err.message : String(err),
          });
          this.channel?.nack(msg, false, false);
        }
      },
      { noAck: false }
    );
  }

  public async publishAlarm(alarm: AlarmEvent): Promise<boolean> {
    if (!this.channel) {
      logger.warn('RabbitMQ channel not available, alarm not published');
      return false;
    }

    try {
      const message: QueueMessage<AlarmEvent> = {
        type: 'ALARM',
        payload: alarm,
        timestamp: Date.now(),
        messageId: alarm.id,
      };

      const buffer = Buffer.from(JSON.stringify(message));
      const success = this.channel.sendToQueue(
        config.rabbitmq.alarmQueue,
        buffer,
        {
          persistent: true,
          messageId: alarm.id,
          timestamp: Date.now(),
        }
      );

      if (success) {
        logger.debug('Alarm published to queue:', { alarmId: alarm.id });
      } else {
        logger.warn('Alarm queue is full, message may be lost:', {
          alarmId: alarm.id,
        });
      }

      return success;
    } catch (err) {
      logger.error('Failed to publish alarm:', err);
      return false;
    }
  }

  public async publishData(
    data: TerminalData,
    messageId: string
  ): Promise<boolean> {
    if (!this.channel) {
      logger.warn('RabbitMQ channel not available, data not published');
      return false;
    }

    try {
      const message: QueueMessage<TerminalData> = {
        type: 'TERMINAL_DATA',
        payload: data,
        timestamp: Date.now(),
        messageId,
      };

      const buffer = Buffer.from(JSON.stringify(message));
      const success = this.channel.sendToQueue(
        config.rabbitmq.dataQueue,
        buffer,
        {
          persistent: true,
          messageId,
          timestamp: Date.now(),
        }
      );

      return success;
    } catch (err) {
      logger.error('Failed to publish data:', err);
      return false;
    }
  }

  public async publishBatchAlarms(alarms: AlarmEvent[]): Promise<boolean[]> {
    const results = await Promise.all(
      alarms.map((alarm) => this.publishAlarm(alarm))
    );
    return results;
  }

  public async getQueueStats(): Promise<{
    alarmQueue: { messageCount: number; consumerCount: number };
    dataQueue: { messageCount: number; consumerCount: number };
    failedMessages: number;
  }> {
    if (!this.channel) {
      throw new Error('Channel not available');
    }

    const alarmQueueInfo = await this.channel.checkQueue(
      config.rabbitmq.alarmQueue
    );
    const dataQueueInfo = await this.channel.checkQueue(
      config.rabbitmq.dataQueue
    );

    return {
      alarmQueue: {
        messageCount: alarmQueueInfo.messageCount,
        consumerCount: alarmQueueInfo.consumerCount,
      },
      dataQueue: {
        messageCount: dataQueueInfo.messageCount,
        consumerCount: dataQueueInfo.consumerCount,
      },
      failedMessages: this.failedMessages.length,
    };
  }

  public getFailedMessages(): Array<{
    queue: string;
    message: QueueMessage;
    error: string;
  }> {
    return [...this.failedMessages];
  }

  public clearFailedMessages(): void {
    this.failedMessages = [];
  }

  public isConnected(): boolean {
    return !!this.connection && !!this.channel;
  }

  public async close(): Promise<void> {
    try {
      if (this.channel) {
        await this.channel.close();
      }
      if (this.connection) {
        await this.connection.close();
      }
      this.publishedAlarmIds.clear();
      this.failedMessages = [];
      logger.info('RabbitMQ connection closed gracefully');
    } catch (err) {
      logger.error('Error closing RabbitMQ connection:', err);
    }
  }
}

export const messageQueueService = new MessageQueueService();
