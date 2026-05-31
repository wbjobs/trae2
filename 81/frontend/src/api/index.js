import axios from 'axios'

const MAX_RETRY = 2
const RETRY_DELAY_MS = 1000
const DEBOUNCE_MS = 300

const pendingRequests = new Map()

function generateRequestKey(config) {
  const { method, url, params, data } = config
  return `${method}:${url}:${JSON.stringify(params || '')}:${JSON.stringify(data || '')}`
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

const api = axios.create({
  baseURL: '/api',
  timeout: 10000
})

api.interceptors.request.use((config) => {
  const key = generateRequestKey(config)
  if (pendingRequests.has(key)) {
    const controller = new AbortController()
    controller.abort()
    config.signal = controller.signal
  }
  pendingRequests.set(key, true)
  return config
})

api.interceptors.response.use(
  (response) => {
    const key = generateRequestKey(response.config)
    pendingRequests.delete(key)
    return response
  },
  (error) => {
    if (error.config) {
      const key = generateRequestKey(error.config)
      pendingRequests.delete(key)
    }
    return Promise.reject(error)
  }
)

async function requestWithRetry(fn, retryCount = 0) {
  try {
    return await fn()
  } catch (error) {
    if (axios.isCancel(error)) {
      return { data: { success: false, data: [] } }
    }

    const isRetryable = !error.response || error.code === 'ECONNABORTED' || error.code === 'ERR_NETWORK'
    if (isRetryable && retryCount < MAX_RETRY) {
      await delay(RETRY_DELAY_MS * (retryCount + 1))
      return requestWithRetry(fn, retryCount + 1)
    }
    throw error
  }
}

export function getStatistics() {
  return requestWithRetry(() => api.get('/statistics'))
}

export function getNodes(params) {
  return requestWithRetry(() => api.get('/nodes', { params }))
}

export function getNodeMetrics(nodeId, limit = 100) {
  return requestWithRetry(() => api.get(`/node/${nodeId}/metrics`, { params: { limit } }))
}

export function getHotNodes(limit = 10) {
  return requestWithRetry(() => api.get('/nodes/hot', { params: { limit } }))
}

export function getRealtimeNodes() {
  return requestWithRetry(() => api.get('/nodes/realtime'))
}

export function getGroups() {
  return requestWithRetry(() => api.get('/groups'))
}

export function getRegions() {
  return requestWithRetry(() => api.get('/regions'))
}

export default api
