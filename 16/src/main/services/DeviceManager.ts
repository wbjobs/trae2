import { EventEmitter } from 'events';
import { DeviceDescriptor, ConnectionState, ParameterDefinition, ParameterValue } from '../../shared/types';
import { Result, ok, err, unwrap } from '../../shared/result';
import { ITransport } from '../communication/ITransport';
import { HIDTransport } from '../communication/HIDTransport';
import { SerialTransport } from '../communication/SerialTransport';
import { connectionPool } from '../communication/ConnectionPool';
import { parameterConfig } from '../config/ParameterConfigurationService';
import { configPersistence } from '../config/ConfigPersistenceService';
import { presetService, PresetTemplate } from '../config/PresetTemplateService';
import { alertService } from '../services/HardwareAlertService';
import { APP_EVENTS } from '../../shared/constants';
import { isMacOS } from '../utils/platform';

export interface TransportFactory {
  createTransport(device: DeviceDescriptor): ITransport;
}

class DefaultTransportFactory implements TransportFactory {
  createTransport(device: DeviceDescriptor): ITransport {
    switch (device.transport) {
      case 'hid':
        return new HIDTransport();
      case 'serial':
        return new SerialTransport();
      case 'usb':
      case 'ble':
      case 'simulated':
        return new HIDTransport();
      default:
        return new HIDTransport();
    }
  }
}

export class DeviceManager extends EventEmitter {
  private transportFactory: TransportFactory;
  private deviceDefinitions: Map<string, ParameterDefinition[]> = new Map();
  private connectionStates: Map<string, ConnectionState> = new Map();

  constructor(transportFactory?: TransportFactory) {
    super();
    this.transportFactory = transportFactory || new DefaultTransportFactory();
    this.setupAlertForwarding();
  }

  private setupAlertForwarding(): void {
    alertService.on('alert', (alert) => {
      this.emit('alert', alert);
    });
  }

  listDevices(): Result<DeviceDescriptor[]> {
    const devices: DeviceDescriptor[] = [
      {
        id: 'keyboard-demo-001',
        name: 'Mechanical Keyboard Pro',
        vendor: 'Demo Corp',
        product: 'KB-Pro',
        category: 'keyboard',
        transport: 'hid',
        vendorId: 0x046d,
        productId: 0xc33c,
        firmwareVersion: '1.2.3',
      },
      {
        id: 'mouse-demo-001',
        name: 'Gaming Mouse X1',
        vendor: 'Demo Corp',
        product: 'GM-X1',
        category: 'mouse',
        transport: 'hid',
        vendorId: 0x1532,
        productId: 0x007e,
        firmwareVersion: '2.0.1',
      },
      {
        id: 'industrial-demo-001',
        name: 'Industrial IO Controller',
        vendor: 'Industrial Tech',
        product: 'IO-485',
        category: 'industrial-io',
        transport: 'serial',
        vendorId: 0x0403,
        productId: 0x6001,
        path: '/dev/ttyUSB0',
      },
    ];

    return ok(devices);
  }

  getParameterDefinitions(device: DeviceDescriptor): ParameterDefinition[] {
    const cached = this.deviceDefinitions.get(device.id);
    if (cached) return cached;

    const definitions = this.getDefaultDefinitions(device);
    this.deviceDefinitions.set(device.id, definitions);
    return definitions;
  }

