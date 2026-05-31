import axios from 'axios'

const request = axios.create({
  baseURL: '/api',
  timeout: 30000
})

request.interceptors.response.use(
  response => response.data,
  error => {
    console.error('API Error:', error)
    return Promise.reject(error)
  }
)

export const getStats = (params) => request.get('/stats', { params })
export const getPowerTrend = (params) => request.get('/power-trend', { params })
export const getFaultDistribution = (params) => request.get('/fault-distribution', { params })
export const getDeviceStatus = (params) => request.get('/device-status', { params })
export const getLossAnalysis = (params) => request.get('/loss-analysis', { params })
export const getInverterData = (params) => request.get('/inverter-data', { params })
export const getPanelData = (params) => request.get('/panel-data', { params })
export const exportReport = (params) => request.get('/export-report', { 
  params, 
  responseType: 'blob' 
})
export const runDataCleaning = (data) => request.post('/data-cleaning', data)
export const getCleaningStatus = (taskId) => request.get(`/cleaning-status/${taskId}`)
export const getPowerYoYMoM = (params) => request.get('/power-yoy-mom', { params })
export const getFaultGeoDistribution = (params) => request.get('/fault-geo-distribution', { params })
export const getLayouts = () => request.get('/layouts')
export const saveLayout = (data) => request.post('/layouts', data)
export const updateLayout = (id, data) => request.put(`/layouts/${id}`, data)
export const deleteLayout = (id) => request.delete(`/layouts/${id}`)

export default request
