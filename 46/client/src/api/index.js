import axios from 'axios'
import { ElMessage } from 'element-plus'

const request = axios.create({
  baseURL: '/',
  timeout: 30000
})

request.interceptors.response.use(
  (response) => {
    if (response.config.responseType === 'blob') {
      return response
    }
    const res = response.data
    if (res.code !== undefined && res.code !== 200) {
      ElMessage.error(res.message || '请求失败')
      return Promise.reject(new Error(res.message || '请求失败'))
    }
    return res
  },
  (error) => {
    ElMessage.error(error.message || '网络错误')
    return Promise.reject(error)
  }
)

export const api = {
  germplasm: {
    list: (params) => request.get('/api/germplasm', { params }),
    detail: (id) => request.get(`/api/germplasm/${id}`),
    create: (data) => request.post('/api/germplasm', data),
    update: (id, data) => request.put(`/api/germplasm/${id}`, data),
    delete: (id) => request.delete(`/api/germplasm/${id}`),
    stats: () => request.get('/api/germplasm/stats/summary'),
    batch: (data) => request.post('/api/germplasm/batch', data)
  },
  classification: {
    tree: () => request.get('/api/classification'),
    flat: () => request.get('/api/classification/flat'),
    detail: (id) => request.get(`/api/classification/${id}`),
    create: (data) => request.post('/api/classification', data),
    update: (id, data) => request.put(`/api/classification/${id}`, data),
    delete: (id) => request.delete(`/api/classification/${id}`),
    getGermplasm: (id, params) => request.get(`/api/classification/${id}/germplasm`, { params })
  },
  trait: {
    list: (params) => request.get('/api/trait', { params }),
    detail: (id) => request.get(`/api/trait/${id}`),
    create: (data) => request.post('/api/trait', data),
    update: (id, data) => request.put(`/api/trait/${id}`, data),
    delete: (id) => request.delete(`/api/trait/${id}`),
    statsByCategory: (params) => request.get('/api/trait/stats/by-category', { params })
  },
  image: {
    list: (params) => request.get('/api/image', { params }),
    detail: (id) => request.get(`/api/image/${id}`),
    upload: (formData, config) => request.post('/api/image/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      ...config
    }),
    uploadSingle: (formData) => request.post('/api/image/upload-single', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }),
    update: (id, data) => request.put(`/api/image/${id}`, data),
    delete: (id) => request.delete(`/api/image/${id}`),
    stats: () => request.get('/api/image/stats/summary')
  },
  geolocation: {
    geocode: (params) => request.get('/api/geolocation/geocode', { params }),
    reverse: (params) => request.get('/api/geolocation/reverse', { params }),
    search: (params) => request.get('/api/geolocation/search', { params }),
    ipLocate: () => request.get('/api/geolocation/ip-locate'),
    provinces: () => request.get('/api/geolocation/china/provinces')
  },
  analytics: {
    traitYearlyComparison: (params) => request.get('/api/analytics/trait/yearly-comparison', { params }),
    traitTrend: (params) => request.get('/api/analytics/trait/trend', { params }),
    distributionHeatmap: (params) => request.get('/api/analytics/distribution/heatmap', { params }),
    distributionByRegion: () => request.get('/api/analytics/distribution/by-region'),
    classificationStats: () => request.get('/api/analytics/classification/stats'),
    germplasmQuickStats: () => request.get('/api/analytics/germplasm/quick-stats')
  }
}

export default request
