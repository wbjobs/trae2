export interface StationInfo {
  stationId: string;
  stationName: string;
  lineId: string;
  lineName: string;
  position: { x: number; y: number };
}

export interface StationFlow {
  stationId: string;
  stationName: string;
  timestamp: string;
  inflow: number;
  outflow: number;
  totalFlow: number;
  lineId: string;
}

export interface TimeSeriesFeature {
  stationId: string;
  trend: number[];
  periodicity: number;
  anomalies: { timestamp: string; value: number; type: 'spike' | 'drop' }[];
  peakHours: number[];
  avgFlow: number;
  maxFlow: number;
  minFlow: number;
  stdDev: number;
}

export interface ClusterResult {
  stationId: string;
  stationName: string;
  clusterId: number;
  clusterName: string;
  features: number[];
  distanceToCentroid: number;
  avgFlow: number;
  peakHours: number[];
}

export interface AlertRecord {
  id: string;
  stationId: string;
  stationName: string;
  alertLevel: 'warning' | 'danger';
  alertType: 'high_flow' | 'sudden_increase' | 'abnormal_drop';
  threshold: number;
  actualValue: number;
  timestamp: string;
  message: string;
}

export interface AlertThreshold {
  warning: number;
  danger: number;
  suddenIncreaseRate: number;
  abnormalDropRate: number;
}

export interface PeakHourStat {
  stationId: string;
  stationName: string;
  hour: number;
  avgFlow: number;
  isPeak: boolean;
}

export interface StationStats {
  stationId: string;
  stationName: string;
  totalFlowToday: number;
  avgFlowPerHour: number;
  peakFlow: number;
  peakTime: string;
  alertCount: number;
}

export interface HeatmapData {
  stationId: string;
  stationName: string;
  position: { x: number; y: number };
  intensity: number;
  flowCount: number;
}

export interface OverviewStats {
  totalStations: number;
  totalFlowToday: number;
  currentTotalFlow: number;
  avgFlowPerStation: number;
  peakFlowStation: {
    stationId: string;
    stationName: string;
    peakFlow: number;
  } | null;
  lineStats: { lineId: string; lineName: string; totalFlow: number; stationCount: number }[];
  stationStats: StationStats[];
}

export interface PredictionPoint {
  timestamp: string;
  predictedFlow: number;
  lowerBound: number;
  upperBound: number;
  confidence: number;
}

export interface PredictionResult {
  stationId: string;
  stationName: string;
  currentFlow: number;
  predictions: PredictionPoint[];
  trendDirection: 'up' | 'down' | 'stable';
  predictedPeak: number;
  predictedPeakTime: string;
  modelAccuracy: number;
}

export interface RankedStation {
  stationId: string;
  stationName: string;
  lineId: string;
  lineName: string;
  totalFlow: number;
  avgFlowPerHour: number;
  peakFlow: number;
  growthRate: number;
  rank: number;
  prevRank: number;
  rankChange: number;
  alertCount: number;
}

export interface RankingResult {
  timestamp: number;
  rankings: RankedStation[];
  topGainers: RankedStation[];
  topLosers: RankedStation[];
  mostAlerted: RankedStation[];
}
