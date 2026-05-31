import { v4 as uuidv4 } from 'uuid';
import axios, { AxiosError } from 'axios';
import {
  CallbackEvent,
  CallbackSubscription,
  CallbackDelivery,
  CallbackEventType,
  CallbackSubscriptionRequest,
} from '../models/callback';
import { redisClient } from '../cache/redis';
import logger from '../utils/logger';

const SUBSCRIPTION_KEY_PREFIX = 'callback:subscription:';
const EVENT_KEY_PREFIX = 'callback:event:';
const DELIVERY_KEY_PREFIX = 'callback:delivery:';
const EVENT_QUEUE_KEY = 'callback:queue';
const DLQ_KEY = 'callback:dlq';
const PROCESSED_EVENTS_KEY = 'callback:processed';
const FAILURE_COUNT_PREFIX = 'callback:failures:';
const MAX_RETRY_ATTEMPTS = 5;
const RETRY_DELAY_BASE = 1000;
const MAX_BATCH_SIZE = 50;
const CIRCUIT_BREAKER_THRESHOLD = 10;
const CIRCUIT_BREAKER_TIMEOUT = 60000;
const PROCESSED_EVENT_TTL = 60 * 60 * 24;

class CircuitBreaker {
  private failures: Map<string, number> = new Map();
  private openedAt: Map<string, number> = new Map();

  isOpen(url: string): boolean {
    const opened = this.openedAt.get(url);
    if (!opened) return false;
    
    if (Date.now() - opened > CIRCUIT_BREAKER_TIMEOUT) {
      this.openedAt.delete(url);
      this.failures.set(url, 0);
      return false;
    }
    return true;
  }

  recordFailure(url: string): void {
    const count = (this.failures.get(url) || 0) + 1;
    this.failures.set(url, count);
    
    if (count >= CIRCUIT_BREAKER_THRESHOLD) {
      this.openedAt.set(url, Date.now());
      logger.warn('回调熔断触发', { url, failures: count });
    }
  }

  recordSuccess(url: string): void {
    this.failures.set(url, 0);
    this.openedAt.delete(url);
  }
}

class CallbackService {
  private circuitBreaker: CircuitBreaker = new CircuitBreaker();
  private processingEvents: Set<string> = new Set();
  private subscriptionCache: Map<string, CallbackSubscription[]> = new Map();
  private cacheExpiry: Map<string, number> = new Map();
  private CACHE_TTL = 5000;

  async createSubscription(
    request: CallbackSubscriptionRequest,
    createdBy: string,
  ): Promise<CallbackSubscription | null> {
    try {
      const subscription: CallbackSubscription = {
        id: uuidv4(),
        url: request.url,
        eventTypes: request.eventTypes,
        taskId: request.taskId,
        deviceId: request.deviceId,
        createdBy,
        createdAt: Date.now(),
        enabled: true,
        secret: request.secret,
      };

      const subKey = `${SUBSCRIPTION_KEY_PREFIX}${subscription.id}`;
      await redisClient.set(subKey, JSON.stringify(subscription));

      this.invalidateSubscriptionCache();

      logger.info('回调订阅创建成功', {
        subscriptionId: subscription.id,
        url: subscription.url,
        eventTypes: subscription.eventTypes,
      });

      return subscription;
    } catch (err) {
      logger.error('创建回调订阅失败', { error: err, request });
      return null;
    }
  }

  async getSubscription(subscriptionId: string): Promise<CallbackSubscription | null> {
    try {
      const subKey = `${SUBSCRIPTION_KEY_PREFIX}${subscriptionId}`;
      const subStr = await redisClient.get(subKey);
      if (!subStr) return null;
      return JSON.parse(subStr) as CallbackSubscription;
    } catch (err) {
      logger.error('获取订阅信息失败', { subscriptionId, error: err });
      return null;
    }
  }

  async deleteSubscription(subscriptionId: string): Promise<boolean> {
    try {
      const subKey = `${SUBSCRIPTION_KEY_PREFIX}${subscriptionId}`;
      await redisClient.del(subKey);
      this.invalidateSubscriptionCache();
      logger.info('回调订阅已删除', { subscriptionId });
      return true;
    } catch (err) {
      logger.error('删除回调订阅失败', { subscriptionId, error: err });
      return false;
    }
  }

  private invalidateSubscriptionCache(): void {
    this.subscriptionCache.clear();
    this.cacheExpiry.clear();
  }

  async isEventProcessed(eventId: string): Promise<boolean> {
    try {
      const client = redisClient.getClient();
      if (!client) return false;
      const result = await client.sismember(PROCESSED_EVENTS_KEY, eventId);
      return result === 1;
    } catch (err) {
      logger.error('检查事件处理状态失败', { eventId, error: err });
      return false;
    }
  }

