export enum AlarmLevel {
  INFO = 'info',
  WARNING = 'warning',
  CRITICAL = 'critical',
  FATAL = 'fatal',
}

export enum TerminalStatus {
  ONLINE = 'online',
  OFFLINE = 'offline',
  FAULT = 'fault',
  MAINTENANCE = 'maintenance',
}

export interface TerminalData {
  terminalId: string;
  timestamp: number;
  location: {
    latitude: number;
    longitude: number;
  };
  status: TerminalStatus;
  metrics: {
    voltage?: number;
    current?: number;
    temperature?: number;
    humidity?: number;
    pressure?: number;
    vibration?: number;
    signalStrength?: number;
    batteryLevel?: number;
    cpuUsage?: number;
    memoryUsage?: number;
    diskUsage?: number;
    networkLatency?: number;
    packetLoss?: number;
    power?: number;
    systemLoad?: number;
    [key: string]: number | undefined;
  };
  alarms?: string[];
  rawData?: Record<string, unknown>;
}

export interface ThresholdRule {
  id: string;
  metricName: string;
  operator?: '>' | '<' | '>=' | '<=' | '==' | '!=';
  threshold?: number;
  terminalType?: string;
  terminalId?: string;
  minValue?: number;
  maxValue?: number;
  alarmLevel: AlarmLevel;
  enabled: boolean;
  description: string;
  consecutiveCount: number;
  cooldownPeriod: number;
  minDuration?: number;
  dynamicAdjustable?: boolean;
}

export interface AlarmEvent {
  id: string;
  terminalId: string;
  metricName: string;
  metricValue: number;
  thresholdRule: ThresholdRule;
  timestamp: number;
  alarmLevel: AlarmLevel;
  message: string;
  acknowledged: boolean;
  resolved: boolean;
  resolvedAt?: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ThresholdConfig {
  defaults: ThresholdRule[];
  consecutiveThreshold: number;
  autoReset: boolean;
  autoResetTimeout: number;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  code: number;
  message: string;
  data?: T;
  timestamp: number;
  requestId: string;
}

export interface PaginationParams {
  page: number;
  pageSize: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