  private getDefaultDefinitions(device: DeviceDescriptor): ParameterDefinition[] {
    switch (device.category) {
      case 'keyboard':
        return [
          {
            id: 'key_repeat_rate',
            name: '按键重复速率',
            description: '按住按键时的重复触发间隔',
            type: 'int',
            min: 10,
            max: 100,
            step: 5,
            unit: 'ms',
            defaultValue: 30,
            group: '键盘设置',
          },
          {
            id: 'key_delay',
            name: '初始延迟',
            description: '按下按键到开始重复的延迟时间',
            type: 'int',
            min: 100,
            max: 1000,
            step: 50,
            unit: 'ms',
            defaultValue: 500,
            group: '键盘设置',
          },
          {
            id: 'debounce_time',
            name: '去抖时间',
            description: '防止按键误触发的过滤时间',
            type: 'int',
            min: 1,
            max: 20,
            step: 1,
            unit: 'ms',
            defaultValue: 5,
            group: '高级设置',
          },
          {
            id: 'rgb_enabled',
            name: 'RGB 背光',
            description: '开启/关闭键盘背光',
            type: 'bool',
            defaultValue: true,
            group: '灯光效果',
          },
          {
            id: 'rgb_brightness',
            name: '背光亮度',
            description: '调整背光亮度百分比',
            type: 'int',
            min: 0,
            max: 100,
            step: 5,
            unit: '%',
            defaultValue: 80,
            group: '灯光效果',
          },
          {
            id: 'rgb_effect',
            name: '灯光模式',
            description: '选择背光灯效模式',
            type: 'enum',
            defaultValue: 'wave',
            group: '灯光效果',
            options: [
              { label: '常亮', value: 'static' },
              { label: '呼吸', value: 'breathing' },
              { label: '波浪', value: 'wave' },
              { label: '触发', value: 'reactive' },
            ],
          },
        ];

      case 'mouse':
        return [
          {
            id: 'dpi',
            name: 'DPI',
            description: '鼠标分辨率，越高越灵敏',
            type: 'int',
            min: 400,
            max: 16000,
            step: 400,
            defaultValue: 1600,
            group: '性能设置',
          },
          {
            id: 'polling_rate',
            name: '回报率',
            description: '鼠标向电脑报告位置的频率',
            type: 'enum',
            defaultValue: 1000,
            group: '性能设置',
            options: [
              { label: '125 Hz', value: 125 },
              { label: '250 Hz', value: 250 },
              { label: '500 Hz', value: 500 },
              { label: '1000 Hz', value: 1000 },
            ],
          },
          {
            id: 'sensitivity',
            name: '灵敏度',
            description: '鼠标移动灵敏度乘数',
            type: 'float',
            min: 0.1,
            max: 10.0,
            step: 0.1,
            defaultValue: 1.0,
            group: '性能设置',
          },
          {
            id: 'scroll_speed',
            name: '滚轮速度',
            description: '滚轮滚动速度',
            type: 'int',
            min: 1,
            max: 20,
            step: 1,
            defaultValue: 5,
            group: '行为设置',
          },
          {
            id: 'lift_off_distance',
            name: '抬离距离',
            description: '鼠标停止响应的高度',
            type: 'int',
            min: 1,
            max: 10,
            step: 1,
            defaultValue: 3,
            unit: 'mm',
            group: '高级设置',
          },
          {
            id: 'angle_snapping',
            name: '角度修正',
            description: '自动修正移动轨迹为直线',
            type: 'bool',
            defaultValue: false,
            group: '高级设置',
          },
        ];

      case 'industrial-io':
        return [
          {
            id: 'baud_rate',
            name: '波特率',
            description: '串口通信速率',
            type: 'enum',
            defaultValue: 115200,
            group: '通信设置',
            options: [
              { label: '9600', value: 9600 },
              { label: '19200', value: 19200 },
              { label: '38400', value: 38400 },
              { label: '57600', value: 57600 },
              { label: '115200', value: 115200 },
            ],
          },
          {
            id: 'sampling_rate',
            name: '采样率',
            description: 'IO 数据采集频率',
            type: 'int',
            min: 1,
            max: 1000,
            step: 10,
            unit: 'Hz',
            defaultValue: 100,
            group: '配置参数',
          },
          {
            id: 'filter_enabled',
            name: '噪声过滤',
            description: '启用硬件噪声过滤',
            type: 'bool',
            defaultValue: true,
            group: '配置参数',
          },
        ];

      default:
        return [];
    }
  }

  async connect(deviceId: string): Promise<Result<ConnectionState>> {
    const devicesResult = this.listDevices();
    if (!devicesResult.ok) {
      return err('DEVICE_NOT_FOUND', `Device ${deviceId} not found`);
    }

    const device = devicesResult.data.find((d) => d.id === deviceId);
    if (!device) {
      return err('DEVICE_NOT_FOUND', `Device ${deviceId} not found`);
    }

    if (connectionPool.has(deviceId)) {
      const existing = this.connectionStates.get(deviceId);
      if (existing) return ok(existing);
    }

    const transport = this.transportFactory.createTransport(device);
    const openResult = await transport.open(device);
    if (!openResult.ok) {
      alertService.raiseConnectionError(device, openResult.message);
      return err('CONNECTION_FAILED', `Failed to connect: ${openResult.message}`);
    }

    const poolResult = connectionPool.add(device, transport);
    if (!poolResult.ok) {
      await transport.close();
      return err(poolResult.code, poolResult.message);
    }

    const definitions = this.getParameterDefinitions(device);
    parameterConfig.registerDevice(device, definitions);

    this.setupTransportEvents(deviceId, transport);

    const state: ConnectionState = {
      deviceId,
      connected: true,
      lastSeenAt: Date.now(),
    };
    this.connectionStates.set(deviceId, state);

    if (isMacOS()) {
      const hasPermission = await this.checkMacOSPermission(device);
      if (!hasPermission) {
        alertService.raiseMacOSPermissionIssue(device);
      }
    }

    await this.syncStoredParameters(deviceId);

    this.emit(APP_EVENTS.DEVICE_CONNECTED, device);

    return ok(state);
  }

