import axios from 'axios'

const request = axios.create({
  baseURL: '/api',
  timeout: 15000
})

let backendAvailable = true
let lastCheckTime = 0
const CHECK_INTERVAL = 30000

async function checkBackendHealth() {
  const now = Date.now()
  if (now - lastCheckTime < CHECK_INTERVAL) {
    return backendAvailable
  }
  lastCheckTime = now
  try {
    const response = await axios.get('/api/health', { timeout: 3000 })
    backendAvailable = response.status === 200
  } catch (e) {
    backendAvailable = false
    console.warn('Backend is not available, using local data mode')
  }
  return backendAvailable
}

request.interceptors.request.use(
  (config) => {
    if (!backendAvailable && !config.skipAvailabilityCheck) {
      return Promise.reject(new Error('BACKEND_UNAVAILABLE'))
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

request.interceptors.response.use(
  (response) => {
    const res = response.data
    if (res.code === 200) {
      return res.data !== undefined ? res.data : res
    }
    console.error('API Error:', res.message)
    return Promise.reject(new Error(res.message || 'Error'))
  },
  (error) => {
    if (error.response) {
      const status = error.response.status
      if (status === 404) {
        console.warn('API 404:', error.config.url, 'Available APIs:', error.response.data?.data?.availableApis || 'N/A')
      }
    }
    if (error.message === 'BACKEND_UNAVAILABLE') {
      console.debug('Backend unavailable, request skipped:', error.config?.url)
    } else {
      console.error('Request Error:', error.message, error.config?.url)
    }
    return Promise.reject(error)
  }
)

export const healthApi = {
  check: () => checkBackendHealth(),
  getInfo: () => request.get('/')
}

export const isBackendAvailable = () => backendAvailable

export const vectorApi = {
  getAll: () => request.get('/vector'),

  getById: (id) => request.get(`/vector/${id}`),

  save: (data) => request.post('/vector', data),

  delete: (id) => request.delete(`/vector/${id}`),

  getByLayer: (layerName) => request.get(`/vector/layer/${layerName}`),

  getLayers: () => request.get('/vector/layers'),

  getByBbox: (minX, minY, maxX, maxY, srid = 4326) =>
    request.get('/vector/bbox', {
      params: { minX, minY, maxX, maxY, srid }
    }),

  getWithin: (x, y, distance, srid = 4326) =>
    request.get('/vector/within', {
      params: { x, y, distance, srid }
    }),

  getGeoJsonById: (id) => request.get(`/vector/${id}/geojson`),

  getAllAsGeoJson: () => request.get('/vector/geojson'),

  getLayerAsGeoJson: (layerName) => request.get(`/vector/layer/${layerName}/geojson`),

  importGeoJson: (file) => {
    const formData = new FormData()
    formData.append('file', file)
    return request.post('/vector/import/geojson', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  },

  getAllPaged: (page = 0, size = 20, sortBy = 'id', sortDir = 'asc') =>
    request.get('/vector/page', {
      params: { page, size, sortBy, sortDir }
    }),

  getByLayerPaged: (layerName, page = 0, size = 20, sortBy = 'id', sortDir = 'asc') =>
    request.get(`/vector/layer/${layerName}/page`, {
      params: { page, size, sortBy, sortDir }
    }),

  getByBboxPaged: (minX, minY, maxX, maxY, srid = 4326, page = 0, size = 20, sortBy = 'id', sortDir = 'asc') =>
    request.get('/vector/bbox/page', {
      params: { minX, minY, maxX, maxY, srid, page, size, sortBy, sortDir }
    }),

  getWithinPaged: (x, y, distance, srid = 4326, page = 0, size = 20, sortBy = 'id', sortDir = 'asc') =>
    request.get('/vector/within/page', {
      params: { x, y, distance, srid, page, size, sortBy, sortDir }
    }),

  getWithFiltersPaged: (filters = {}, page = 0, size = 20, sortBy = 'id', sortDir = 'asc') =>
    request.get('/vector/filter/page', {
      params: { ...filters, page, size, sortBy, sortDir }
    }),

  getAsGeoJsonWithFiltersPaged: (filters = {}, page = 0, size = 20, sortBy = 'id', sortDir = 'asc') =>
    request.get('/vector/filter/geojson/page', {
      params: { ...filters, page, size, sortBy, sortDir }
    }),

  getCounts: (filters = {}) =>
    request.get('/vector/count', { params: filters }),

  streamAllAsGeoJson: () =>
    request.get('/vector/stream/geojson', { responseType: 'json' })
}

export const coordinateApi = {
  transform: (source, targetSrid) =>
    request.post('/coordinate/transform', source, {
      params: { targetSrid }
    }),

  wgs84ToMercator: (coords) => request.post('/coordinate/wgs84-to-mercator', coords),

  mercatorToWgs84: (coords) => request.post('/coordinate/mercator-to-wgs84', coords),

  toLocal: (coords, centerLon, centerLat) =>
    request.post('/coordinate/to-local', coords, {
      params: { centerLon, centerLat }
    }),

  calculateDistance: (p1, p2) =>
    request.post('/coordinate/distance', { p1, p2 }),

  calculateArea: (coordinates) => request.post('/coordinate/area', { coordinates })
}

export const annotationApi = {
  getAll: () => request.get('/annotation'),

  getById: (id) => request.get(`/annotation/${id}`),

  save: (data) => request.post('/annotation', data),

  delete: (id) => request.delete(`/annotation/${id}`),

  getByType: (type) => request.get(`/annotation/type/${type}`),

  createPoint: (x, y, label, type, properties, srid = 4326) =>
    request.post('/annotation/point', { x, y, label, type, properties, srid })
}

export default request
