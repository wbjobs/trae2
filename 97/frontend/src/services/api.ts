import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 30000
})

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
    }
    return Promise.reject(error)
  }
)

export const dashboardApi = {
  getOverview: (hours: number = 24) =>
    api.get(`/dashboard/overview?hours=${hours}`),

  getDeviceStatus: (hours: number = 24) =>
    api.get(`/dashboard/device-status?hours=${hours}`),

  getMetricTrend: (deviceId: string, metricName: string, hours: number = 24, period: string = 'hour') =>
    api.get(`/dashboard/metric-trend?device_id=${deviceId}&metric_name=${metricName}&hours=${hours}&period=${period}`),

  getAnomalyAlerts: (hours: number = 24, limit: number = 50) =>
    api.get(`/dashboard/anomaly-alerts?hours=${hours}&limit=${limit}`),

  getRealtimeData: (deviceIds?: string) =>
    api.get(`/dashboard/realtime${deviceIds ? `?device_ids=${deviceIds}` : ''}`),

  getDeviceComparison: (metricName: string, hours: number = 24) =>
    api.get(`/dashboard/comparison?metric_name=${metricName}&hours=${hours}`)
}

export const dataApi = {
  getDevices: () => api.get('/data/devices'),
  getMetrics: () => api.get('/data/metrics'),
  getSampleData: (hours: number = 24, interval: number = 5) =>
    api.get(`/data/sample?hours=${hours}&interval_minutes=${interval}`),
  getCleanedData: (hours: number = 24, interval: number = 5) =>
    api.get(`/data/sample/cleaned?hours=${hours}&interval_minutes=${interval}`),
  getAggregatedData: (hours: number = 24, period: string = 'hour') =>
    api.get(`/data/sample/aggregated?hours=${hours}&period=${period}`),
  getQualityReport: (hours: number = 24) =>
    api.get(`/data/quality-report?hours=${hours}`)
}

export const reportApi = {
  getTemplates: () => api.get('/reports/templates'),
  generateReport: (reportType: string, config: any) =>
    api.post('/reports/generate', { report_type: reportType, config, format: 'json' }),
  exportExcel: (reportType: string, config: any) =>
    api.post('/reports/export/excel', { report_type: reportType, config, format: 'excel' }, {
      responseType: 'blob'
    }),
  exportPDF: (reportType: string, config: any) =>
    api.post('/reports/export/pdf', { report_type: reportType, config, format: 'pdf' }, {
      responseType: 'blob'
    }),
  getReports: () => api.get('/reports/list'),
  saveReport: (reportData: any) => api.post('/reports/save', reportData),
  deleteReport: (reportId: string) => api.delete(`/reports/${reportId}`)
}

export const authApi = {
  login: (username: string, password: string) => {
    const formData = new FormData()
    formData.append('username', username)
    formData.append('password', password)
    return api.post('/auth/token', formData)
  },
  getMe: () => api.get('/auth/me'),
  getRoles: () => api.get('/auth/roles')
}

export const layoutApi = {
  getDefaultLayout: () => api.get('/layout/default'),
  getLayoutList: (userId: string) => api.get(`/layout/list?user_id=${userId}`),
  getLayout: (layoutId: string, userId: string) => 
    api.get(`/layout/${layoutId}?user_id=${userId}`),
  createLayout: (data: any) => api.post('/layout', data),
  updateLayout: (layoutId: string, userId: string, data: any) => 
    api.put(`/layout/${layoutId}?user_id=${userId}`, data),
  deleteLayout: (layoutId: string, userId: string) => 
    api.delete(`/layout/${layoutId}?user_id=${userId}`),
  saveWidgets: (layoutId: string, userId: string, widgets: any) => 
    api.post(`/layout/${layoutId}/save-widgets?user_id=${userId}`, widgets),
  getTemplates: () => api.get('/layout/templates/list'),
  getTemplate: (templateId: string) => api.get(`/layout/templates/${templateId}`)
}

export const analysisApi = {
  getTrendAnalysis: (deviceId: string, metricName: string, hours?: number, window?: number, threshold?: number) => {
    let url = `/analysis/trend-analysis?device_id=${deviceId}&metric_name=${metricName}`
    if (hours) url += `&hours=${hours}`
    if (window) url += `&window=${window}`
    if (threshold) url += `&threshold=${threshold}`
    return api.get(url)
  },
  getTrendChanges: (deviceId: string, metricName: string, hours?: number, method?: string) => {
    let url = `/analysis/trend/changes?device_id=${deviceId}&metric_name=${metricName}`
    if (hours) url += `&hours=${hours}`
    if (method) url += `&method=${method}`
    return api.get(url)
  },
  drillDown: (data: any) => api.post('/analysis/drill-down', data),
  timeDrillDown: (hours?: number, currentLevel?: string, deviceIds?: string, metricNames?: string) => {
    let url = `/analysis/drill-down/time?hours=${hours || 24}`
    if (currentLevel) url += `&current_level=${currentLevel}`
    if (deviceIds) url += `&device_ids=${deviceIds}`
    if (metricNames) url += `&metric_names=${metricNames}`
    return api.get(url)
  },
  deviceDrillDown: (hours?: number, currentLevel?: string, locations?: string, deviceTypes?: string) => {
    let url = `/analysis/drill-down/device?hours=${hours || 24}`
    if (currentLevel) url += `&current_level=${currentLevel}`
    if (locations) url += `&locations=${locations}`
    if (deviceTypes) url += `&device_types=${deviceTypes}`
    return api.get(url)
  },
  metricDrillDown: (hours?: number, currentLevel?: string, deviceIds?: string) => {
    let url = `/analysis/drill-down/metric?hours=${hours || 24}`
    if (currentLevel) url += `&current_level=${currentLevel}`
    if (deviceIds) url += `&device_ids=${deviceIds}`
    return api.get(url)
  },
  getMetricsHealth: (hours?: number, deviceIds?: string) => {
    let url = `/analysis/metrics/health?hours=${hours || 24}`
    if (deviceIds) url += `&device_ids=${deviceIds}`
    return api.get(url)
  }
}

export default api
