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
  TimeRange,
  DeviceType,
  Severity,
  AreaPrediction,
  DeviceRankingItem
} from '../../shared/types.js';

const API_BASE = '/api';

async function request<T>(url: string, options?: RequestInit): Promise<{ success: boolean; data: T; message?: string }> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(`${API_BASE}${url}`, {
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers
      },
      signal: controller.signal,
      ...options
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`API response not ok: ${url} status=${response.status}`);
      return { success: false, data: null as unknown as T };
    }

    return await response.json();
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      console.warn(`API request timeout: ${url}`);
    }
    return { success: false, data: null as unknown as T };
  }
}

export const api = {
  data: {
    receive: (data: Omit<SecurityData, 'id'>) =>
      request('/data/receive', { method: 'POST', body: JSON.stringify(data) }),

    realtime: (limit: number = 100, deviceType?: DeviceType) =>
      request<SecurityData[]>(`/data/realtime?limit=${limit}${deviceType ? `&deviceType=${deviceType}` : ''}`),

    history: (startTime: number, endTime: number, deviceId?: string, area?: string) => {
      let url = `/data/history?startTime=${startTime}&endTime=${endTime}`;
      if (deviceId) url += `&deviceId=${deviceId}`;
      if (area) url += `&area=${area}`;
      return request<SecurityData[]>(url);
    },

    devices: () => request<Device[]>('/data/devices'),

    deviceStatus: () => request<DeviceStatusStats>('/data/devices/status'),

    areas: () => request<{ code: string; name: string }[]>('/data/areas'),

    count: (startTime?: number, endTime?: number) => {
      let url = '/data/count';
      if (startTime && endTime) url += `?startTime=${startTime}&endTime=${endTime}`;
      return request<{ normal: number; warning: number; danger: number }>(url);
    }
  },

  features: {
    extract: (deviceId?: string, timeRange: TimeRange = '24h', period: 'hour' | 'day' | 'week' = 'hour') => {
      let url = `/features/extract?timeRange=${timeRange}&period=${period}`;
      if (deviceId) url += `&deviceId=${deviceId}`;
      return request<TimeSeriesFeatures[]>(url);
    }
  },

  anomaly: {
    clusters: (limit: number = 20) =>
      request<AnomalyCluster[]>(`/anomaly/clusters?limit=${limit}`),

    alerts: (limit: number = 50, level?: Severity, status?: AnomalyAlert['status']) => {
      let url = `/anomaly/alerts?limit=${limit}`;
      if (level) url += `&level=${level}`;
      if (status) url += `&status=${status}`;
      return request<AnomalyAlert[]>(url);
    },

    updateAlertStatus: (alertId: string, status: AnomalyAlert['status']) =>
      request(`/anomaly/alerts/${alertId}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status })
      }),

    stats: () => request<{
      pending: number;
      processing: number;
      resolved: number;
      byLevel: Record<Severity, number>;
    }>('/anomaly/stats'),

    analyze: () =>
      request<{ clusters: AnomalyCluster[]; alertsCreated: number }>('/anomaly/analyze', { method: 'POST' })
  },

  risk: {
    heatmap: (timeRange: TimeRange = '24h', area?: string, deviceType?: DeviceType) => {
      let url = `/risk/heatmap?timeRange=${timeRange}`;
      if (area) url += `&area=${area}`;
      if (deviceType) url += `&deviceType=${deviceType}`;
      return request<{ points: HeatmapPoint[]; maxValue: number; updateTime: number }>(url);
    },

    calculate: (area: string, timeRange: TimeRange = '24h') =>
      request<RiskStatistics>(`/risk/calculate?area=${area}&timeRange=${timeRange}`),

    areas: (timeRange: TimeRange = '24h') =>
      request<RiskStatistics[]>(`/risk/areas?timeRange=${timeRange}`),

    hourly: (area?: string) => {
      let url = '/risk/hourly';
      if (area) url += `?area=${area}`;
      return request<HourlyRiskData[]>(url);
    },

    deviceHealth: () =>
      request<Array<{ area: string; areaName: string; health: number; total: number; online: number }>>('/risk/device-health'),

    topAreas: (limit: number = 5, timeRange: TimeRange = '24h') =>
      request<RiskStatistics[]>(`/risk/top-areas?limit=${limit}&timeRange=${timeRange}`),

    overall: (timeRange: TimeRange = '24h') =>
      request<{
        overallRiskScore: number;
        overallRiskLevel: 'safe' | 'caution' | 'danger';
        totalAlerts: number;
        dangerAreas: number;
        cautionAreas: number;
        safeAreas: number;
        avgDeviceHealth: number;
        timeRange: string;
      }>(`/risk/overall?timeRange=${timeRange}`)
  },

  prediction: {
    risk: (area?: string, hours: number = 6) => {
      let url = `/prediction/risk?hours=${hours}`;
      if (area) url += `&area=${area}`;
      return request<AreaPrediction[]>(url);
    },

    deviceRanking: (timeRange: TimeRange = '24h', limit: number = 20) =>
      request<DeviceRankingItem[]>(`/prediction/device-ranking?timeRange=${timeRange}&limit=${limit}`)
  }
};

export const runClustering = () => api.anomaly.analyze().then(res => res.data);

export default api;
