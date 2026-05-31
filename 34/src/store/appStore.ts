import { create } from 'zustand';
import type {
  StationInfo,
  StationFlow,
  TimeSeriesFeature,
  ClusterResult,
  AlertRecord,
  AlertThreshold,
  StationStats,
  HeatmapData,
  OverviewStats,
} from '@/types';

interface AppState {
  stations: StationInfo[];
  realtimeFlow: StationFlow[];
  historicalFlow: Record<string, StationFlow[]>;
  timeSeriesFeatures: TimeSeriesFeature[];
  clusteringResults: ClusterResult[];
  alerts: AlertRecord[];
  activeAlertCount: number;
  alertThresholds: AlertThreshold | null;
  stationStats: StationStats[];
  heatmapData: HeatmapData[];
  overviewStats: OverviewStats | null;
  selectedStation: StationInfo | null;
  loading: boolean;
  error: string | null;

  setStations: (stations: StationInfo[]) => void;
  setRealtimeFlow: (flow: StationFlow[]) => void;
  setHistoricalFlow: (flow: Record<string, StationFlow[]>) => void;
  setTimeSeriesFeatures: (features: TimeSeriesFeature[]) => void;
  setClusteringResults: (results: ClusterResult[]) => void;
  setAlerts: (alerts: AlertRecord[]) => void;
  setActiveAlertCount: (count: number) => void;
  setAlertThresholds: (thresholds: AlertThreshold) => void;
  setStationStats: (stats: StationStats[]) => void;
  setHeatmapData: (data: HeatmapData[]) => void;
  setOverviewStats: (stats: OverviewStats) => void;
  setSelectedStation: (station: StationInfo | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  stations: [],
  realtimeFlow: [],
  historicalFlow: {},
  timeSeriesFeatures: [],
  clusteringResults: [],
  alerts: [],
  activeAlertCount: 0,
  alertThresholds: null,
  stationStats: [],
  heatmapData: [],
  overviewStats: null,
  selectedStation: null,
  loading: false,
  error: null,

  setStations: (stations) => set({ stations }),
  setRealtimeFlow: (realtimeFlow) => set({ realtimeFlow }),
  setHistoricalFlow: (historicalFlow) => set({ historicalFlow }),
  setTimeSeriesFeatures: (timeSeriesFeatures) => set({ timeSeriesFeatures }),
  setClusteringResults: (clusteringResults) => set({ clusteringResults }),
  setAlerts: (alerts) => set({ alerts }),
  setActiveAlertCount: (activeAlertCount) => set({ activeAlertCount }),
  setAlertThresholds: (alertThresholds) => set({ alertThresholds }),
  setStationStats: (stationStats) => set({ stationStats }),
  setHeatmapData: (heatmapData) => set({ heatmapData }),
  setOverviewStats: (overviewStats) => set({ overviewStats }),
  setSelectedStation: (selectedStation) => set({ selectedStation }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
}));
