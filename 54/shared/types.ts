export interface SensorData {
  timestamp: number;
  deviceId: string;
  location: { x: number; y: number; z: number };
  temperature: number;
  humidity: number;
  gasConcentration: {
    co2: number;
    ch4: number;
    o2: number;
  };
  deviceStatus: 'normal' | 'warning' | 'error';
}

export interface FeatureData {
  mean: number;
  std: number;
  max: number;
  min: number;
  trend: 'rising' | 'stable' | 'falling';
  volatility: number;
}

export interface FeaturesResponse {
  temperature: FeatureData;
  humidity: FeatureData;
  co2: FeatureData;
  ch4: FeatureData;
}

export interface AnomalyCluster {
  id: string;
  type: 'temperature' | 'humidity' | 'gas' | 'device';
  level: 'low' | 'medium' | 'high' | 'critical';
  startTime: number;
  endTime: number;
  dataPoints: Array<{ x: number; y: number; value: number }>;
  location: { x: number; y: number };
  deviceId: string;
}

export interface AnomaliesResponse {
  clusters: AnomalyCluster[];
  totalCount: number;
}

export interface RiskStatistics {
  hourlyRisk: Array<{ hour: number; level: number; count: number }>;
  levelDistribution: {
    low: number;
    medium: number;
    high: number;
    critical: number;
  };
  topRiskLocations: Array<{
    location: string;
    riskCount: number;
    avgLevel: number;
  }>;
}

export interface RealtimeDataResponse {
  latestData: SensorData[];
  timestamp: number;
}

export interface HeatmapData {
  x: number;
  y: number;
  value: number;
}

export interface DeviceStatus {
  deviceId: string;
  status: 'normal' | 'warning' | 'error';
  location: { x: number; y: number };
  lastUpdate: number;
}

export interface ZoneData {
  zoneId: string;
  zoneName: string;
  avgTemperature: number;
  avgHumidity: number;
  avgCo2: number;
  avgCh4: number;
  deviceCount: number;
  anomalyCount: number;
  riskScore: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  trend: 'improving' | 'stable' | 'worsening';
}

export interface ZoneRankings {
  highestRisk: ZoneData[];
  lowestRisk: ZoneData[];
  mostAnomalies: ZoneData[];
}

export interface PredictionPoint {
  timestamp: number;
  value: number;
  lower: number;
  upper: number;
}

export interface PredictionResult {
  historical: Array<{ timestamp: number; value: number }>;
  predictions: PredictionPoint[];
  confidence: number;
  trend: 'rising' | 'stable' | 'falling';
}

export interface PredictionResponse {
  temperature: PredictionResult;
  humidity: PredictionResult;
  co2: PredictionResult;
  ch4: PredictionResult;
}
