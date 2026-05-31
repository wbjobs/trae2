export type DeviceStatus = 'online' | 'offline' | 'busy' | 'error' | 'maintenance';

export type DeviceType = 'weather_radar' | 'data_receiver' | 'signal_processor';

export interface RadarDevice {
  id: string;
  name: string;
  type: DeviceType;
  status: DeviceStatus;
  ip: string;
  port?: number;
  location: {
    latitude: number;
    longitude: number;
    altitude: number;
  };
  capabilities: {
    maxRange: number;
    supportedScanModes: string[];
    supportedDataTypes: string[];
    frequencyBand?: string;
    antennaDiameter?: number;
  };
  currentTaskId?: string;
  lastHeartbeat: number;
  createdAt: number;
  updatedAt: number;
  errorMessage?: string;
  metrics?: DeviceMetrics;
}

export interface DeviceMetrics {
  cpuUsage?: number;
  memoryUsage?: number;
  diskUsage?: number;
  networkUsage?: number;
  networkIn?: number;
  networkOut?: number;
  temperature?: number;
  uptime?: number;
}

export interface DeviceRegisterRequest {
  id: string;
  name: string;
  type: DeviceType;
  ip: string;
  port?: number;
  location: {
    latitude: number;
    longitude: number;
    altitude: number;
  };
  capabilities: {
    maxRange: number;
    supportedScanModes: string[];
    supportedDataTypes: string[];
    frequencyBand?: string;
    antennaDiameter?: number;
  };
}

export interface DeviceHeartbeatRequest {
  deviceId: string;
  status: DeviceStatus;
  metrics?: DeviceMetrics;
  currentTaskId?: string;
  errorMessage?: string;
}

export interface DeviceCommandRequest {
  deviceId: string;
  command: 'start_scan' | 'stop_scan' | 'reboot' | 'calibrate' | 'self_check';
  parameters?: Record<string, any>;
}

export interface DeviceCommandResponse {
  success: boolean;
  message: string;
  commandId: string;
  timestamp: number;
}