  private async checkMacOSPermission(device: DeviceDescriptor): Promise<boolean> {
    try {
      const DriverAdapter = (await import('../drivers/DriverAdapter')).MacOSDriverAdapter;
      const adapter = new DriverAdapter();
      return await adapter.checkPermissions(device);
    } catch {
      return true;
    }
  }

  private setupTransportEvents(deviceId: string, transport: ITransport): void {
    const devicesResult = this.listDevices();
    const device = devicesResult.ok
      ? devicesResult.data.find((d) => d.id === deviceId)
      : undefined;

    transport.on('reconnected', (attempts: number = 0) => {
      const state = this.connectionStates.get(deviceId);
      if (state) {
        state.connected = true;
        state.lastSeenAt = Date.now();
        state.error = undefined;
      }
      if (device) {
        alertService.raiseConnectionRestored(device);
      }
      this.emit(APP_EVENTS.DEVICE_CONNECTED, { deviceId, attempts });
    });

    transport.on('connection-lost', () => {
      const state = this.connectionStates.get(deviceId);
      if (state) {
        state.connected = false;
        state.error = 'Connection lost';
      }
      if (device) {
        const reconnectAttempts = transport instanceof HIDTransport ? transport.getReconnectAttempts() : 0;
        alertService.raiseConnectionLost(device, reconnectAttempts);
      }
      this.emit(APP_EVENTS.DEVICE_ERROR, { deviceId, error: 'Connection lost' });
    });

    transport.on('parameter-written', (paramId: string, value: number | boolean | string) => {
      this.emit(APP_EVENTS.PARAMETER_UPDATED, { deviceId, paramId, value });
    });

    transport.on('write-error', (paramId: string, value: unknown, error: string) => {
      if (device) {
        alertService.raiseParameterWriteError(device, paramId, String(value), error);
      }
    });
  }

  private async syncStoredParameters(deviceId: string): Promise<void> {
    const storedParams = parameterConfig.getAllStoredParameters(deviceId);
    if (!storedParams) return;

    const result = await connectionPool.execute(
      deviceId,
      async (transport) => {
        const results = [];
        for (const [paramId, paramValue] of Object.entries(storedParams)) {
          try {
            const r = await transport.write(paramId, paramValue.value);
            if (r.ok) results.push(r.data);
          } catch {
            // Skip parameters that fail to sync
          }
        }
        return results;
      },
    );
  }

  async disconnect(deviceId: string): Promise<Result<boolean>> {
    if (!connectionPool.has(deviceId)) {
      return err('NOT_CONNECTED', `Device ${deviceId} is not connected`);
    }

    alertService.clearForDevice(deviceId);
    connectionPool.remove(deviceId);
    this.connectionStates.delete(deviceId);
    parameterConfig.unregisterDevice(deviceId);

    this.emit(APP_EVENTS.DEVICE_DISCONNECTED, { deviceId });

    return ok(true);
  }

  getConnectionState(deviceId: string): ConnectionState | undefined {
    return this.connectionStates.get(deviceId);
  }

  isConnected(deviceId: string): boolean {
    return connectionPool.has(deviceId);
  }

  getConnectedDevices(): string[] {
    return connectionPool.getAll().map((c) => c.device.id);
  }

  async readParameter(deviceId: string, paramId: string): Promise<Result<ParameterValue>> {
    const result = await connectionPool.execute(
      deviceId,
      (transport) => transport.read(paramId),
      { timeout: 5000 },
    );

    if (!result.ok) {
      return err(result.code, result.message);
    }

    if (!result.data.ok) {
      return err(result.data.code, result.data.message);
    }

    return ok(result.data.data);
  }

