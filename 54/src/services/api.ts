import {
  SensorData,
  FeaturesResponse,
  AnomaliesResponse,
  RiskStatistics,
  HeatmapData,
  DeviceStatus,
  ZoneData,
  ZoneRankings,
  PredictionResponse,
} from '../../shared/types';

const API_BASE = '/api';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${url}`, {
    headers: {
      'Content-Type': 'application/json',
    },
    ...options,
  });
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return response.json();
}

export const apiService = {
  getRealtimeData: () =>
    request<{ latestData: SensorData[]; timestamp: number }>('/data/realtime'),

  getFeatures: () => request<FeaturesResponse>('/analysis/features'),

  getAnomalies: () => request<AnomaliesResponse>('/analysis/anomalies'),

  getRisk: () =>
    request<
      RiskStatistics & {
        currentRisk: { level: number; category: string };
      }
    >('/analysis/risk'),

  getTimeseries: (hours: number = 24, interval: number = 300) =>
    request<
      Array<{
        timestamp: number;
        temperature: number;
        humidity: number;
        co2: number;
        ch4: number;
      }>
    >(`/analysis/timeseries?hours=${hours}&interval=${interval}`),

  getPrediction: () => request<PredictionResponse>('/analysis/prediction'),

  getZones: () => request<ZoneData[]>('/analysis/zones'),

  getZoneRankings: () => request<ZoneRankings>('/analysis/zones/ranking'),

  getHeatmap: (type: string) => request<HeatmapData[]>(`/data/heatmap/${type}`),

  getDevices: () => request<DeviceStatus[]>('/data/devices'),

  sendData: (data: SensorData) =>
    request('/data/receive', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};
