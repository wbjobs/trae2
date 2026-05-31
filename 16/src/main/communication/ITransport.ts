import { EventEmitter } from 'events';
import { DeviceDescriptor, ParameterValue } from '../../shared/types';
import { Result } from '../../shared/result';

export interface TransportReadOptions {
  register?: string;
  timeout?: number;
}

export interface TransportWriteOptions {
  register?: string;
  timeout?: number;
}

export interface ITransport extends EventEmitter {
  readonly transport: 'hid' | 'serial' | 'usb' | 'ble' | 'simulated';
  open(device: DeviceDescriptor): Promise<Result<void>>;
  close(): Promise<void>;
  isOpen(): boolean;
  read(paramId: string, options?: TransportReadOptions): Promise<Result<ParameterValue>>;
  write(paramId: string, value: number | boolean | string, options?: TransportWriteOptions): Promise<Result<ParameterValue>>;
}

export abstract class BaseTransport extends EventEmitter implements ITransport {
  protected device: DeviceDescriptor | null = null;
  protected openFlag = false;

  abstract readonly transport: ITransport['transport'];

  isOpen(): boolean {
    return this.openFlag;
  }

  async open(device: DeviceDescriptor): Promise<Result<void>> {
    this.device = device;
    this.openFlag = true;
    this.emit('open', device);
    return { ok: true, data: undefined };
  }

  async close(): Promise<void> {
    this.openFlag = false;
    this.emit('close', this.device);
    this.device = null;
  }

  abstract read(paramId: string, options?: TransportReadOptions): Promise<Result<ParameterValue>>;
  abstract write(paramId: string, value: number | boolean | string, options?: TransportWriteOptions): Promise<Result<ParameterValue>>;
}
