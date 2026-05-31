import dayjs from 'dayjs'
import { statisticsService } from './statistics'

export const anomalyDetection = {
  detectAnomalyPoints(data, valueField, options = {}) {
    const {
      threshold = 3,
      useIQR = false,
      iqrMultiplier = 1.5,
      minPoints = 10,
      useRolling = false,
      rollingWindow = 24
    } = options

    if (!Array.isArray(data) || data.length < minPoints) {
      return {
        anomalies: [],
        cleanData: data,
        stats: null
      }
    }

    const values = data
      .filter(item => item && item[valueField] !== null && item[valueField] !== undefined && !isNaN(item[valueField]))
      .map(item => item[valueField])

    if (values.length < minPoints) {
      return {
        anomalies: [],
        cleanData: data,
        stats: null
      }
    }

    if (useIQR) {
      return this.detectIQRAnomalies(data, valueField, iqrMultiplier)
    }

    if (useRolling) {
      return this.detectRollingAnomalies(data, valueField, rollingWindow, threshold)
    }

    return this.detectZScoreAnomalies(data, valueField, threshold)
  },

  detectZScoreAnomalies(data, valueField, threshold = 3) {
    const values = data
      .filter(item => item && item[valueField] !== null && item[valueField] !== undefined && !isNaN(item[valueField]))
      .map(item => item[valueField])

    const mean = values.reduce((a, b) => a + b, 0) / values.length
    const stdDev = Math.sqrt(values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length)

    const anomalies = []
    const cleanData = []

    data.forEach((item, index) => {
      if (!item || item[valueField] === null || item[valueField] === undefined || isNaN(item[valueField])) {
        cleanData.push(item)
        return
      }

      const value = item[valueField]
      const zScore = stdDev > 0 ? Math.abs((value - mean) / stdDev) : 0

      if (zScore > threshold) {
        anomalies.push({
          index,
          item,
          value,
          zScore: Number(zScore.toFixed(4)),
          mean: Number(mean.toFixed(2)),
          stdDev: Number(stdDev.toFixed(2)),
          deviation: Number((zScore * stdDev).toFixed(2)),
          anomalyType: zScore > threshold * 1.5 ? 'severe' : 'mild'
        })
      } else {
        cleanData.push(item)
      }
    })

    return {
      anomalies,
      cleanData,
      stats: {
        method: 'z-score',
        mean: Number(mean.toFixed(2)),
        stdDev: Number(stdDev.toFixed(2)),
        threshold,
        anomalyCount: anomalies.length,
        severeCount: anomalies.filter(a => a.anomalyType === 'severe').length,
        mildCount: anomalies.filter(a => a.anomalyType === 'mild').length
      }
    }
  },

  detectIQRAnomalies(data, valueField, multiplier = 1.5) {
    const values = data
      .filter(item => item && item[valueField] !== null && item[valueField] !== undefined && !isNaN(item[valueField]))
      .map(item => item[valueField])
      .sort((a, b) => a - b)

    const q1Index = Math.floor(values.length * 0.25)
    const q3Index = Math.floor(values.length * 0.75)
    const q1 = values[q1Index]
    const q3 = values[q3Index]
    const iqr = q3 - q1
    const lowerBound = q1 - multiplier * iqr
    const upperBound = q3 + multiplier * iqr

    const anomalies = []
    const cleanData = []

    data.forEach((item, index) => {
      if (!item || item[valueField] === null || item[valueField] === undefined || isNaN(item[valueField])) {
        cleanData.push(item)
        return
      }

      const value = item[valueField]

      if (value < lowerBound || value > upperBound) {
        anomalies.push({
          index,
          item,
          value,
          lowerBound: Number(lowerBound.toFixed(2)),
          upperBound: Number(upperBound.toFixed(2)),
          q1: Number(q1.toFixed(2)),
          q3: Number(q3.toFixed(2)),
          iqr: Number(iqr.toFixed(2)),
          anomalyType: value > upperBound ? 'high' : 'low'
        })
      } else {
        cleanData.push(item)
      }
    })

    return {
      anomalies,
      cleanData,
      stats: {
        method: 'iqr',
        q1: Number(q1.toFixed(2)),
        q3: Number(q3.toFixed(2)),
        iqr: Number(iqr.toFixed(2)),
        lowerBound: Number(lowerBound.toFixed(2)),
        upperBound: Number(upperBound.toFixed(2)),
        anomalyCount: anomalies.length,
        highCount: anomalies.filter(a => a.anomalyType === 'high').length,
        lowCount: anomalies.filter(a => a.anomalyType === 'low').length
      }
    }
  },

  detectRollingAnomalies(data, valueField, windowSize = 24, threshold = 3) {
    const anomalies = []
    const cleanData = []

    for (let i = 0; i < data.length; i++) {
      const item = data[i]
      if (!item || item[valueField] === null || item[valueField] === undefined || isNaN(item[valueField])) {
        cleanData.push(item)
        continue
      }

      const start = Math.max(0, i - windowSize)
      const end = i
      const window = data.slice(start, end)

      const windowValues = window
        .filter(w => w && w[valueField] !== null && w[valueField] !== undefined && !isNaN(w[valueField]))
        .map(w => w[valueField])

      if (windowValues.length < 5) {
        cleanData.push(item)
        continue
      }

      const mean = windowValues.reduce((a, b) => a + b, 0) / windowValues.length
      const stdDev = Math.sqrt(windowValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / windowValues.length)

      const value = item[valueField]
      const zScore = stdDev > 0 ? Math.abs((value - mean) / stdDev) : 0

      if (zScore > threshold) {
        anomalies.push({
          index: i,
          item,
          value,
          zScore: Number(zScore.toFixed(4)),
          rollingMean: Number(mean.toFixed(2)),
          rollingStd: Number(stdDev.toFixed(2)),
          windowSize: windowValues.length,
          anomalyType: zScore > threshold * 1.5 ? 'severe' : 'mild'
        })
      } else {
        cleanData.push(item)
      }
    }

    return {
      anomalies,
      cleanData,
      stats: {
        method: 'rolling',
        windowSize,
        threshold,
        anomalyCount: anomalies.length,
        severeCount: anomalies.filter(a => a.anomalyType === 'severe').length,
        mildCount: anomalies.filter(a => a.anomalyType === 'mild').length
      }
    }
  },

  detectAnomalyIntervals(data, valueField, anomalies, minIntervalLength = 3) {
    if (!anomalies || anomalies.length === 0) {
      return []
    }

    const anomalyIndices = anomalies.map(a => a.index).sort((a, b) => a - b)
    const intervals = []
    let currentInterval = null

    for (let i = 0; i < anomalyIndices.length; i++) {
      const idx = anomalyIndices[i]

      if (!currentInterval) {
        currentInterval = {
          startIndex: idx,
          endIndex: idx,
          startItem: data[idx],
          endItem: data[idx],
          anomalies: [anomalies.find(a => a.index === idx)],
          duration: 1
        }
      } else if (idx - currentInterval.endIndex <= 2) {
        currentInterval.endIndex = idx
        currentInterval.endItem = data[idx]
        currentInterval.anomalies.push(anomalies.find(a => a.index === idx))
        currentInterval.duration = idx - currentInterval.startIndex + 1
      } else {
        if (currentInterval.duration >= minIntervalLength) {
          intervals.push(this.calculateIntervalStats(currentInterval, valueField))
        }
        currentInterval = {
          startIndex: idx,
          endIndex: idx,
          startItem: data[idx],
          endItem: data[idx],
          anomalies: [anomalies.find(a => a.index === idx)],
          duration: 1
        }
      }
    }

    if (currentInterval && currentInterval.duration >= minIntervalLength) {
      intervals.push(this.calculateIntervalStats(currentInterval, valueField))
    }

    return intervals
  },

  calculateIntervalStats(interval, valueField) {
    const values = interval.anomalies.map(a => a.value)
    const maxAnomaly = interval.anomalies.reduce((max, a) =>
      a.zScore > max.zScore ? a : max
    , interval.anomalies[0])

    const startTime = interval.startItem?.timestamp || interval.startItem?.time
    const endTime = interval.endItem?.timestamp || interval.endItem?.time

    return {
      ...interval,
      startTime,
      endTime,
      maxValue: Number(Math.max(...values).toFixed(2)),
      minValue: Number(Math.min(...values).toFixed(2)),
      avgValue: Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(2)),
      maxZScore: Number(maxAnomaly.zScore.toFixed(2)),
      anomalySeverity: maxAnomaly.zScore > 4.5 ? 'critical' : maxAnomaly.zScore > 3 ? 'warning' : 'notice',
      anomalyCount: interval.anomalies.length
    }
  },

  markAnomalyZones(data, valueField, options = {}) {
    const {
      method = 'z-score',
      threshold = 3,
      minIntervalLength = 3
    } = options

    const detectionResult = this.detectAnomalyPoints(data, valueField, {
      threshold,
      useIQR: method === 'iqr',
      useRolling: method === 'rolling'
    })

    const anomalyIntervals = this.detectAnomalyIntervals(
      data,
      valueField,
      detectionResult.anomalies,
      minIntervalLength
    )

    const markedData = data.map((item, index) => {
      const isAnomalyPoint = detectionResult.anomalies.some(a => a.index === index)
      const interval = anomalyIntervals.find(
        i => index >= i.startIndex && index <= i.endIndex
      )

      return {
        ...item,
        _isAnomaly: isAnomalyPoint,
        _anomalyZone: interval ? interval.anomalySeverity : null,
        _anomalyIndex: isAnomalyPoint ? detectionResult.anomalies.find(a => a.index === index) : null
      }
    })

    return {
      markedData,
      anomalies: detectionResult.anomalies,
      anomalyIntervals,
      stats: detectionResult.stats,
      anomalyZones: anomalyIntervals
    }
  },

  generateAnomalyMarkAreas(anomalyIntervals, timeField = 'timestamp') {
    if (!anomalyIntervals || anomalyIntervals.length === 0) {
      return []
    }

    return anomalyIntervals.map(interval => ({
      name: `异常区间_${interval.startIndex}`,
      xAxis: interval.startTime ? dayjs(interval.startTime).format('YYYY-MM-DD HH:mm:ss') : undefined,
      xAxis2: interval.endTime ? dayjs(interval.endTime).format('YYYY-MM-DD HH:mm:ss') : undefined,
      itemStyle: {
        color: interval.anomalySeverity === 'critical'
          ? 'rgba(245, 108, 108, 0.3)'
          : interval.anomalySeverity === 'warning'
            ? 'rgba(230, 162, 60, 0.2)'
            : 'rgba(144, 147, 153, 0.2)'
      },
      label: {
        show: true,
        formatter: interval.anomalySeverity === 'critical' ? '严重异常' : '异常',
        position: 'top',
        color: interval.anomalySeverity === 'critical' ? '#F56C6C' : '#E6A23C'
      }
    }))
  },

  detectLevelCrossings(data, valueField, warningLevel, alertLevel) {
    if (!Array.isArray(data) || data.length === 0) {
      return { warningZones: [], alertZones: [], allZones: [] }
    }

    const warningZones = []
    const alertZones = []

    let currentWarningZone = null
    let currentAlertZone = null

    data.forEach((item, index) => {
      const value = item?.[valueField]
      if (value === null || value === undefined || isNaN(value)) {
        return
      }

      if (alertLevel !== undefined && value >= alertLevel) {
        if (!currentAlertZone) {
          currentAlertZone = {
            type: 'alert',
            startIndex: index,
            endIndex: index,
            startItem: item,
            endItem: item,
            maxValue: value
          }
        } else {
          currentAlertZone.endIndex = index
          currentAlertZone.endItem = item
          currentAlertZone.maxValue = Math.max(currentAlertZone.maxValue, value)
        }
      } else {
        if (currentAlertZone) {
          alertZones.push(currentAlertZone)
          currentAlertZone = null
        }

        if (warningLevel !== undefined && value >= warningLevel) {
          if (!currentWarningZone) {
            currentWarningZone = {
              type: 'warning',
              startIndex: index,
              endIndex: index,
              startItem: item,
              endItem: item,
              maxValue: value
            }
          } else {
            currentWarningZone.endIndex = index
            currentWarningZone.endItem = item
            currentWarningZone.maxValue = Math.max(currentWarningZone.maxValue, value)
          }
        } else if (currentWarningZone) {
          warningZones.push(currentWarningZone)
          currentWarningZone = null
        }
      }
    })

    if (currentAlertZone) alertZones.push(currentAlertZone)
    if (currentWarningZone) warningZones.push(currentWarningZone)

    return {
      warningZones,
      alertZones,
      allZones: [...alertZones, ...warningZones].sort((a, b) => a.startIndex - b.startIndex)
    }
  }
}

export default anomalyDetection