  async markEventProcessed(eventId: string): Promise<void> {
    try {
      const client = redisClient.getClient();
      if (!client) return;
      await client.sadd(PROCESSED_EVENTS_KEY, eventId);
      await client.expire(PROCESSED_EVENTS_KEY, PROCESSED_EVENT_TTL);
    } catch (err) {
      logger.error('标记事件处理完成失败', { eventId, error: err });
    }
  }

  async createEvent(
    type: CallbackEventType,
    payload: Record<string, any>,
    taskId?: string,
    deviceId?: string,
  ): Promise<CallbackEvent | null> {
    try {
      const client = redisClient.getClient();
      if (!client) return null;

      const event: CallbackEvent = {
        id: uuidv4(),
        type,
        taskId,
        deviceId,
        timestamp: Date.now(),
        payload,
      };

      const eventKey = `${EVENT_KEY_PREFIX}${event.id}`;
      await redisClient.set(eventKey, JSON.stringify(event), 60 * 60 * 24 * 7);
      
      await client.lpush(EVENT_QUEUE_KEY, event.id);

      logger.debug('回调事件已创建', {
        eventId: event.id,
        eventType: event.type,
        taskId: event.taskId,
        deviceId: event.deviceId,
      });

      return event;
    } catch (err) {
      logger.error('创建回调事件失败', { error: err, type, payload });
      return null;
    }
  }

  async getSubscriptionsForEvent(
    eventType: CallbackEventType,
    taskId?: string,
    deviceId?: string,
  ): Promise<CallbackSubscription[]> {
    try {
      const cacheKey = `${eventType}:${taskId || 'all'}:${deviceId || 'all'}`;
      const now = Date.now();
      
      if (this.cacheExpiry.get(cacheKey) && this.cacheExpiry.get(cacheKey)! > now) {
        return this.subscriptionCache.get(cacheKey) || [];
      }

      const client = redisClient.getClient();
      if (!client) return [];

      const pattern = `${SUBSCRIPTION_KEY_PREFIX}*`;
      const keys = await client.keys(pattern);
      const subscriptions: CallbackSubscription[] = [];

      for (const key of keys) {
        const subStr = await client.get(key);
        if (!subStr) continue;

        const sub = JSON.parse(subStr) as CallbackSubscription;
        if (!sub.enabled) continue;
        if (!sub.eventTypes.includes(eventType)) continue;

        if (taskId && sub.taskId && sub.taskId !== taskId) continue;
        if (deviceId && sub.deviceId && sub.deviceId !== deviceId) continue;

        subscriptions.push(sub);
      }

      this.subscriptionCache.set(cacheKey, subscriptions);
      this.cacheExpiry.set(cacheKey, now + this.CACHE_TTL);

      return subscriptions;
    } catch (err) {
      logger.error('获取事件订阅列表失败', { error: err });
      return [];
    }
  }

  async moveToDLQ(delivery: CallbackDelivery, event: CallbackEvent): Promise<void> {
    try {
      const client = redisClient.getClient();
      if (!client) return;

      const dlqItem = {
        delivery,
        event,
        movedAt: Date.now(),
        reason: delivery.errorMessage || 'Max retries exceeded',
      };

      await client.lpush(DLQ_KEY, JSON.stringify(dlqItem));
      logger.error('回调消息已移入死信队列', {
        eventId: event.id,
        eventType: event.type,
        url: delivery.url,
        attemptCount: delivery.attemptCount,
      });
    } catch (err) {
      logger.error('移入死信队列失败', { error: err });
    }
  }

