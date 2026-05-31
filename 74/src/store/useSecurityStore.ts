import { create } from 'zustand';
import {
  SecurityData,
  Device,
  DeviceStatusStats,
  TimeSeriesFeatures,
  AnomalyCluster,
  AnomalyAlert,
  RiskStatistics,
  HeatmapPoint,
  HourlyRiskData,
  Severity,
  RiskOverview,
  RiskTrendHourly,
  AreaRiskRanking,
  AreaPrediction,
  DeviceRankingItem
} from '../../shared/types.js';
import { api } from '../utils/api.js';

interface SecurityState {
  realtimeData: SecurityData[];
  devices: Device[];
  deviceStatus: DeviceStatusStats | null;
  deviceStats: DeviceStatusStats | null;
  features: TimeSeriesFeatures[];
  clusters: AnomalyCluster[];
  alerts: AnomalyAlert[];
  alertStats: {
    pending: number;
    processing: number;
    resolved: number;
    byLevel: Record<Severity, number>;
  } | null;
  areaRisks: RiskStatistics[];
  heatmapData: { points: HeatmapPoint[]; maxValue: number; updateTime: number } | null;
  hourlyRiskData: HourlyRiskData[];
  overallStats: {
    overallRiskScore: number;
    overallRiskLevel: 'safe' | 'caution' | 'danger';
    totalAlerts: number;
    dangerAreas: number;
    cautionAreas: number;
    safeAreas: number;
    avgDeviceHealth: number;
    timeRange: string;
  } | null;
  topRiskAreas: RiskStatistics[];
  deviceHealth: Array<{ area: string; areaName: string; health: number; total: number; online: number }>;
  areas: { code: string; name: string }[];
  dataCounts: { normal: number; warning: number; danger: number } | null;
  loading: Record<string, boolean>;
  error: string | null;
  selectedTimeRange: '1h' | '6h' | '24h' | '7d';
  selectedArea: string | null;

  riskOverview: RiskOverview | null;
  riskTrend: RiskTrendHourly[];
  areaRanking: AreaRiskRanking[];
  predictions: AreaPrediction[];
  deviceRanking: DeviceRankingItem[];

  setSelectedTimeRange: (range: '1h' | '6h' | '24h' | '7d') => void;
  setSelectedArea: (area: string | null) => void;
  addRealtimeData: (data: SecurityData) => void;
  addAlert: (alert: AnomalyAlert) => void;
  updateRealtimeData: (data: SecurityData) => void;
  updateAlert: (alert: AnomalyAlert) => void;
  updateStats: (stats: any) => void;

  fetchRealtimeData: () => Promise<void>;
  fetchDevices: () => Promise<void>;
  fetchDeviceStatus: () => Promise<void>;
  fetchDeviceStats: () => Promise<void>;
  fetchFeatures: (deviceId?: string) => Promise<void>;
  fetchClusters: () => Promise<void>;
  fetchAlerts: () => Promise<void>;
  fetchAlertStats: () => Promise<void>;
  fetchAreaRisks: () => Promise<void>;
  fetchHeatmapData: () => Promise<void>;
  fetchHourlyRiskData: () => Promise<void>;
  fetchOverallStats: () => Promise<void>;
  fetchTopRiskAreas: () => Promise<void>;
  fetchDeviceHealth: () => Promise<void>;
  fetchAreas: () => Promise<void>;
  fetchDataCounts: () => Promise<void>;
  fetchAll: () => Promise<void>;
  fetchRiskOverview: () => Promise<void>;
  fetchRiskTrend: () => Promise<void>;
  fetchAreaRanking: () => Promise<void>;
  fetchPredictions: () => Promise<void>;
  fetchDeviceRanking: () => Promise<void>;
  updateAlertStatus: (alertId: string, status: AnomalyAlert['status']) => Promise<void>;
}

