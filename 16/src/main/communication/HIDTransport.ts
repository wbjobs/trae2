import { BaseTransport, TransportReadOptions, TransportWriteOptions } from './ITransport';
import { ParameterValue } from '../../shared/types';
import { Result, err, ok } from '../../shared/result';
import { getPlatformConfig, isMacOS, getRecommendedPollingInterval } from '../utils/platform';

export class HIDTransport extends BaseTransport {
  readonly transport = 'hid' as const;
  private buffer: Map<string, number | boolean | string> = new Map();
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private lastActivityAt: number = 0;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 3;
  private isReconnecting: boolean = false;

  async open(device: import('../../shared/types').DeviceDescriptor): Promise<Result<void>> {
    if (device.transport !== 'hid') {
      return err('TRANSPORT_MISMATCH', `HIDTransport cannot open ${device.transport} device`);
    }

    const config = getPlatformConfig();

    try {
      const result = await super.open(device);
      if (!result.ok) return result;

      this.lastActivityAt = Date.now();
      this.startHeartbeat();
      this.reconnectAttempts = 0;

      if (isMacOS()) {
        await this.sendMacOSWakeupPacket();
      }

      return ok(undefined);
    } catch (error) {
      return err(
        'OPEN_FAILED',
        `Failed to open HID device: ${error instanceof Error ? error.message : 'unknown error'}`,
        error,
      );
    }
  }

  private startHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    const interval = getRecommendedPollingInterval() * 10;
    this.heartbeatTimer = setInterval(async () => {
      if (!this.openFlag) return;

      const now = Date.now();
      const config = getPlatformConfig();
      const idleThreshold = config.hidTimeout;

      if (now - this.lastActivityAt > idleThreshold) {
        await this.attemptReconnect();
      }
    }, interval);
  }

  private async sendMacOSWakeupPacket(): Promise<void> {
    if (!this.device || !isMacOS()) return;

    try {
      await this.write('__wakeup', 1, { timeout: 2000 });
      await new Promise((resolve) => setTimeout(resolve, 100));
      await this.read('__wakeup', { timeout: 2000 });
    } catch {
      // Wakeup packet may not be supported by all devices
    }
  }

  private async attemptReconnect(): Promise<void> {
    if (this.isReconnecting || this.reconnectAttempts >= this.maxReconnectAttempts) {
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        this.emit('connection-lost', this.device);
        await this.close();
      }
      return;
    }

    this.isReconnecting = true;
    this.reconnectAttempts++;

    try {
      this.openFlag = false;
      await new Promise((resolve) => setTimeout(resolve, 500));

      if (this.device) {
        const result = await super.open(this.device);
        if (result.ok) {
          this.lastActivityAt = Date.now();
          this.emit('reconnected', this.device, this.reconnectAttempts);
        }
      }
    } catch {
      // Reconnect failed, will retry
    } finally {
      this.isReconnecting = false;
    }
  }

  async read(paramId: string, options?: TransportReadOptions): Promise<Result<ParameterValue>> {
    if (!this.openFlag || !this.device) {
      return err('NOT_OPEN', 'HID device is not open');
    }

    const config = getPlatformConfig();
    const timeout = options?.timeout ?? config.hidTimeout;

    try {
      const value = this.buffer.has(paramId)
        ? (this.buffer.get(paramId) as number | boolean | string)
        : 0;

      this.lastActivityAt = Date.now();
      this.reconnectAttempts = 0;

      return ok({ id: paramId, value, updatedAt: Date.now() });
    } catch (error) {
      return err(
        'READ_FAILED',
        `Failed to read parameter ${paramId}: ${error instanceof Error ? error.message : 'unknown error'}`,
        error,
      );
    }
  }

  async write(
    paramId: string,
    value: number | boolean | string,
    options?: TransportWriteOptions,
  ): Promise<Result<ParameterValue>> {
    if (!this.openFlag || !this.device) {
      return err('NOT_OPEN', 'HID device is not open');
    }

    const config = getPlatformConfig();
    const timeout = options?.timeout ?? config.hidTimeout;

    try {
      if (isMacOS()) {
        await this.ensureDeviceReady();
      }

      this.buffer.set(paramId, value);
      this.lastActivityAt = Date.now();
      this.reconnectAttempts = 0;

      this.emit('data', { paramId, value });
      this.emit('parameter-written', paramId, value);

      return ok({ id: paramId, value, updatedAt: Date.now() });
    } catch (error) {
      return err(
        'WRITE_FAILED',
        `Failed to write parameter ${paramId}: ${error instanceof Error ? error.message : 'unknown error'}`,
        error,
      );
    }
  }

  private async ensureDeviceReady(): Promise<void> {
    const elapsed = Date.now() - this.lastActivityAt;
    if (elapsed > 2000) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  async close(): Promise<void> {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    this.buffer.clear();
    this.reconnectAttempts = 0;
    this.isReconnecting = false;

    await super.close();
  }

  getLastActivityTime(): number {
    return this.lastActivityAt;
  }

  getReconnectAttempts(): number {
    return this.reconnectAttempts;
  }
}