  async deliverCallback(
    subscription: CallbackSubscription,
    event: CallbackEvent,
  ): Promise<CallbackDelivery> {
    const delivery: CallbackDelivery = {
      id: uuidv4(),
      subscriptionId: subscription.id,
      eventId: event.id,
      url: subscription.url,
      status: 'pending',
      attemptCount: 0,
    };

    if (this.circuitBreaker.isOpen(subscription.url)) {
      delivery.status = 'failed';
      delivery.errorMessage = 'Circuit breaker is open';
      logger.warn('回调熔断已打开，跳过推送', { url: subscription.url, eventId: event.id });
      return delivery;
    }

    try {
      const webhookPayload = {
        eventId: event.id,
        eventType: event.type,
        timestamp: event.timestamp,
        taskId: event.taskId,
        deviceId: event.deviceId,
        data: event.payload,
      };

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Event-Id': event.id,
      };

      if (subscription.secret) {
        headers['X-Webhook-Signature'] = subscription.secret;
      }

      const response = await axios.post(subscription.url, webhookPayload, {
        headers,
        timeout: 5000,
      });

      delivery.status = 'success';
      delivery.attemptCount = 1;
      delivery.lastAttemptAt = Date.now();
      delivery.responseStatus = response.status;

      this.circuitBreaker.recordSuccess(subscription.url);

      logger.info('回调推送成功', {
        deliveryId: delivery.id,
        eventType: event.type,
        url: subscription.url,
        status: response.status,
      });
    } catch (err: any) {
      delivery.attemptCount = 1;
      delivery.lastAttemptAt = Date.now();
      delivery.errorMessage = err.message || 'Unknown error';
      delivery.responseStatus = err.response?.status;

      this.circuitBreaker.recordFailure(subscription.url);

      if (delivery.attemptCount < MAX_RETRY_ATTEMPTS) {
        delivery.status = 'retrying';
        delivery.nextRetryAt = Date.now() + RETRY_DELAY_BASE * Math.pow(2, delivery.attemptCount - 1);
      } else {
        delivery.status = 'failed';
        await this.moveToDLQ(delivery, event);
      }

      logger.warn('回调推送失败', {
        deliveryId: delivery.id,
        eventType: event.type,
        url: subscription.url,
        error: err.message,
        attemptCount: delivery.attemptCount,
        willRetry: delivery.status === 'retrying',
      });
    }

    const deliveryKey = `${DELIVERY_KEY_PREFIX}${delivery.id}`;
    await redisClient.set(deliveryKey, JSON.stringify(delivery), 60 * 60 * 24 * 7);

