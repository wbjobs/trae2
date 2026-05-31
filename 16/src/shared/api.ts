import { IPC_CHANNELS } from './constants';
import {
  ConnectionState,
  DeviceDescriptor,
  DeviceProfile,
  DriverInfo,
  ParameterDefinition,
  ParameterValue,
} from './types';

export interface PresetTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  parameters: Array<{ paramId: string; value: number | boolean | string }>;
  isSystem: boolean;
  createdAt: number;
}

export interface HardwareAlert {
  id: string;
  timestamp: number;
  severity: 'info' | 'warning' | 'error' | 'critical';
  category: string;
  deviceId: string;
  deviceName?: string;
  title: string;
  message: string;
  details?: Record<string, unknown>;
  acknowledged: boolean;
  autoDismiss: boolean;
  dismissAfter?: number;
}

type Listener = (...args: any[]) => void;

export interface TunerAPI {
  listDevices(): Promise<DeviceDescriptor[]>;
  connect(deviceId: string): Promise<ConnectionState>;
  disconnect(deviceId: string): Promise<boolean>;
  getParameters(deviceId: string): Promise<ParameterDefinition[]>;
  readParameter(deviceId: string, paramId: string): Promise<ParameterValue>;
  writeParameter(deviceId: string, paramId: string, value: number | boolean | string): Promise<ParameterValue>;
  batchRead(deviceId: string, paramIds?: string[]): Promise<ParameterValue[]>;
  batchWrite(deviceId: string, values: Array<{ id: string; value: number | boolean | string }>): Promise<ParameterValue[]>;
  getDriverStatus(deviceId: string): Promise<DriverInfo>;
  refreshDrivers(): Promise<DriverInfo[]>;
  exportConfig(deviceId: string, filePath?: string): Promise<string>;
  importConfig(filePath?: string): Promise<DeviceProfile>;
  getPresets(deviceId: string): Promise<PresetTemplate[]>;
  applyPreset(deviceId: string, presetId: string): Promise<ParameterValue[]>;
  createPreset(deviceId: string, name: string, description: string): Promise<PresetTemplate>;
  getActiveAlerts(): Promise<HardwareAlert[]>;
  dismissAlert(alertId: string): Promise<boolean>;
  acknowledgeAlert(alertId: string): Promise<boolean>;
  onParameterChanged(listener: (deviceId: string, param: ParameterValue) => void): () => void;
  onDeviceEvent(listener: (event: string, payload: unknown) => void): () => void;
  onAlert(listener: (alert: HardwareAlert) => void): () => void;
}

declare global {
  interface Window {
    tuner: TunerAPI;
  }
}

export function createTunerAPI(): TunerAPI | null {
  if (!(window as any).electronIPC) {
    return null;
  }
  const ipc = (window as any).electronIPC as {
    invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
    on: (channel: string, listener: Listener) => () => void;
  };

  const api: TunerAPI = {
    listDevices: () => ipc.invoke(IPC_CHANNELS.LIST_DEVICES) as Promise<DeviceDescriptor[]>,
    connect: (deviceId) => ipc.invoke(IPC_CHANNELS.CONNECT, deviceId) as Promise<ConnectionState>,
    disconnect: (deviceId) => ipc.invoke(IPC_CHANNELS.DISCONNECT, deviceId) as Promise<boolean>,
    getParameters: (deviceId) => ipc.invoke(IPC_CHANNELS.GET_PARAMETERS, deviceId) as Promise<ParameterDefinition[]>,
    readParameter: (deviceId, paramId) =>
      ipc.invoke(IPC_CHANNELS.READ_PARAMETER, deviceId, paramId) as Promise<ParameterValue>,
    writeParameter: (deviceId, paramId, value) =>
      ipc.invoke(IPC_CHANNELS.WRITE_PARAMETER, deviceId, paramId, value) as Promise<ParameterValue>,
    batchRead: (deviceId, paramIds) =>
      ipc.invoke(IPC_CHANNELS.BATCH_READ, deviceId, paramIds) as Promise<ParameterValue[]>,
    batchWrite: (deviceId, values) =>
      ipc.invoke(IPC_CHANNELS.BATCH_WRITE, deviceId, values) as Promise<ParameterValue[]>,
    getDriverStatus: (deviceId) => ipc.invoke(IPC_CHANNELS.GET_DRIVER_STATUS, deviceId) as Promise<DriverInfo>,
    refreshDrivers: () => ipc.invoke(IPC_CHANNELS.REFRESH_DRIVERS) as Promise<DriverInfo[]>,
    exportConfig: (deviceId, filePath) =>
      ipc.invoke(IPC_CHANNELS.EXPORT_CONFIG, deviceId, filePath) as Promise<string>,
    importConfig: (filePath) => ipc.invoke(IPC_CHANNELS.IMPORT_CONFIG, filePath) as Promise<DeviceProfile>,
    getPresets: (deviceId) => ipc.invoke(IPC_CHANNELS.GET_PRESETS, deviceId) as Promise<PresetTemplate[]>,
    applyPreset: (deviceId, presetId) =>
      ipc.invoke(IPC_CHANNELS.APPLY_PRESET, deviceId, presetId) as Promise<ParameterValue[]>,
    createPreset: (deviceId, name, description) =>
      ipc.invoke(IPC_CHANNELS.CREATE_PRESET, deviceId, name, description) as Promise<PresetTemplate>,
    getActiveAlerts: () => ipc.invoke(IPC_CHANNELS.GET_ACTIVE_ALERTS) as Promise<HardwareAlert[]>,
    dismissAlert: (alertId) => ipc.invoke(IPC_CHANNELS.DISMISS_ALERT, alertId) as Promise<boolean>,
    acknowledgeAlert: (alertId) => ipc.invoke(IPC_CHANNELS.ACKNOWLEDGE_ALERT, alertId) as Promise<boolean>,
    onParameterChanged: (listener) =>
      ipc.on(IPC_CHANNELS.ON_PARAMETER_CHANGED, (_e: unknown, deviceId: string, param: ParameterValue) =>
        listener(deviceId, param),
      ),
    onDeviceEvent: (listener) =>
      ipc.on(IPC_CHANNELS.ON_DEVICE_EVENT, (_e: unknown, event: string, payload: unknown) =>
        listener(event, payload),
      ),
    onAlert: (listener) =>
      ipc.on(IPC_CHANNELS.ON_ALERT, (_e: unknown, alert: HardwareAlert) => listener(alert)),
  };

  return api;
}
