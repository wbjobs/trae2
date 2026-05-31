import axios from 'axios';
import { AlarmEvent, AlarmLevel } from '../types';
import { config } from '../config/environment';
import logger from '../utils/logger';

export interface PushChannel {
  name: string;
  enabled: boolean;
  levels: AlarmLevel[];
  send: (alarm: AlarmEvent) => Promise<boolean>;
}

export class MessagePushService {
  private channels: Map<string, PushChannel>;
  private retryAttempts: number = 3;
  private retryDelay: number = 1000;
  private pushedAlarms: Map<string, { timestamp: number; channels: string[] }>;
  private pushCleanup: NodeJS.Timeout;
  private idempotencyTtl: number = 60000;

  constructor() {
    this.channels = new Map();
    this.pushedAlarms = new Map();
    this.initializeChannels();

    this.pushCleanup = setInterval(() => {
      const now = Date.now();
      for (const [alarmId, record] of this.pushedAlarms.entries()) {
        if (now - record.timestamp > this.idempotencyTtl) {
          this.pushedAlarms.delete(alarmId);
        }
      }
    }, 30000);
  }

  private initializeChannels(): void {
    if (config.alarm.webhookUrl) {
      this.registerChannel({
        name: 'webhook',
        enabled: true,
        levels: [AlarmLevel.WARNING, AlarmLevel.CRITICAL, AlarmLevel.FATAL],
        send: this.sendWebhook.bind(this),
      });
    }

    if (config.alarm.smsGateway) {
      this.registerChannel({
        name: 'sms',
        enabled: true,
        levels: [AlarmLevel.CRITICAL, AlarmLevel.FATAL],
        send: this.sendSms.bind(this),
      });
    }

    if (config.alarm.emailHost) {
      this.registerChannel({
        name: 'email',
        enabled: true,
        levels: [AlarmLevel.WARNING, AlarmLevel.CRITICAL, AlarmLevel.FATAL],
        send: this.sendEmail.bind(this),
      });
    }

    this.registerChannel({
      name: 'console',
      enabled: true,
      levels: Object.values(AlarmLevel),
      send: this.sendConsole.bind(this),
    });
  }

  public registerChannel(channel: PushChannel): void {
    this.channels.set(channel.name, channel);
    logger.info('Push channel registered:', { channelName: channel.name });
  }

  public unregisterChannel(channelName: string): boolean {
    const deleted = this.channels.delete(channelName);
    if (deleted) {
      logger.info('Push channel unregistered:', { channelName });
    }
    return deleted;
  }

  public async pushAlarm(alarm: AlarmEvent): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();
    const alarmKey = `${alarm.id}:${alarm.terminalId}`;

    const existing = this.pushedAlarms.get(alarmKey);
    const now = Date.now();
    const pushedChannels: string[] = [];

    for (const [name, channel] of this.channels) {
      if (!channel.enabled) continue;
      if (!channel.levels.includes(alarm.alarmLevel)) continue;

      if (existing && existing.channels.includes(name) && 
          now - existing.timestamp < this.idempotencyTtl) {
        logger.debug('Alarm already pushed via channel, skipping:', {
          alarmId: alarm.id,
          channelName: name,
          terminalId: alarm.terminalId,
        });
        results.set(name, true);
        continue;
      }

      const success = await this.sendWithRetry(channel, alarm);
      results.set(name, success);
      if (success) {
        pushedChannels.push(name);
      }

      if (!success) {
        logger.error('Failed to push alarm via channel:', {
          channelName: name,
          alarmId: alarm.id,
          terminalId: alarm.terminalId,
        });
      }
    }

    if (pushedChannels.length > 0) {
      this.pushedAlarms.set(alarmKey, {
        timestamp: now,
        channels: pushedChannels,
      });
    }

