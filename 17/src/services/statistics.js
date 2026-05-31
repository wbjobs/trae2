import dayjs from 'dayjs'
import { dataCleaning } from './dataCleaning'

export const statisticsService = {
  calculateBasicStats(data, field) {
    if (!Array.isArray(data) || data.length === 0) {
      return { mean: 0, median: 0, mode: 0, variance: 0, stdDev: 0, min: 0, max: 0, range: 0, count: 0 }
    }

    const values = data
      .filter((item) =>
        item &&
        item[field] !== null &&
        item[field] !== undefined &&
        !isNaN(item[field])
      )
      .map((item) => item[field])
      .sort((a, b) => a - b)

    if (values.length === 0) {
      return { mean: 0, median: 0, mode: 0, variance: 0, stdDev: 0, min: 0, max: 0, range: 0, count: 0 }
    }

    const mean = values.reduce((a, b) => a + b, 0) / values.length
    const median = values.length % 2 === 0
      ? (values[values.length / 2 - 1] + values[values.length / 2]) / 2
      : values[Math.floor(values.length / 2)]

    const frequencyMap = {}
    let maxFreq = 0
    let mode = values[0]
    values.forEach((val) => {
      const rounded = val.toFixed(1)
      frequencyMap[rounded] = (frequencyMap[rounded] || 0) + 1
      if (frequencyMap[rounded] > maxFreq) {
        maxFreq = frequencyMap[rounded]
        mode = parseFloat(rounded)
      }
    })

    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length
    const stdDev = Math.sqrt(variance)
    const min = values[0]
    const max = values[values.length - 1]
    const range = max - min

    return {
      mean: Number(mean.toFixed(2)),
      median: Number(median.toFixed(2)),
      mode: Number(mode.toFixed(2)),
      variance: Number(variance.toFixed(2)),
      stdDev: Number(stdDev.toFixed(2)),
      min: Number(min.toFixed(2)),
      max: Number(max.toFixed(2)),
      range: Number(range.toFixed(2)),
      count: values.length
    }
  },

  calculatePercentiles(data, field, percentiles = [10, 25, 50, 75, 90, 95, 99]) {
    if (!Array.isArray(data) || data.length === 0) {
      return percentiles.reduce((acc, p) => {
        acc[`P${p}`] = 0
        return acc
      }, {})
    }

    const values = data
      .filter((item) =>
        item &&
        item[field] !== null &&
        item[field] !== undefined &&
        !isNaN(item[field])
      )
      .map((item) => item[field])
      .sort((a, b) => a - b)

    if (values.length === 0) {
      return percentiles.reduce((acc, p) => {
        acc[`P${p}`] = 0
        return acc
      }, {})
    }

    const result = {}
    percentiles.forEach((p) => {
      const index = (p / 100) * (values.length - 1)
      const lower = Math.floor(index)
      const upper = lower + 1
      const weight = index - lower

      if (upper < values.length) {
        result[`P${p}`] = Number((values[lower] * (1 - weight) + values[upper] * weight).toFixed(2))
      } else {
        result[`P${p}`] = Number(values[lower].toFixed(2))
      }
    })

    return result
  },

  calculateTrend(data, timeField = 'timestamp', valueField = 'value') {
    if (!Array.isArray(data) || data.length < 2) {
      return { slope: 0, intercept: 0, rSquared: 0, trend: 'stable', predictedNext: 0 }
    }

    const timeSeriesData = dataCleaning.normalizeTimeSeries(data, timeField, valueField)

    if (timeSeriesData.length < 2) {
      return { slope: 0, intercept: 0, rSquared: 0, trend: 'stable', predictedNext: 0 }
    }

    const n = timeSeriesData.length
    const sumX = timeSeriesData.reduce((sum, _, i) => sum + i, 0)
    const sumY = timeSeriesData.reduce((sum, item) => sum + (item.value || 0), 0)
    const sumXY = timeSeriesData.reduce((sum, item, i) => sum + i * (item.value || 0), 0)
    const sumX2 = timeSeriesData.reduce((sum, _, i) => sum + i * i, 0)
    const sumY2 = timeSeriesData.reduce((sum, item) => sum + Math.pow(item.value || 0, 2), 0)

    const denominator = n * sumX2 - sumX * sumX
    if (denominator === 0) {
      return { slope: 0, intercept: sumY / n, rSquared: 1, trend: 'stable', predictedNext: sumY / n }
    }

    const slope = (n * sumXY - sumX * sumY) / denominator
    const intercept = (sumY - slope * sumX) / n

    const ssRes = timeSeriesData.reduce((sum, item, i) => {
      const predicted = slope * i + intercept
      return sum + Math.pow((item.value || 0) - predicted, 2)
    }, 0)

    const meanY = sumY / n
    const ssTot = timeSeriesData.reduce((sum, item) => sum + Math.pow((item.value || 0) - meanY, 2), 0)

    const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 1

    let trend = 'stable'
    if (Math.abs(slope) < 0.001) {
      trend = 'stable'
    } else if (slope > 0) {
      trend = 'increasing'
    } else {
      trend = 'decreasing'
    }

    return {
      slope: Number(slope.toFixed(4)),
      intercept: Number(intercept.toFixed(2)),
      rSquared: Number(rSquared.toFixed(4)),
      trend,
      predictedNext: Number((slope * n + intercept).toFixed(2))
    }
  },

  calculateMovingAverage(data, field, windowSize = 7) {
    if (!Array.isArray(data) || data.length === 0) {
      return []
    }

    if (data.length < windowSize) {
      windowSize = Math.max(1, Math.floor(data.length / 2))
    }

    const result = []
    for (let i = 0; i < data.length; i++) {
      const start = Math.max(0, i - windowSize + 1)
      const end = i + 1
      const window = data.slice(start, end)
      const values = window
        .filter((item) =>
          item &&
          item[field] !== null &&
          item[field] !== undefined &&
          !isNaN(item[field])
        )
        .map((item) => item[field])

      const avg = values.length > 0
        ? values.reduce((a, b) => a + b, 0) / values.length
        : null

      result.push({
        ...data[i],
        [`${field}_ma${windowSize}`]: avg !== null ? Number(avg.toFixed(2)) : null
      })
    }

    return result
  },

  calculateSeasonality(data, timeField = 'timestamp', valueField = 'value', period = 24) {
    if (!Array.isArray(data) || data.length < period * 2) {
      return {
        period,
        seasonalIndices: Array(period).fill(0),
        normalizedIndices: Array(period).fill(1),
        overallMean: 0
      }
    }

    const timeSeriesData = dataCleaning.normalizeTimeSeries(data, timeField, valueField)

    if (timeSeriesData.length < period * 2) {
      return {
        period,
        seasonalIndices: Array(period).fill(0),
        normalizedIndices: Array(period).fill(1),
        overallMean: 0
      }
    }

    const seasonalIndices = []
    for (let i = 0; i < period; i++) {
      const periodValues = []
      for (let j = i; j < timeSeriesData.length; j += period) {
        if (timeSeriesData[j].value !== null) {
          periodValues.push(timeSeriesData[j].value)
        }
      }
      const avg = periodValues.length > 0
        ? periodValues.reduce((a, b) => a + b, 0) / periodValues.length
        : 0
      seasonalIndices.push(Number(avg.toFixed(2)))
    }

    const validValues = timeSeriesData.filter(item => item.value !== null).map(item => item.value)
    const overallMean = validValues.length > 0
      ? validValues.reduce((sum, item) => sum + item, 0) / validValues.length
      : 0

    const normalizedIndices = seasonalIndices.map((val) => {
      return overallMean > 0 ? Number((val / overallMean).toFixed(4)) : 1
    })

    return {
      period,
      seasonalIndices,
      normalizedIndices,
      overallMean: Number(overallMean.toFixed(2))
    }
  },

  calculateCorrelation(data1, data2, field1, field2) {
    if (!Array.isArray(data1) || !Array.isArray(data2) || data1.length === 0 || data2.length === 0) {
      return { correlation: 0, covariance: 0, strength: 'none', direction: 'none' }
    }

    const pairs = []
    const minLen = Math.min(data1.length, data2.length)

    for (let i = 0; i < minLen; i++) {
      const v1 = data1[i]?.[field1]
      const v2 = data2[i]?.[field2]

      if (v1 !== null && v1 !== undefined && !isNaN(v1) &&
          v2 !== null && v2 !== undefined && !isNaN(v2)) {
        pairs.push({ v1, v2 })
      }
    }

    if (pairs.length < 2) {
      return { correlation: 0, covariance: 0, strength: 'none', direction: 'none' }
    }

    const values1 = pairs.map(p => p.v1)
    const values2 = pairs.map(p => p.v2)
    const n = pairs.length

    const mean1 = values1.reduce((a, b) => a + b, 0) / n
    const mean2 = values2.reduce((a, b) => a + b, 0) / n

    let covariance = 0
    let std1 = 0
    let std2 = 0

    for (let i = 0; i < n; i++) {
      const diff1 = values1[i] - mean1
      const diff2 = values2[i] - mean2
      covariance += diff1 * diff2
      std1 += diff1 * diff1
      std2 += diff2 * diff2
    }

    covariance /= n
    const variance1 = std1 / n
    const variance2 = std2 / n

    let correlation = 0
    if (variance1 > 0 && variance2 > 0) {
      correlation = covariance / Math.sqrt(variance1 * variance2)
    }

    let strength = 'none'
    const absCorr = Math.abs(correlation)
    if (absCorr > 0.8) {
      strength = 'strong'
    } else if (absCorr > 0.5) {
      strength = 'moderate'
    } else if (absCorr > 0.3) {
      strength = 'weak'
    }

    return {
      correlation: Number(correlation.toFixed(4)),
      covariance: Number(covariance.toFixed(4)),
      strength,
      direction: correlation > 0 ? 'positive' : correlation < 0 ? 'negative' : 'none'
    }
  },

  calculateAnomalyScore(data, field) {
    if (!Array.isArray(data) || data.length === 0) {
      return []
    }

    const stats = this.calculateBasicStats(data, field)
    const { mean, stdDev } = stats

    return data.map((item) => {
      if (!item) {
        return { ...item, anomalyScore: 0, isAnomaly: false }
      }

      const value = item[field]
      if (value === null || value === undefined || isNaN(value)) {
        return { ...item, anomalyScore: 0, isAnomaly: false }
      }

      const zScore = stdDev > 0 ? Math.abs((value - mean) / stdDev) : 0
      const anomalyScore = Math.min(1, zScore / 3)

      return {
        ...item,
        anomalyScore: Number(anomalyScore.toFixed(4)),
        isAnomaly: zScore > 3,
        zScore: Number(zScore.toFixed(2))
      }
    })
  },

  calculateTimeAggregation(data, timeField = 'timestamp', valueField = 'value', interval = 'hour') {
    if (!Array.isArray(data) || data.length === 0) {
      return []
    }

    const timeSeriesData = dataCleaning.normalizeTimeSeries(data, timeField, valueField)

    if (timeSeriesData.length === 0) {
      return []
    }

    const grouped = {}
    timeSeriesData.forEach((item) => {
      if (item.value === null || item.value === undefined) {
        return
      }

      let timeKey
      const date = dayjs(item.time)

      switch (interval) {
        case 'minute':
          timeKey = date.format('YYYY-MM-DD HH:mm')
          break
        case 'hour':
          timeKey = date.format('YYYY-MM-DD HH:00')
          break
        case 'day':
          timeKey = date.format('YYYY-MM-DD')
          break
        case 'week':
          timeKey = date.startOf('week').format('YYYY-MM-DD')
          break
        case 'month':
          timeKey = date.format('YYYY-MM')
          break
        default:
          timeKey = date.format('YYYY-MM-DD HH:00')
      }

      if (!grouped[timeKey]) {
        grouped[timeKey] = []
      }
      grouped[timeKey].push(item.value)
    })

    const result = Object.entries(grouped).map(([time, values]) => {
      const sum = values.reduce((a, b) => a + b, 0)
      const mean = sum / values.length

      return {
        time,
        count: values.length,
        sum: Number(sum.toFixed(2)),
        mean: Number(mean.toFixed(2)),
        max: Number(Math.max(...values).toFixed(2)),
        min: Number(Math.min(...values).toFixed(2))
      }
    })

    return result.sort((a, b) => a.time.localeCompare(b.time))
  },

  calculateSpatialStats(data, locationField, valueField) {
    const emptyResult = {
      locations: [],
      globalStats: {
        mean: 0,
        median: 0,
        mode: 0,
        variance: 0,
        stdDev: 0,
        min: 0,
        max: 0,
        range: 0,
        count: 0
      }
    }

    if (!Array.isArray(data) || data.length === 0) {
      return emptyResult
    }

    const locationMap = {}
    data.forEach((item) => {
      if (!item) return

      const location = item[locationField]
      if (!location) return

      const value = item[valueField]
      if (value === null || value === undefined || isNaN(value)) return

      if (!locationMap[location]) {
        locationMap[location] = []
      }
      locationMap[location].push(value)
    })

    const locations = Object.entries(locationMap).map(([location, values]) => {
      const stats = this.calculateBasicStats(
        values.map((v) => ({ [valueField]: v })),
        valueField
      )
      return {
        location,
        ...stats
      }
    })

    const allValues = Object.values(locationMap).flat()

    const globalStats = allValues.length > 0
      ? this.calculateBasicStats(
          allValues.map((v) => ({ [valueField]: v })),
          valueField
        )
      : emptyResult.globalStats

    return {
      locations,
      globalStats
    }
  },

  calculateSpatialTemporalStats(data, locationField, timeField, valueField, interval = 'day') {
    const emptyResult = {
      grid: [],
      locations: [],
      times: [],
      globalStats: null
    }

    if (!Array.isArray(data) || data.length === 0) {
      return emptyResult
    }

    const grid = {}
    const locationSet = new Set()
    const timeSet = new Set()

    data.forEach((item) => {
      if (!item) return

      const location = item[locationField]
      if (!location) return

      const value = item[valueField]
      if (value === null || value === undefined || isNaN(value)) return

      let timeKey
      const date = dayjs(item[timeField])
      if (date.isValid()) {
        switch (interval) {
          case 'hour':
            timeKey = date.format('YYYY-MM-DD HH:00')
            break
          case 'day':
            timeKey = date.format('YYYY-MM-DD')
            break
          default:
            timeKey = date.format('YYYY-MM-DD')
        }
      } else {
        timeKey = 'unknown'
      }

      const key = `${location}||${timeKey}`
      if (!grid[key]) {
        grid[key] = []
      }
      grid[key].push(value)
      locationSet.add(location)
      timeSet.add(timeKey)
    })

    const locations = Array.from(locationSet).sort()
    const times = Array.from(timeSet).sort()

    const result = []
    locations.forEach((location, locIndex) => {
      times.forEach((time, timeIndex) => {
        const key = `${location}||${time}`
        const values = grid[key] || []

        if (values.length > 0) {
          const sum = values.reduce((a, b) => a + b, 0)
          const avg = sum / values.length
          result.push({
            location,
            locationIndex: locIndex,
            time,
            timeIndex,
            value: Number(avg.toFixed(2)),
            max: Number(Math.max(...values).toFixed(2)),
            min: Number(Math.min(...values).toFixed(2)),
            count: values.length
          })
        }
      })
    })

    const allValues = result.map(item => item.value)
    const globalStats = allValues.length > 0
      ? this.calculateBasicStats(
          allValues.map((v) => ({ value: v })),
          'value'
        )
      : null

    return {
      grid: result,
      locations,
      times,
      globalStats,
      heatmapData: result.map(item => [item.timeIndex, item.locationIndex, item.value]),
      xAxis: times,
      yAxis: locations
    }
  },

  getFullAnalysisReport(data, config) {
    const { timeField, valueField, locationField, interval } = config
    const emptyReport = {
      basicStats: { mean: 0, median: 0, mode: 0, variance: 0, stdDev: 0, min: 0, max: 0, range: 0, count: 0 },
      percentiles: {},
      trend: { slope: 0, intercept: 0, rSquared: 0, trend: 'stable', predictedNext: 0 },
      anomalies: [],
      timeAggregation: [],
      spatialStats: { locations: [], globalStats: null },
      spatialTemporalStats: null,
      generatedAt: dayjs().format('YYYY-MM-DD HH:mm:ss')
    }

    if (!Array.isArray(data) || data.length === 0) {
      return emptyReport
    }

    const report = {
      basicStats: this.calculateBasicStats(data, valueField),
      percentiles: this.calculatePercentiles(data, valueField),
      trend: this.calculateTrend(data, timeField, valueField),
      anomalies: [],
      timeAggregation: [],
      spatialStats: { locations: [], globalStats: null },
      spatialTemporalStats: null,
      generatedAt: dayjs().format('YYYY-MM-DD HH:mm:ss')
    }

    if (data.length > 10) {
      report.anomalies = this.calculateAnomalyScore(data, valueField).filter((item) => item.isAnomaly)
    }

    report.timeAggregation = this.calculateTimeAggregation(data, timeField, valueField, interval || 'hour')

    if (locationField) {
      report.spatialStats = this.calculateSpatialStats(data, locationField, valueField)

      if (data.length > 0 && timeField) {
        report.spatialTemporalStats = this.calculateSpatialTemporalStats(
          data,
          locationField,
          timeField,
          valueField,
          interval || 'day'
        )
      }
    }

    return report
  }
}

export default statisticsService