export const useSecurityStore = create<SecurityState>((set, get) => ({
  realtimeData: [],
  devices: [],
  deviceStatus: null,
  deviceStats: null,
  features: [],
  clusters: [],
  alerts: [],
  alertStats: null,
  areaRisks: [],
  heatmapData: null,
  hourlyRiskData: [],
  overallStats: null,
  topRiskAreas: [],
  deviceHealth: [],
  areas: [],
  dataCounts: null,
  loading: {},
  error: null,
  selectedTimeRange: '24h',
  selectedArea: null,

  riskOverview: null,
  riskTrend: [],
  areaRanking: [],
  predictions: [],
  deviceRanking: [],

  setSelectedTimeRange: (range) => set({ selectedTimeRange: range }),
  setSelectedArea: (area) => set({ selectedArea: area }),

  addRealtimeData: (data) => set((state) => ({
    realtimeData: [data, ...state.realtimeData].slice(0, 200)
  })),

  addAlert: (alert) => set((state) => {
    const exists = state.alerts.some(a => a.id === alert.id);
    if (exists) return state;
    return { alerts: [alert, ...state.alerts].slice(0, 100) };
  }),

  updateRealtimeData: (data) => set((state) => ({
    realtimeData: [data, ...state.realtimeData].slice(0, 200)
  })),

  updateAlert: (alert) => set((state) => ({
    alerts: [alert, ...state.alerts].slice(0, 100)
  })),

  updateStats: (stats) => {
    if (stats.deviceStatus) {
      set({ deviceStatus: stats.deviceStatus, deviceStats: stats.deviceStatus });
    }
  },

  fetchRealtimeData: async () => {
    try {
      set({ loading: { ...get().loading, realtimeData: true } });
      const res = await api.data.realtime(100);
      if (res.success) {
        set({ realtimeData: res.data as any });
      }
    } catch (error) {
      set({ error: 'Failed to fetch realtime data' });
    } finally {
      set({ loading: { ...get().loading, realtimeData: false } });
    }
  },

  fetchDevices: async () => {
    try {
      set({ loading: { ...get().loading, devices: true } });
      const res = await api.data.devices();
      if (res.success) {
        set({ devices: res.data as any });
      }
    } catch (error) {
      set({ error: 'Failed to fetch devices' });
    } finally {
      set({ loading: { ...get().loading, devices: false } });
    }
  },

  fetchDeviceStatus: async () => {
    try {
      set({ loading: { ...get().loading, deviceStatus: true } });
      const res = await api.data.deviceStatus();
      if (res.success) {
        set({ deviceStatus: res.data as any, deviceStats: res.data as any });
      }
    } catch (error) {
      set({ error: 'Failed to fetch device status' });
    } finally {
      set({ loading: { ...get().loading, deviceStatus: false } });
    }
  },

  fetchDeviceStats: async () => {
    await get().fetchDeviceStatus();
  },

  fetchFeatures: async (deviceId) => {
    try {
      set({ loading: { ...get().loading, features: true } });
      const res = await api.features.extract(deviceId, get().selectedTimeRange);
      if (res.success) {
        set({ features: res.data as any });
      }
    } catch (error) {
      set({ error: 'Failed to fetch features' });
    } finally {
      set({ loading: { ...get().loading, features: false } });
    }
  },

  fetchClusters: async () => {
    try {
      set({ loading: { ...get().loading, clusters: true } });
      const res = await api.anomaly.clusters(20);
      if (res.success) {
        set({ clusters: res.data as any });
      }
    } catch (error) {
      set({ error: 'Failed to fetch clusters' });
    } finally {
      set({ loading: { ...get().loading, clusters: false } });
    }
  },

  fetchAlerts: async () => {
    try {
      set({ loading: { ...get().loading, alerts: true } });
      const res = await api.anomaly.alerts(50);
      if (res.success && res.data) {
        const newAlerts = (res.data as any[]) || [];
        const seen = new Set<string>();
        const deduped = newAlerts.filter((a: any) => {
          if (seen.has(a.id)) return false;
          seen.add(a.id);
          return true;
        });
        set({ alerts: deduped });
      }
    } catch (error) {
      console.error('Failed to fetch alerts:', error);
    } finally {
      set({ loading: { ...get().loading, alerts: false } });
    }
  },

  fetchAlertStats: async () => {
    try {
      set({ loading: { ...get().loading, alertStats: true } });
      const res = await api.anomaly.stats();
      if (res.success) {
        set({ alertStats: res.data as any });
      }
    } catch (error) {
      set({ error: 'Failed to fetch alert stats' });
    } finally {
      set({ loading: { ...get().loading, alertStats: false } });
    }
  },

  fetchAreaRisks: async () => {
    try {
      set({ loading: { ...get().loading, areaRisks: true } });
      const res = await api.risk.areas(get().selectedTimeRange);
      if (res.success) {
        set({ areaRisks: res.data as any });
      }
    } catch (error) {
      set({ error: 'Failed to fetch area risks' });
    } finally {
      set({ loading: { ...get().loading, areaRisks: false } });
    }
  },

  fetchHeatmapData: async () => {
    try {
      set({ loading: { ...get().loading, heatmapData: true } });
      const res = await api.risk.heatmap(get().selectedTimeRange, get().selectedArea || undefined);
      if (res.success && res.data) {
        const heatmap = res.data as any;
        if (heatmap.points && Array.isArray(heatmap.points)) {
          set({ heatmapData: heatmap });
        } else if (heatmap.data && Array.isArray(heatmap.data.points)) {
          set({ heatmapData: heatmap.data });
        }
      }
    } catch (error) {
      console.error('Failed to fetch heatmap data:', error);
    } finally {
      set({ loading: { ...get().loading, heatmapData: false } });
    }
  },

  fetchHourlyRiskData: async () => {
    try {
      set({ loading: { ...get().loading, hourlyRiskData: true } });
      const res = await api.risk.hourly(get().selectedArea || undefined);
      if (res.success) {
        set({ hourlyRiskData: res.data as any });
      }
    } catch (error) {
      set({ error: 'Failed to fetch hourly risk data' });
    } finally {
      set({ loading: { ...get().loading, hourlyRiskData: false } });
    }
  },

  fetchOverallStats: async () => {
    try {
      set({ loading: { ...get().loading, overallStats: true } });
      const res = await api.risk.overall(get().selectedTimeRange);
      if (res.success) {
        set({ overallStats: res.data as any });
      }
    } catch (error) {
      set({ error: 'Failed to fetch overall stats' });
    } finally {
      set({ loading: { ...get().loading, overallStats: false } });
    }
  },

  fetchTopRiskAreas: async () => {
    try {
      set({ loading: { ...get().loading, topRiskAreas: true } });
      const res = await api.risk.topAreas(5, get().selectedTimeRange);
      if (res.success) {
        set({ topRiskAreas: res.data as any });
      }
    } catch (error) {
      set({ error: 'Failed to fetch top risk areas' });
    } finally {
      set({ loading: { ...get().loading, topRiskAreas: false } });
    }
  },

  fetchDeviceHealth: async () => {
    try {
      set({ loading: { ...get().loading, deviceHealth: true } });
      const res = await api.risk.deviceHealth();
      if (res.success) {
        set({ deviceHealth: res.data as any });
      }
    } catch (error) {
      set({ error: 'Failed to fetch device health' });
    } finally {
      set({ loading: { ...get().loading, deviceHealth: false } });
    }
  },

  fetchAreas: async () => {
    try {
      set({ loading: { ...get().loading, areas: true } });
      const res = await api.data.areas();
      if (res.success) {
        set({ areas: res.data as any });
      }
    } catch (error) {
      set({ error: 'Failed to fetch areas' });
    } finally {
      set({ loading: { ...get().loading, areas: false } });
    }
  },

  fetchDataCounts: async () => {
    try {
      set({ loading: { ...get().loading, dataCounts: true } });
      const res = await api.data.count();
      if (res.success) {
        set({ dataCounts: res.data as any });
      }
    } catch (error) {
      set({ error: 'Failed to fetch data counts' });
    } finally {
      set({ loading: { ...get().loading, dataCounts: false } });
    }
  },

  fetchRiskOverview: async () => {
    try {
      set({ loading: { ...get().loading, riskOverview: true } });
      const res = await api.risk.overall(get().selectedTimeRange);
      if (res.success) {
        const data = res.data as any;
        set({
          riskOverview: {
            overallRisk: data.overallRiskScore || 0,
            alertCount: data.totalAlerts || 0,
            alertTrend: 0.15,
            deviceHealth: data.avgDeviceHealth || 0,
            totalDevices: 30,
            anomalyRate: 0.08,
            totalData: 15000,
            peakHours: ['22:00', '02:00']
          }
        });
      }
    } catch (error) {
      set({ error: 'Failed to fetch risk overview' });
    } finally {
      set({ loading: { ...get().loading, riskOverview: false } });
    }
  },

  fetchRiskTrend: async () => {
    try {
      set({ loading: { ...get().loading, riskTrend: true } });
      const res = await api.risk.hourly(get().selectedArea || undefined);
      if (res.success) {
        set({ riskTrend: res.data as any });
      }
    } catch (error) {
      set({ error: 'Failed to fetch risk trend' });
    } finally {
      set({ loading: { ...get().loading, riskTrend: false } });
    }
  },

  fetchAreaRanking: async () => {
    try {
      set({ loading: { ...get().loading, areaRanking: true } });
      const res = await api.risk.areas(get().selectedTimeRange);
      if (res.success) {
        const data = (res.data as any[]).map(r => ({
          area: r.area,
          areaName: r.areaName,
          riskScore: r.riskScore,
          alertCount: r.alertCount,
          anomalyRate: r.anomalyRate || 0
        }));
        set({ areaRanking: data });
      }
    } catch (error) {
      console.error('Failed to fetch area ranking:', error);
    } finally {
      set({ loading: { ...get().loading, areaRanking: false } });
    }
  },

  fetchPredictions: async () => {
    try {
      set({ loading: { ...get().loading, predictions: true } });
      const res = await api.prediction.risk(get().selectedArea || undefined, 6);
      if (res.success) {
        set({ predictions: res.data as any });
      }
    } catch (error) {
      console.error('Failed to fetch predictions:', error);
    } finally {
      set({ loading: { ...get().loading, predictions: false } });
    }
  },

  fetchDeviceRanking: async () => {
    try {
      set({ loading: { ...get().loading, deviceRanking: true } });
      const res = await api.prediction.deviceRanking(get().selectedTimeRange, 20);
      if (res.success) {
        set({ deviceRanking: res.data as any });
      }
    } catch (error) {
      console.error('Failed to fetch device ranking:', error);
    } finally {
      set({ loading: { ...get().loading, deviceRanking: false } });
    }
  },

  fetchAll: async () => {
    await Promise.all([
      get().fetchRealtimeData(),
      get().fetchDevices(),
      get().fetchDeviceStatus(),
      get().fetchClusters(),
      get().fetchAlerts(),
      get().fetchAlertStats(),
      get().fetchAreaRisks(),
      get().fetchHeatmapData(),
      get().fetchHourlyRiskData(),
      get().fetchOverallStats(),
      get().fetchTopRiskAreas(),
      get().fetchDeviceHealth(),
      get().fetchAreas(),
      get().fetchDataCounts(),
      get().fetchRiskOverview(),
      get().fetchRiskTrend(),
      get().fetchAreaRanking(),
      get().fetchPredictions(),
      get().fetchDeviceRanking()
    ]);
  },

  updateAlertStatus: async (alertId, status) => {
    try {
      await api.anomaly.updateAlertStatus(alertId, status);
      set((state) => ({
        alerts: state.alerts.map(a =>
          a.id === alertId ? { ...a, status } : a
        )
      }));
      await get().fetchAlertStats();
    } catch (error) {
      set({ error: 'Failed to update alert status' });
    }
  }
}));

export default useSecurityStore;
