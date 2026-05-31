import { BaseTransport, TransportReadOptions, TransportWriteOptions } from './ITransport';
import { ParameterValue } from '../../shared/types';
import { Result, err, ok } from '../../shared/result';
import { getPlatformConfig, isMacOS } from '../utils/platform';

export class SerialTransport extends BaseTransport {
  readonly transport = 'serial' as const;
  private registerMap: Map<string, number | boolean | string> = new Map();
  private baudRate: number = 115200;
  private writeBuffer: Map<string, { value: number | boolean | string; timestamp: number }> = new Map();
  private flushTimer: NodeJS.Timeout | null = null;
  private pendingWrites: Set<string> = new Set();

  async open(device: import('../../shared/types').DeviceDescriptor): Promise<Result<void>> {
    if (device.transport !== 'serial') {
      return err('TRANSPORT_MISMATCH', `SerialTransport cannot open ${device.transport} device`);
    }

    const config = getPlatformConfig();
    this.baudRate = config.serialBaudRate;

    try {
      const result = await super.open(device);
      if (!result.ok) return result;

      this.startFlushTimer();

      if (isMacOS()) {
        await this.sendMacOSSync();
      }

      return ok(undefined);
    } catch (error) {
      return err(
        'OPEN_FAILED',
        `Failed to open serial device: ${error instanceof Error ? error.message : 'unknown error'}`,
        error,
      );
    }
  }

  private startFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    this.flushTimer = setInterval(() => {
      this.flushPendingWrites();
    }, 100);
  }

  private async sendMacOSSync(): Promise<void> {
    if (!this.device) return;
    try {
      await this.write('__sync', 1);
      await new Promise((resolve) => setTimeout(resolve, 50));
    } catch {
      // Sync may fail on some devices
    }
  }

  private flushPendingWrites(): void {
    const now = Date.now();
    for (const [paramId, entry] of this.writeBuffer.entries()) {
      if (now - entry.timestamp > 50 && !this.pendingWrites.has(paramId)) {
        this.pendingWrites.add(paramId);
        this.registerMap.set(paramId, entry.value);
        this.writeBuffer.delete(paramId);
        this.pendingWrites.delete(paramId);
        this.emit('write-flushed', paramId, entry.value);
      }
    }
  }

  async read(paramId: string, options?: TransportReadOptions): Promise<Result<ParameterValue>> {
    if (!this.openFlag || !this.device) {
      return err('NOT_OPEN', 'Serial device is not open');
    }

    try {
      const buffered = this.writeBuffer.get(paramId);
      const value = buffered
        ? buffered.value
        : (this.registerMap.has(paramId)
            ? (this.registerMap.get(paramId) as number | boolean | string)
            : 0);

      return ok({ id: paramId, value, updatedAt: Date.now() });
    } catch (error) {
      return err(
        'READ_FAILED',
        `Failed to read from serial: ${error instanceof Error ? error.message : 'unknown error'}`,
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
      return err('NOT_OPEN', 'Serial device is not open');
    }

    try {
      this.writeBuffer.set(paramId, { value, timestamp: Date.now() });
      this.flushPendingWrites();

      return ok({ id: paramId, value, updatedAt: Date.now() });
    } catch (error) {
      return err(
        'WRITE_FAILED',
        `Failed to write to serial: ${error instanceof Error ? error.message : 'unknown error'}`,
        error,
      );
    }
  }

  async close(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    this.flushPendingWrites();
    this.writeBuffer.clear();
    this.registerMap.clear();
    this.pendingWrites.clear();

    await super.close();
  }

  getBaudRate(): number {
    return this.baudRate;
  }

  hasPendingWrites(): boolean {
    return this.writeBuffer.size > 0 || this.pendingWrites.size > 0;
  }
}
