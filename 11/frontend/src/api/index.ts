import axios from 'axios'
import type { LogEntry, LogFilter, TraceLink, AnomalyCluster, DataSource, DashboardConfig } from '../types'

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' }
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('auth_token')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export const logApi = {
  queryLogs: (filter: LogFilter) =>
    api.post<{
      success: boolean
      data: LogEntry[]
      total: number
      page: number
      pageSize: number
      hasMore: boolean
      took?: number
    }>('/logs/query', filter),

  getLogById: (id: string) =>
    api.get<LogEntry>(`/logs/${id}`),

  getLogStats: (filter: LogFilter) =>
    api.post<{ data: Record<string, number> }>('/logs/stats', filter),

  getLogLevels: () =>
    api.get<string[]>('/logs/levels'),

  getServices: () =>
    api.get<string[]>('/logs/services'),

  getNodes: () =>
    api.get<string[]>('/logs/nodes')
}

export const traceApi = {
  getTraceByTraceId: (traceId: string) =>
    api.get<{ success: boolean; data: TraceLink }>(`/trace/${traceId}`),

  getTraceList: (filter: LogFilter) =>
    api.post<{ data: TraceLink[]; total: number }>('/trace/list', filter),

  getTraceTimeline: (traceId: string) =>
    api.get<any>(`/trace/${traceId}/timeline`),

  compareTraces: (traceIds: string[]) =>
    api.post<any>('/trace/compare', { traceIds })
}

export const clusterApi = {
  getAnomalyClusters: (params: { timeRange?: string; severity?: string }) =>
    api.get<AnomalyCluster[]>('/clusters', { params }),

  getClusterById: (clusterId: string) =>
    api.get<AnomalyCluster>(`/clusters/${clusterId}`),

  getClusterLogs: (clusterId: string, page?: number, pageSize?: number) =>
    api.get<{ data: LogEntry[]; total: number }>(`/clusters/${clusterId}/logs`, {
      params: { page, pageSize }
    }),

  getClusterPatterns: (timeRange?: string) =>
    api.get<any>('/clusters/patterns', { params: { timeRange } })
}

export const sourceApi = {
  getDataSources: () =>
    api.get<DataSource[]>('/sources'),

  createDataSource: (source: Omit<DataSource, 'id'>) =>
    api.post<DataSource>('/sources', source),

  updateDataSource: (id: string, source: Partial<DataSource>) =>
    api.put(`/sources/${id}`, source),

  deleteDataSource: (id: string) =>
    api.delete(`/sources/${id}`),

  testConnection: (id: string) =>
    api.post<{ success: boolean; message?: string }>(`/sources/${id}/test`)
}

export const dashboardApi = {
  getDashboards: () =>
    api.get<DashboardConfig[]>('/dashboards'),

  getDashboard: (id: string) =>
    api.get<DashboardConfig>(`/dashboards/${id}`),

  createDashboard: (dashboard: Omit<DashboardConfig, 'id'>) =>
    api.post<DashboardConfig>('/dashboards', dashboard),

  updateDashboard: (id: string, dashboard: Partial<DashboardConfig>) =>
    api.put(`/dashboards/${id}`, dashboard),

  deleteDashboard: (id: string) =>
    api.delete(`/dashboards/${id}`)
}

export default api