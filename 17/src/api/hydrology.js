import axios from 'axios'
import { ElMessage } from 'element-plus'

const request = axios.create({
  baseURL: '/api',
  timeout: 60000,
  headers: {
    'Content-Type': 'application/json'
  }
})

request.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('hydrology_token')
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    console.error('请求错误:', error)
    return Promise.reject(error)
  }
)

request.interceptors.response.use(
  (response) => {
    const res = response.data
    if (res.code && res.code !== 200) {
      ElMessage.error(res.message || '请求失败')
      return Promise.reject(new Error(res.message || '请求失败'))
    }
    return res
  },
  (error) => {
    console.error('响应错误:', error)
    if (error.response) {
      switch (error.response.status) {
        case 401:
          ElMessage.error('未授权，请重新登录')
          break
        case 403:
          ElMessage.error('拒绝访问')
          break
        case 404:
          ElMessage.error('请求资源不存在')
          break
        case 500:
          ElMessage.error('服务器内部错误')
          break
        default:
          ElMessage.error(`请求错误: ${error.response.status}`)
      }
    } else if (error.code === 'ECONNABORTED') {
      ElMessage.error('请求超时，请稍后重试')
    } else {
      ElMessage.error('网络连接异常')
    }
    return Promise.reject(error)
  }
)

const MAX_PAGE_COUNT = 100
const REQUEST_CONCURRENCY = 5

const asyncPool = async (poolLimit, array, iteratorFn) => {
  const results = []
  const executing = []

  for (const item of array) {
    const p = Promise.resolve().then(() => iteratorFn(item))
    results.push(p)

    if (poolLimit <= array.length) {
      const e = p.then(() => executing.splice(executing.indexOf(e), 1))
      executing.push(e)
      if (executing.length >= poolLimit) {
        await Promise.race(executing)
      }
    }
  }

  return Promise.all(results)
}

export const downsampleData = (data, maxPoints = 1000, valueField = 'value', timeField = 'timestamp') => {
  if (!Array.isArray(data) || data.length === 0) {
    return []
  }

  if (data.length <= maxPoints) {
    return data
  }

  const step = Math.ceil(data.length / maxPoints)
  const result = []

  for (let i = 0; i < data.length; i += step) {
    const chunk = data.slice(i, i + step)
    if (chunk.length === 0) continue

    const firstTime = chunk[0][timeField]
    const values = chunk
      .map(item => item[valueField])
      .filter(v => v !== null && v !== undefined && !isNaN(v))

    if (values.length === 0) {
      result.push(chunk[0])
      continue
    }

    const avgValue = values.reduce((a, b) => a + b, 0) / values.length
    const minValue = Math.min(...values)
    const maxValue = Math.max(...values)

    result.push({
      ...chunk[Math.floor(chunk.length / 2)],
      [timeField]: firstTime,
      [valueField]: Number(avgValue.toFixed(2)),
      _min: minValue,
      _max: maxValue,
      _count: chunk.length
    })
  }

  return result
}

export const lttbDownsample = (data, maxPoints = 1000, valueField = 'value', timeField = 'timestamp') => {
  if (!Array.isArray(data) || data.length === 0 || data.length <= maxPoints) {
    return data
  }

  const sampled = []
  const bucketSize = (data.length - 2) / (maxPoints - 2)

  sampled.push(data[0])

  for (let i = 0; i < maxPoints - 2; i++) {
    const start = Math.floor(i * bucketSize) + 1
    const end = Math.floor((i + 1) * bucketSize) + 1

    const avgX = (start + end) / 2
    let avgY = 0
    for (let j = start; j < end; j++) {
      avgY += data[j][valueField] || 0
    }
    avgY /= (end - start)

    let maxDist = -1
    let selectedIndex = start

    for (let j = start; j < end; j++) {
      const dist = Math.sqrt(
        Math.pow(j - avgX, 2) + Math.pow((data[j][valueField] || 0) - avgY, 2)
      )
      if (dist > maxDist) {
        maxDist = dist
        selectedIndex = j
      }
    }

    sampled.push(data[selectedIndex])
  }

  sampled.push(data[data.length - 1])
  return sampled
}

