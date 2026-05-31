import axios from 'axios'
import {
  Room,
  SensorData,
  AlertMessage,
  DeviceState,
  TableDataItem,
  AggregateData,
  LoadPrediction,
  LoadSummary,
  MaintenanceTask,
  MaintenanceWorker,
  AggregationStats,
  TimeWindowAggregation,
  TrendAnalysis,
  AnomalyDataPoint
} from '../types'

const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
})

export const gatewayApi = {
  getRooms: () => api.get<{ rooms: Room[] }>('/gateway/api/rooms'),
  getRoomSensors: (roomId: string) =>
    api.get<{ room_id: string; data: Record<string, SensorData>; device_count: number }>(
      `/gateway/api/sensor/latest/${roomId}`
    ),
  getSensorHistory: (roomId: string, deviceId: string, limit?: number) =>
    api.get<{ data: SensorData[]; count: number }>(
      `/gateway/api/sensor/history/${roomId}/${deviceId}`,
      { params: { limit } }
    ),
  triggerCollection: () => api.post('/gateway/api/sensor/collect'),
  getAggregateData: (roomIds?: string[]) =>
    api.get<AggregateData>('/gateway/api/sensor/aggregate', {
      params: roomIds ? { room_ids: roomIds } : {}
    }),
  getTableData: () =>
    api.get<{ data: TableDataItem[]; total: number }>('/gateway/api/sensor/table'),
  validateData: (data: { room_id: string; device_id: string; value: number; timestamp: string }) =>
    api.post<{ valid: boolean; issues: string[] }>('/gateway/api/sensor/validate', data),
  getGatewayStats: () => api.get('/gateway/api/stats'),
}

export const analysisApi = {
  getHealth: () => api.get('/analysis/api/health'),
  getThresholds: (sensorType?: string) =>
    api.get('/analysis/api/thresholds', { params: { type: sensorType } }),
  updateThresholds: (sensorType: string, data: any) =>
    api.put(`/analysis/api/thresholds/${sensorType}`, data),
  getArcStatus: (roomId: string, deviceId: string) =>
    api.get(`/analysis/api/arc/status/${roomId}/${deviceId}`),
  resetArcEvents: (roomId: string, deviceId: string) =>
    api.post(`/analysis/api/arc/reset/${roomId}/${deviceId}`),
  getStats: (roomId: string, deviceId: string, count?: number) =>
    api.get(`/analysis/api/stats/${roomId}/${deviceId}`, { params: { count } }),
  analyzeData: (data: any) =>
    api.post('/analysis/api/analyze', data),

  getLoadForecast: (roomId: string, deviceId: string, steps?: number) =>
    api.get<LoadPrediction>(`/analysis/api/forecast/${roomId}/${deviceId}`, { params: { steps } }),
  getPeakAlerts: () =>
    api.get<{ count: number; alerts: any[] }>('/analysis/api/forecast/peaks'),
  getForecastSummary: (roomId?: string) =>
    api.get<LoadSummary>('/analysis/api/forecast/summary', { params: { room_id: roomId } }),

  getAggregationStats: (roomId: string, deviceId: string, sensorType: string) =>
    api.get<AggregationStats>(`/analysis/api/aggregate/stats/${roomId}/${deviceId}/${sensorType}`),
  getWindowAggregation: (roomId: string, deviceId: string, sensorType: string, window?: number, start?: number, end?: number) =>
    api.get<TimeWindowAggregation>(`/analysis/api/aggregate/window/${roomId}/${deviceId}/${sensorType}`, {
      params: { window, start, end }
    }),
  getRoomAggregation: (roomId: string, sensorType?: string) =>
    api.get(`/analysis/api/aggregate/room/${roomId}`, { params: { sensor_type: sensorType } }),
  getGlobalAggregation: (sensorType?: string) =>
    api.get('/analysis/api/aggregate/global', { params: { sensor_type: sensorType } }),
  getTrendAnalysis: (roomId: string, deviceId: string, sensorType: string, window?: number) =>
    api.get<TrendAnalysis>(`/analysis/api/aggregate/trend/${roomId}/${deviceId}/${sensorType}`, {
      params: { window }
    }),
  getAnomalies: (roomId: string, deviceId: string, sensorType: string, threshold?: number) =>
    api.get<{ count: number; anomalies: AnomalyDataPoint[] }>(
      `/analysis/api/aggregate/anomalies/${roomId}/${deviceId}/${sensorType}`,
      { params: { threshold } }
    ),
  clearCache: (pattern?: string) =>
    api.post('/analysis/api/aggregate/cache/clear', { pattern }),

  getAnalysisStats: () => api.get('/analysis/api/stats'),
}