    return results;
  }

  private async sendWithRetry(
    channel: PushChannel,
    alarm: AlarmEvent
  ): Promise<boolean> {
    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        const success = await channel.send(alarm);
        if (success) {
          return true;
        }
      } catch (err) {
        logger.warn('Push attempt failed:', {
          channelName: channel.name,
          attempt,
          alarmId: alarm.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      if (attempt < this.retryAttempts) {
        await this.delay(this.retryDelay * attempt);
      }
    }
    return false;
  }

  public async pushBatchAlarms(alarms: AlarmEvent[]): Promise<void> {
    const sortedAlarms = [...alarms].sort((a, b) => {
      const levelOrder: Record<AlarmLevel, number> = {
        [AlarmLevel.FATAL]: 4,
        [AlarmLevel.CRITICAL]: 3,
        [AlarmLevel.WARNING]: 2,
        [AlarmLevel.INFO]: 1,
      };
      return levelOrder[b.alarmLevel] - levelOrder[a.alarmLevel];
    });

    const results = await Promise.allSettled(
      sortedAlarms.map((alarm) => this.pushAlarm(alarm))
    );

    const failedCount = results.filter(
      (r) => r.status === 'rejected'
    ).length;

    if (failedCount > 0) {
      logger.warn('Batch push completed with failures:', {
        total: alarms.length,
        failed: failedCount,
      });
    }
  }

  private async sendWebhook(alarm: AlarmEvent): Promise<boolean> {
    try {
      const payload = {
        alarmId: alarm.id,
        terminalId: alarm.terminalId,
        alarmLevel: alarm.alarmLevel,
        metricName: alarm.metricName,
        metricValue: alarm.metricValue,
        message: alarm.message,
        timestamp: alarm.timestamp,
        thresholdRule: alarm.thresholdRule,
      };

      const response = await axios.post(config.alarm.webhookUrl, payload, {
        timeout: 5000,
        headers: { 'Content-Type': 'application/json' },
      });

      return response.status >= 200 && response.status < 300;
    } catch (err) {
      logger.error('Webhook send failed:', err);
      return false;
    }
  }

  private async sendSms(alarm: AlarmEvent): Promise<boolean> {
    try {
      const message = `[${alarm.alarmLevel.toUpperCase()}] 终端${alarm.terminalId}: ${alarm.message}`;
      const response = await axios.post(
        config.alarm.smsGateway,
        {
          to: ['13800138000', '13900139000'],
          content: message.substring(0, 200),
        },
        { timeout: 5000 }
      );
      return response.status >= 200 && response.status < 300;
    } catch (err) {
      logger.error('SMS send failed:', err);
      return false;
    }
  }

  private async sendEmail(alarm: AlarmEvent): Promise<boolean> {
    logger.info('Email notification (simulated):', {
      to: 'admin@powergrid.com',
      subject: `[${alarm.alarmLevel.toUpperCase()}] 告警通知 - ${alarm.terminalId}`,
      body: alarm.message,
      alarmId: alarm.id,
    });
    return true;
  }

  private async sendConsole(alarm: AlarmEvent): Promise<boolean> {
    const levelColors: Record<AlarmLevel, string> = {
      [AlarmLevel.INFO]: '\x1b[36m',
      [AlarmLevel.WARNING]: '\x1b[33m',
      [AlarmLevel.CRITICAL]: '\x1b[31m',
      [AlarmLevel.FATAL]: '\x1b[41m',
    };

    const reset = '\x1b[0m';
    const color = levelColors[alarm.alarmLevel] || reset;

    console.log(
      `${color}[${new Date(alarm.timestamp).toLocaleString()}] [${alarm.alarmLevel.toUpperCase()}] [${alarm.terminalId}] ${alarm.message}${reset}`
    );
    return true;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  public getChannelStatus(): Record<
    string,
    { enabled: boolean; levels: AlarmLevel[] }
  > {
    const status: Record<
      string,
      { enabled: boolean; levels: AlarmLevel[] }
    > = {};
    for (const [name, channel] of this.channels) {
      status[name] = {
        enabled: channel.enabled,
        levels: channel.levels,
      };
    }
    return status;
  }

  public setChannelEnabled(channelName: string, enabled: boolean): boolean {
    const channel = this.channels.get(channelName);
    if (!channel) return false;
    channel.enabled = enabled;
    logger.info('Channel status updated:', { channelName, enabled });
    return true;
  }

  public clearPushCache(): void {
    this.pushedAlarms.clear();
    logger.info('Push idempotency cache cleared');
  }

  public dispose(): void {
    if (this.pushCleanup) {
      clearInterval(this.pushCleanup);
    }
    this.pushedAlarms.clear();
    this.channels.clear();
  }
}

export const messagePushService = new MessagePushService();
