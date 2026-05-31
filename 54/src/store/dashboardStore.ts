import { create } from 'zustand';
import {
  SensorData,
  FeaturesResponse,
  AnomalyCluster,
  RiskStatistics,
  DeviceStatus,
  HeatmapData,
  ZoneData,
  ZoneRankings,
  PredictionResponse,
} from '../../shared/types';

interface DashboardState {
  realtimeData: SensorData[];
  features: FeaturesResponse | null;
  anomalies: AnomalyCluster[];
  riskStats: (RiskStatistics & { currentRisk: { level: number; category: string } }) | null;
  devices: DeviceStatus[];
  timeseries: Array<{
    timestamp: number;
    temperature: number;
    humidity: number;
    co2: number;
    ch4: number;
  }>;
  heatmapData: HeatmapData[];
  heatmapType: 'temperature' | 'humidity' | 'co2' | 'ch4';
  prediction: PredictionResponse | null;
  zones: ZoneData[];
  zoneRankings: ZoneRankings | null;
  lastUpdate: number;
  loading: boolean;
  setRealtimeData: (data: SensorData[]) => void;
  setFeatures: (data: FeaturesResponse) => void;
  setAnomalies: (data: AnomalyCluster[]) => void;
  setRiskStats: (
    data: RiskStatistics & { currentRisk: { level: number; category: string } }
  ) => void;
  setDevices: (data: DeviceStatus[]) => void;
  setTimeseries: (
    data: Array<{
      timestamp: number;
      temperature: number;
      humidity: number;
      co2: number;
      ch4: number;
    }>
  ) => void;
  setHeatmapData: (data: HeatmapData[]) => void;
  setHeatmapType: (type: 'temperature' | 'humidity' | 'co2' | 'ch4') => void;
  setPrediction: (data: PredictionResponse) => void;
  setZones: (data: ZoneData[]) => void;
  setZoneRankings: (data: ZoneRankings) => void;
  setLoading: (loading: boolean) => void;
}

export const useDashboardStore = create<DashboardState>((set) => ({
  realtimeData: [],
  features: null,
  anomalies: [],
  riskStats: null,
  devices: [],
  timeseries: [],
  heatmapData: [],
  heatmapType: 'temperature',
  prediction: null,
  zones: [],
  zoneRankings: null,
  lastUpdate: Date.now(),
  loading: false,

  setRealtimeData: (data) => set({ realtimeData: data, lastUpdate: Date.now() }),
  setFeatures: (data) => set({ features: data }),
  setAnomalies: (data) => set({ anomalies: data }),
  setRiskStats: (data) => set({ riskStats: data }),
  setDevices: (data) => set({ devices: data }),
  setTimeseries: (data) => set({ timeseries: data }),
  setHeatmapData: (data) => set({ heatmapData: data }),
  setHeatmapType: (type) => set({ heatmapType: type }),
  setPrediction: (data) => set({ prediction: data }),
  setZones: (data) => set({ zones: data }),
  setZoneRankings: (data) => set({ zoneRankings: data }),
  setLoading: (loading) => set({ loading }),
}));