    return delivery;
  }

  async retryDelivery(delivery: CallbackDelivery, event: CallbackEvent, subscription: CallbackSubscription): Promise<CallbackDelivery> {
    if (this.circuitBreaker.isOpen(subscription.url)) {
      delivery.status = 'failed';
      delivery.errorMessage = 'Circuit breaker is open';
      return delivery;
    }

    try {
      const webhookPayload = {
        eventId: event.id,
        eventType: event.type,
        timestamp: event.timestamp,
        taskId: event.taskId,
        deviceId: event.deviceId,
        data: event.payload,
      };

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Event-Id': event.id,
        'X-Retry-Count': String(delivery.attemptCount),
      };

      if (subscription.secret) {
        headers['X-Webhook-Signature'] = subscription.secret;
      }

      const response = await axios.post(subscription.url, webhookPayload, {
        headers,
        timeout: 5000,
      });

      delivery.status = 'success';
      delivery.attemptCount += 1;
      delivery.lastAttemptAt = Date.now();
      delivery.responseStatus = response.status;
      delivery.nextRetryAt = undefined;

      this.circuitBreaker.recordSuccess(subscription.url);

      logger.info('回调重试成功', {
        deliveryId: delivery.id,
        eventType: event.type,
        url: subscription.url,
        attemptCount: delivery.attemptCount,
      });
    } catch (err: any) {
      delivery.attemptCount += 1;
      delivery.lastAttemptAt = Date.now();
      delivery.errorMessage = err.message || 'Unknown error';
      delivery.responseStatus = err.response?.status;

      this.circuitBreaker.recordFailure(subscription.url);

      if (delivery.attemptCount < MAX_RETRY_ATTEMPTS) {
        delivery.status = 'retrying';
        delivery.nextRetryAt = Date.now() + RETRY_DELAY_BASE * Math.pow(2, delivery.attemptCount - 1);
      } else {
        delivery.status = 'failed';
        await this.moveToDLQ(delivery, event);
      }

      logger.warn('回调重试失败', {
        deliveryId: delivery.id,
        eventType: event.type,
        url: subscription.url,
        attemptCount: delivery.attemptCount,
        willRetry: delivery.status === 'retrying',
      });
    }

    const deliveryKey = `${DELIVERY_KEY_PREFIX}${delivery.id}`;
    await redisClient.set(deliveryKey, JSON.stringify(delivery), 60 * 60 * 24 * 7);

    return delivery;
  }

  async processEventQueue(): Promise<number> {
    try {
      const client = redisClient.getClient();
      if (!client) return 0;

      const eventIds: string[] = [];
      for (let i = 0; i < MAX_BATCH_SIZE; i++) {
        const eventId = await client.rpop(EVENT_QUEUE_KEY);
        if (!eventId) break;
        
        if (this.processingEvents.has(eventId)) continue;
        if (await this.isEventProcessed(eventId)) continue;
        
        eventIds.push(eventId);
        this.processingEvents.add(eventId);
      }

      if (eventIds.length === 0) return 0;

      logger.debug('开始批量处理回调事件', { batchSize: eventIds.length });

      let processedCount = 0;
      for (const eventId of eventIds) {
        try {
          const eventKey = `${EVENT_KEY_PREFIX}${eventId}`;
          const eventStr = await client.get(eventKey);
          if (!eventStr) {
            this.processingEvents.delete(eventId);
            continue;
          }

          const event = JSON.parse(eventStr) as CallbackEvent;
          const subscriptions = await this.getSubscriptionsForEvent(
            event.type,
            event.taskId,
            event.deviceId,
          );

          for (const subscription of subscriptions) {
            try {
              await this.deliverCallback(subscription, event);
            } catch (subErr: any) {
              logger.error('单个订阅推送失败', {
                subscriptionId: subscription.id,
                eventId: event.id,
                error: subErr.message,
              });
            }
          }

          await this.markEventProcessed(eventId);
          processedCount++;
        } catch (eventErr: any) {
          logger.error('处理单个事件失败', { eventId, error: eventErr.message });
        } finally {
          this.processingEvents.delete(eventId);
        }
      }

      return processedCount;
    } catch (err) {
      logger.error('处理事件队列失败', { error: err });
      return 0;
    }
  }

  async retryFailedDeliveries(): Promise<number> {
    try {
      const client = redisClient.getClient();
      if (!client) return 0;

      const pattern = `${DELIVERY_KEY_PREFIX}*`;
      const keys = await client.keys(pattern);
      const now = Date.now();
      let retryCount = 0;

      for (const key of keys) {
        try {
          const deliveryStr = await client.get(key);
          if (!deliveryStr) continue;

          const delivery = JSON.parse(deliveryStr) as CallbackDelivery;
          if (delivery.status !== 'retrying') continue;
          if (delivery.nextRetryAt && delivery.nextRetryAt > now) continue;

          const subscription = await this.getSubscription(delivery.subscriptionId);
          const eventKey = `${EVENT_KEY_PREFIX}${delivery.eventId}`;
          const eventStr = await client.get(eventKey);

          if (!subscription || !eventStr) {
            delivery.status = 'failed';
            await client.set(key, JSON.stringify(delivery));
            continue;
          }

          const event = JSON.parse(eventStr) as CallbackEvent;
          await this.retryDelivery(delivery, event, subscription);
          retryCount++;
        } catch (keyErr: any) {
          logger.error('处理单个重试失败', { key, error: keyErr.message });
        }
      }

      return retryCount;
    } catch (err) {
      logger.error('重试失败回调失败', { error: err });
      return 0;
    }
  }

  async getDLQCount(): Promise<number> {
    try {
      const client = redisClient.getClient();
      if (!client) return 0;
      return await client.llen(DLQ_KEY);
    } catch (err) {
      logger.error('获取死信队列长度失败', { error: err });
      return 0;
    }
  }

  async triggerTaskStatusChange(
    taskId: string,
    oldStatus: string,
    newStatus: string,
    progress?: number,
  ): Promise<void> {
    await this.createEvent(
      'task_status_changed',
      {
        taskId,
        oldStatus,
        newStatus,
        progress,
        timestamp: Date.now(),
      },
      taskId,
    );
  }

  async triggerDataReceived(
    radarId: string,
    dataId: string,
    dataType: string,
  ): Promise<void> {
    await this.createEvent(
      'data_received',
      {
        radarId,
        dataId,
        dataType,
        timestamp: Date.now(),
      },
      undefined,
      radarId,
    );
  }

  async triggerDeviceStatusChange(
    deviceId: string,
    oldStatus: string,
    newStatus: string,
  ): Promise<void> {
    await this.createEvent(
      'device_status_changed',
      {
        deviceId,
        oldStatus,
        newStatus,
        timestamp: Date.now(),
      },
      undefined,
      deviceId,
    );
  }

  async getAllSubscriptions(): Promise<CallbackSubscription[]> {
    try {
      const client = redisClient.getClient();
      if (!client) return [];

      const pattern = `${SUBSCRIPTION_KEY_PREFIX}*`;
      const keys = await client.keys(pattern);
      const subscriptions: CallbackSubscription[] = [];

      for (const key of keys) {
        const subStr = await client.get(key);
        if (subStr) {
          subscriptions.push(JSON.parse(subStr));
        }
      }

      return subscriptions;
    } catch (err) {
      logger.error('获取所有订阅失败', { error: err });
      return [];
    }
  }

  getProcessingEventCount(): number {
    return this.processingEvents.size;
  }
}

export const callbackService = new CallbackService();
