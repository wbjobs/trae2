export type DeviceCategory =
  | 'keyboard'
  | 'mouse'
  | 'gamepad'
  | 'joystick'
  | 'industrial-io'
  | 'serial-console'
  | 'custom';

export type TransportType = 'hid' | 'serial' | 'usb' | 'ble' | 'simulated';

export interface DeviceDescriptor {
  id: string;
  name: string;
  vendor: string;
  product: string;
  category: DeviceCategory;
  transport: TransportType;
  vendorId: number;
  productId: number;
  path?: string;
  serialNumber?: string;
  firmwareVersion?: string;
}

export type ParamType = 'int' | 'float' | 'bool' | 'enum' | 'string';

export interface ParameterEnumOption {
  label: string;
  value: number | string;
}

export interface ParameterDefinition {
  id: string;
  name: string;
  description?: string;
  type: ParamType;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  defaultValue: number | boolean | string;
  options?: ParameterEnumOption[];
  group?: string;
}

export interface ParameterValue {
  id: string;
  value: number | boolean | string;
  updatedAt: number;
}

export interface DeviceProfile {
  deviceId: string;
  deviceName: string;
  createdAt: number;
  updatedAt: number;
  parameters: Record<string, ParameterValue>;
}

export type DriverStatus =
  | 'unknown'
  | 'installed'
  | 'missing'
  | 'outdated'
  | 'error';

export interface DriverInfo {
  deviceId: string;
  status: DriverStatus;
  driverName: string;
  driverVersion?: string;
  requiredVersion?: string;
  message?: string;
}

export interface ConnectionState {
  deviceId: string;
  connected: boolean;
  error?: string;
  lastSeenAt?: number;
}