export const hydrologyApi = {
  async getWaterLevelData(params) {
    const { stationId, startTime, endTime, page = 1, pageSize = 1000 } = params
    return request({
      url: '/water-level/list',
      method: 'get',
      params: {
        stationId,
        startTime,
        endTime,
        page,
        pageSize
      }
    })
  },

  async getFlowVelocityData(params) {
    const { stationId, startTime, endTime, page = 1, pageSize = 1000 } = params
    return request({
      url: '/flow-velocity/list',
      method: 'get',
      params: {
        stationId,
        startTime,
        endTime,
        page,
        pageSize
      }
    })
  },

  async getRainfallData(params) {
    const { stationId, startTime, endTime, page = 1, pageSize = 1000 } = params
    return request({
      url: '/rainfall/list',
      method: 'get',
      params: {
        stationId,
        startTime,
        endTime,
        page,
        pageSize
      }
    })
  },

  async getMultiDimensionData(params) {
    const { stationIds, dataTypes, startTime, endTime } = params
    return request({
      url: '/hydrology/multi-dimension',
      method: 'post',
      data: {
        stationIds,
        dataTypes,
        startTime,
        endTime
      }
    })
  },

  async getStationList() {
    return request({
      url: '/station/list',
      method: 'get'
    })
  },

  async getStationById(stationId) {
    return request({
      url: `/station/${stationId}`,
      method: 'get'
    })
  },

  async getRealtimeData(stationId) {
    return request({
      url: '/hydrology/realtime',
      method: 'get',
      params: { stationId }
    })
  },

  async getStatisticsData(params) {
    const { stationId, dataType, startTime, endTime, statisticsType } = params
    return request({
      url: '/hydrology/statistics',
      method: 'get',
      params: {
        stationId,
        dataType,
        startTime,
        endTime,
        statisticsType
      }
    })
  },

  async exportData(params) {
    const { stationIds, dataTypes, startTime, endTime, format } = params
    return request({
      url: '/hydrology/export',
      method: 'post',
      responseType: 'blob',
      data: {
        stationIds,
        dataTypes,
        startTime,
        endTime,
        format
      }
    })
  },

  async getSpatialDistribution(params) {
    const { basinId, dataType, time } = params
    return request({
      url: '/hydrology/spatial-distribution',
      method: 'get',
      params: {
        basinId,
        dataType,
        time
      }
    })
  },

  async getTrendAnalysis(params) {
    const { stationId, dataType, startTime, endTime, interval } = params
    return request({
      url: '/hydrology/trend-analysis',
      method: 'get',
      params: {
        stationId,
        dataType,
        startTime,
        endTime,
        interval
      }
    })
  },

  async getCorrelationAnalysis(params) {
    const { stationId, dataTypes, startTime, endTime } = params
    return request({
      url: '/hydrology/correlation',
      method: 'post',
      data: {
        stationId,
        dataTypes,
        startTime,
        endTime
      }
    })
  },

  async getPaginationData(apiUrl, params) {
    const { page = 1, pageSize = 100, maxPages = MAX_PAGE_COUNT, ...restParams } = params

    try {
      const firstResponse = await request({
        url: apiUrl,
        method: 'get',
        params: {
          ...restParams,
          page,
          pageSize
        }
      })

      const total = firstResponse.total || firstResponse.data?.total || 0
      const totalPages = Math.min(Math.ceil(total / pageSize), maxPages)

      if (totalPages <= 1) {
        const data = firstResponse.data || firstResponse.rows || []
        return {
          data,
          total: data.length,
          isTruncated: false
        }
      }

      const allData = []
      const firstData = firstResponse.data || firstResponse.rows || []
      allData.push(...firstData)

      const pageNumbers = Array.from({ length: totalPages - 1 }, (_, i) => i + 2)

      await asyncPool(REQUEST_CONCURRENCY, pageNumbers, async (pageNum) => {
        try {
          const response = await request({
            url: apiUrl,
            method: 'get',
            params: {
              ...restParams,
              page: pageNum,
              pageSize
            }
          })
          const data = response.data || response.rows || []
          return data
        } catch (error) {
          console.warn(`Page ${pageNum} request failed:`, error.message)
          return []
        }
      }).then((results) => {
        results.forEach((data) => {
          allData.push(...data)
        })
      })

      return {
        data: allData,
        total: allData.length,
        isTruncated: totalPages < Math.ceil(total / pageSize)
      }
    } catch (error) {
      console.error('Pagination data fetch error:', error)
      throw error
    }
  },

  async getAllWaterLevelData(params, downsampleOptions = { enabled: true, maxPoints: 2000 }) {
    const result = await this.getPaginationData('/water-level/list', params)

    if (downsampleOptions.enabled && result.data.length > downsampleOptions.maxPoints) {
      result.originalCount = result.data.length
      result.data = lttbDownsample(
        result.data,
        downsampleOptions.maxPoints,
        'waterLevel',
        'timestamp'
      )
      result.total = result.data.length
      result.isDownsampled = true
    }

    return result
  },

  async getAllFlowVelocityData(params, downsampleOptions = { enabled: true, maxPoints: 2000 }) {
    const result = await this.getPaginationData('/flow-velocity/list', params)

    if (downsampleOptions.enabled && result.data.length > downsampleOptions.maxPoints) {
      result.originalCount = result.data.length
      result.data = lttbDownsample(
        result.data,
        downsampleOptions.maxPoints,
        'flowVelocity',
        'timestamp'
      )
      result.total = result.data.length
      result.isDownsampled = true
    }

    return result
  },

  async getAllRainfallData(params, downsampleOptions = { enabled: true, maxPoints: 2000 }) {
    const result = await this.getPaginationData('/rainfall/list', params)

    if (downsampleOptions.enabled && result.data.length > downsampleOptions.maxPoints) {
      result.originalCount = result.data.length
      result.data = lttbDownsample(
        result.data,
        downsampleOptions.maxPoints,
        'rainfall',
        'timestamp'
      )
      result.total = result.data.length
      result.isDownsampled = true
    }

    return result
  }
}

export default request
