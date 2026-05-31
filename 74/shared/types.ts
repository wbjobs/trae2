export type DeviceType = 'camera' | 'access' | 'alarm';
export type DataStatus = 'normal' | 'warning' | 'danger';
export type RiskLevel = 'safe' | 'caution' | 'danger';
export type AnomalyType = 'intrusion' | 'gathering' | 'crowd' | 'fault' | 'other' | 'unknown';
export type Severity = 'low' | 'medium' | 'high';
export type TimeRange = '1h' | '6h' | '24h' | '7d';
export type AlertStatus = 'pending' | 'acknowledged' | 'processing' | 'resolved' | 'ignored';

export interface Location {
  lat: number;
  lng: number;
  area: string;
}

export interface SecurityData {
  id: string;
  deviceId: string;
  deviceType: DeviceType;
  timestamp: number;
  location: Location;
  value: number;
  status: DataStatus;
  metadata?: Record<string, any>;
}

export interface Device {
  id: string;
  name: string;
  type: DeviceType;
  areaCode: string;
  lat: number;
  lng: number;
  status: 'online' | 'offline' | 'fault';
  createdAt?: string;
}

export interface Area {
  code: string;
  name: string;
  parentCode?: string;
  boundary?: string;
}

export interface TimeSeriesFeatures {
  deviceId: string;
  deviceName?: string;
  period: 'hour' | 'day' | 'week';
  mean: number;
  std: number;
  max: number;
  min: number;
  q1: number;
  median: number;
  q3: number;
  rms: number;
  peakCount: number;
  volatility: number;
  trend: number;
  features: number[];
  timeRange: [number, number];
  timestamp: number;
}

export interface AnomalyCluster {
  id: string;
  clusterId: number;
  dataPoints: SecurityData[];
  center: { lat: number; lng: number };
  anomalyType: AnomalyType;
  type: AnomalyType;
  severity: Severity;
  startTime: number;
  endTime: number;
  detectedAt: number;
  pointCount: number;
  area: string;
}

export interface AnomalyAlert {
  id: string;
  dataId: string;
  clusterId?: string;
  level: Severity;
  severity: Severity;
  type: AnomalyType;
  description: string;
  status: AlertStatus;
  createdAt: number;
  timestamp: number;
  deviceName?: string;
  location?: Location;
  area: string;
  deviceIds: string[];
}

export interface RiskStatistics {
  area: string;
  areaName: string;
  timeRange: string;
  riskScore: number;
  riskLevel: RiskLevel;
  alertCount: number;
  deviceHealth: number;
  anomalyRate: number;
  trend: number[];
}

export interface HeatmapPoint {
  lat: number;
  lng: number;
  value: number;
  timestamp?: number;
}

export interface DeviceStatusStats {
  total: number;
  online: number;
  offline: number;
  fault: number;
  byType: Record<DeviceType, { total: number; online: number }>;
  camera: { total: number; online: number };
  access: { total: number; online: number };
  alarm: { total: number; online: number };
  todayAlerts: number;
}

export interface HourlyRiskData {
  hour: number;
  riskScore: number;
  alertCount: number;
}

export interface RealtimeData {
  data: SecurityData;
  device?: Device;
}

export interface RiskOverview {
  overallRisk: number;
  alertCount: number;
  alertTrend: number;
  deviceHealth: number;
  totalDevices: number;
  anomalyRate: number;
  totalData: number;
  peakHours: string[];
}

export interface AreaRiskRanking {
  area: string;
  areaName: string;
  riskScore: number;
  alertCount: number;
  anomalyRate: number;
}

export interface RiskTrendHourly {
  hour: number;
  riskScore: number;
  alertCount: number;
}

export interface WebSocketMessage {
  type: 'data' | 'alert' | 'stats';
  payload: any;
  timestamp: number;
}

export interface PredictionPoint {
  timestamp: number;
  predictedRisk: number;
  upperBound: number;
  lowerBound: number;
  confidence: number;
}

export interface AreaPrediction {
  area: string;
  areaName: string;
  currentRisk: number;
  predictions: PredictionPoint[];
  trend: 'rising' | 'stable' | 'declining';
  nextHourRisk: number;
}

export interface DeviceRankingItem {
  deviceId: string;
  deviceName: string;
  deviceType: DeviceType;
  area: string;
  areaName: string;
  anomalyScore: number;
  alertCount: number;
  avgValue: number;
  riskLevel: 'low' | 'medium' | 'high';
}