export const controlApi = {
  getDeviceState: (deviceId: string) =>
    api.get<{ device_id: string; state: DeviceState }>(
      `/control/api/device/${deviceId}/state`
    ),
  getRoomDevices: (roomId: string) =>
    api.get<{ room_id: string; devices: Record<string, DeviceState>; count: number }>(
      `/control/api/room/${roomId}/devices`
    ),
  getDevicesSummary: () =>
    api.get('/control/api/devices/summary'),
  sendCommand: (data: any) => api.post('/control/api/command', data),
  getCommandStatus: (commandId: string) =>
    api.get(`/control/api/command/${commandId}/status`),
  tripDevice: (deviceId: string, data?: any) =>
    api.post(`/control/api/device/${deviceId}/trip`, data),
  closeDevice: (deviceId: string, data?: any) =>
    api.post(`/control/api/device/${deviceId}/close`, data),
  configDevice: (deviceId: string, data: any) =>
    api.put(`/control/api/device/${deviceId}/config`, data),
  getCommandHistory: (deviceId: string, limit = 10) =>
    api.get(`/control/api/device/${deviceId}/history`, { params: { limit } }),
  getAutoTripStatus: () => api.get('/control/api/autotrip/status'),
  enableAutoTrip: () => api.post('/control/api/autotrip/enable'),
  disableAutoTrip: () => api.post('/control/api/autotrip/disable'),
  setCooldown: (minutes: number) =>
    api.put('/control/api/autotrip/cooldown', { minutes }),
  getControlStats: () => api.get('/control/api/stats'),
}

export const alertApi = {
  getActiveAlerts: (roomId?: string, level?: string) =>
    api.get<{ count: number; alerts: AlertMessage[] }>(
      '/alert/api/alerts/active',
      { params: { room_id: roomId, level } }
    ),
  getAlertHistory: (limit = 100) =>
    api.get<{ count: number; alerts: AlertMessage[] }>(
      '/alert/api/alerts/history',
      { params: { limit } }
    ),
  acknowledgeAlert: (alertId: string) =>
    api.post(`/alert/api/alerts/${alertId}/acknowledge`),
  clearAlerts: (roomId?: string) =>
    api.post('/alert/api/alerts/clear', { room_id: roomId }),
  getChannels: () => api.get<{ channels: string[] }>('/alert/api/alerts/channels'),
  testAlert: (data?: any) => api.post('/alert/api/alerts/test', data),

  getTasks: (status?: string, roomId?: string, priority?: string, assignedTo?: string) =>
    api.get<{ count: number; tasks: MaintenanceTask[] }>('/alert/api/tasks', {
      params: { status, room_id: roomId, priority, assigned_to: assignedTo }
    }),
  createTask: (data: any) =>
    api.post<{ task_id: string; task: MaintenanceTask }>('/alert/api/tasks', data),
  getTask: (taskId: string) =>
    api.get<MaintenanceTask>(`/alert/api/tasks/${taskId}`),
  assignTask: (taskId: string, workerId?: string) =>
    api.post(`/alert/api/tasks/${taskId}/assign`, { worker_id: workerId }),
  startTask: (taskId: string, workerId?: string) =>
    api.post(`/alert/api/tasks/${taskId}/start`, { worker_id: workerId }),
  completeTask: (taskId: string, notes?: string) =>
    api.post(`/alert/api/tasks/${taskId}/complete`, { notes }),
  escalateTask: (taskId: string, reason?: string) =>
    api.post(`/alert/api/tasks/${taskId}/escalate`, { reason }),
  cancelTask: (taskId: string, reason?: string) =>
    api.post(`/alert/api/tasks/${taskId}/cancel`, { reason }),
  createTaskFromAlert: (alertId: string) =>
    api.post<{ task_id: string; task: MaintenanceTask }>(`/alert/api/tasks/from-alert/${alertId}`),

  getWorkers: () =>
    api.get<{ count: number; workers: MaintenanceWorker[] }>('/alert/api/workers'),
  getWorkerTasks: (workerId: string) =>
    api.get(`/alert/api/workers/${workerId}/tasks`),

  getTaskStats: () => api.get('/alert/api/tasks/stats'),
  getAlertStats: () => api.get('/alert/api/stats'),
}