  async writeParameter(
    deviceId: string,
    paramId: string,
    value: number | boolean | string,
  ): Promise<Result<ParameterValue>> {
    const queued = parameterConfig.queueWrite(deviceId, paramId, value);
    if (!queued.ok) {
      return queued;
    }

    const result = await connectionPool.execute(
      deviceId,
      (transport) => transport.write(paramId, queued.data.value),
      { timeout: 5000 },
    );

    if (!result.ok) {
      return err(result.code, result.message);
    }

    if (!result.data.ok) {
      return err(result.data.code, result.data.message);
    }

    parameterConfig.clearPendingWrites(deviceId, [paramId]);
    return ok(result.data.data);
  }

  async batchRead(deviceId: string, paramIds?: string[]): Promise<Result<ParameterValue[]>> {
    const ids = paramIds || parameterConfig.getDefinitions(deviceId).map((d) => d.id);

    const result = await connectionPool.execute(
      deviceId,
      async (transport) => {
        const results: ParameterValue[] = [];
        for (const id of ids) {
          const r = await transport.read(id);
          if (r.ok) results.push(r.data);
        }
        return results;
      },
      { timeout: 10000 },
    );

    if (!result.ok) {
      return err(result.code, result.message);
    }

    return ok(result.data);
  }

  async batchWrite(
    deviceId: string,
    values: Array<{ id: string; value: number | boolean | string }>,
  ): Promise<Result<ParameterValue[]>> {
    const validatedValues: Array<{ id: string; value: number | boolean | string }> = [];

    for (const { id, value } of values) {
      const queued = parameterConfig.queueWrite(deviceId, id, value);
      if (queued.ok) {
        validatedValues.push({ id, value: queued.data.value });
      }
    }

    const result = await connectionPool.execute(
      deviceId,
      async (transport) => {
        const results: ParameterValue[] = [];
        for (const { id, value } of validatedValues) {
          const r = await transport.write(id, value);
          if (r.ok) results.push(r.data);
        }
        return results;
      },
      { timeout: 15000 },
    );

    if (!result.ok) {
      return err(result.code, result.message);
    }

    parameterConfig.clearPendingWrites(deviceId);
    return ok(result.data);
  }

  getPresets(deviceId: string): PresetTemplate[] {
    const devicesResult = this.listDevices();
    if (!devicesResult.ok) return [];

    const device = devicesResult.data.find((d) => d.id === deviceId);
    if (!device) return [];

    return presetService.getPresetsForCategory(device.category);
  }

  async applyPreset(deviceId: string, presetId: string): Promise<Result<ParameterValue[]>> {
    const devicesResult = this.listDevices();
    if (!devicesResult.ok) return err('DEVICE_NOT_FOUND', 'Device not found');

    const device = devicesResult.data.find((d) => d.id === deviceId);
    if (!device) return err('DEVICE_NOT_FOUND', 'Device not found');

    const preset = presetService.getPreset(presetId);
    if (!preset) return err('PRESET_NOT_FOUND', `Preset ${presetId} not found`);

    const definitions = this.getParameterDefinitions(device);
    const paramsToApply = presetService.applyPreset(preset, definitions);

    return await this.batchWrite(
      deviceId,
      paramsToApply.map((p) => ({ id: p.paramId, value: p.value })),
    );
  }

  async createPresetFromCurrent(
    deviceId: string,
    name: string,
    description: string,
  ): Promise<Result<PresetTemplate>> {
    const devicesResult = this.listDevices();
    if (!devicesResult.ok) return err('DEVICE_NOT_FOUND', 'Device not found');

    const device = devicesResult.data.find((d) => d.id === deviceId);
    if (!device) return err('DEVICE_NOT_FOUND', 'Device not found');

    const definitions = this.getParameterDefinitions(device);
    const currentValues = parameterConfig.getAllStoredParameters(deviceId);

    if (!currentValues) {
      return err('NO_PARAMETERS', 'No parameters found for device');
    }

    const preset = presetService.createPresetFromCurrent(
      name,
      description,
      device.category,
      currentValues,
      definitions,
    );

    return ok(preset);
  }

  exportConfig(deviceId: string, filePath: string): Result<string> {
    return parameterConfig.exportConfig(deviceId, filePath);
  }

  importConfig(filePath: string): Result<{ deviceId: string; parameters: ParameterValue[] }> {
    return parameterConfig.importConfig(filePath);
  }

  async closeAll(): Promise<void> {
    alertService.clearAll();
    await connectionPool.closeAll();
    this.connectionStates.clear();
    await configPersistence.flushAll();
  }

  getPoolStats() {
    return {
      total: connectionPool.size(),
      active: connectionPool.activeCount(),
      idle: connectionPool.idleCount(),
    };
  }
}

export const deviceManager = new DeviceManager();
