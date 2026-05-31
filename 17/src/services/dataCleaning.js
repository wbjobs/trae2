import dayjs from 'dayjs'

export const dataCleaning = {
  cleanWaterLevelData(rawData) {
    if (!Array.isArray(rawData) || rawData.length === 0) {
      return { cleanedData: [], stats: { total: 0, cleaned: 0, removed: 0 } }
    }

    const cleanedData = []
    let removedCount = 0

    rawData.forEach((item) => {
      if (!item || typeof item !== 'object') {
        removedCount++
        return
      }

      const cleanedItem = { ...item }

      if (cleanedItem.timestamp) {
        const parsedDate = dayjs(cleanedItem.timestamp)
        if (parsedDate.isValid()) {
          cleanedItem.time = parsedDate.format('YYYY-MM-DD HH:mm:ss')
        }
      }

      if (cleanedItem.waterLevel !== undefined && cleanedItem.waterLevel !== null) {
        const value = parseFloat(cleanedItem.waterLevel)
        if (!isNaN(value) && isFinite(value) && value >= 0 && value <= 100) {
          cleanedItem.waterLevel = Number(value.toFixed(2))
        } else {
          removedCount++
          return
        }
      } else {
        removedCount++
        return
      }

      if (cleanedItem.stationId && cleanedItem.stationName) {
        cleanedData.push(cleanedItem)
      } else {
        removedCount++
      }
    })

    return {
      cleanedData,
      stats: {
        total: rawData.length,
        cleaned: cleanedData.length,
        removed: removedCount
      }
    }
  },

  cleanFlowVelocityData(rawData) {
    if (!Array.isArray(rawData) || rawData.length === 0) {
      return { cleanedData: [], stats: { total: 0, cleaned: 0, removed: 0 } }
    }

    const cleanedData = []
    let removedCount = 0

    rawData.forEach((item) => {
      if (!item || typeof item !== 'object') {
        removedCount++
        return
      }

      const cleanedItem = { ...item }

      if (cleanedItem.timestamp) {
        const parsedDate = dayjs(cleanedItem.timestamp)
        if (parsedDate.isValid()) {
          cleanedItem.time = parsedDate.format('YYYY-MM-DD HH:mm:ss')
        }
      }

      if (cleanedItem.flowVelocity !== undefined && cleanedItem.flowVelocity !== null) {
        const value = parseFloat(cleanedItem.flowVelocity)
        if (!isNaN(value) && isFinite(value) && value >= 0 && value <= 20) {
          cleanedItem.flowVelocity = Number(value.toFixed(2))
        } else {
          removedCount++
          return
        }
      } else {
        removedCount++
        return
      }

      if (cleanedItem.stationId && cleanedItem.stationName) {
        cleanedData.push(cleanedItem)
      } else {
        removedCount++
      }
    })

    return {
      cleanedData,
      stats: {
        total: rawData.length,
        cleaned: cleanedData.length,
        removed: removedCount
      }
    }
  },

  cleanRainfallData(rawData) {
    if (!Array.isArray(rawData) || rawData.length === 0) {
      return { cleanedData: [], stats: { total: 0, cleaned: 0, removed: 0 } }
    }

    const cleanedData = []
    let removedCount = 0

    rawData.forEach((item) => {
      if (!item || typeof item !== 'object') {
        removedCount++
        return
      }

      const cleanedItem = { ...item }

      if (cleanedItem.timestamp) {
        const parsedDate = dayjs(cleanedItem.timestamp)
        if (parsedDate.isValid()) {
          cleanedItem.time = parsedDate.format('YYYY-MM-DD HH:mm:ss')
        }
      }

      if (cleanedItem.rainfall !== undefined && cleanedItem.rainfall !== null) {
        const value = parseFloat(cleanedItem.rainfall)
        if (!isNaN(value) && isFinite(value) && value >= 0 && value <= 500) {
          cleanedItem.rainfall = Number(value.toFixed(2))
        } else {
          removedCount++
          return
        }
      } else {
        removedCount++
        return
      }

      if (cleanedItem.stationId && cleanedItem.stationName) {
        cleanedData.push(cleanedItem)
      } else {
        removedCount++
      }
    })

    return {
      cleanedData,
      stats: {
        total: rawData.length,
        cleaned: cleanedData.length,
        removed: removedCount
      }
    }
  },

  removeDuplicates(data, keyField = 'timestamp') {
    if (!Array.isArray(data) || data.length === 0) {
      return []
    }

    const seen = new Set()
    return data.filter((item) => {
      if (!item || typeof item !== 'object') {
        return false
      }

      const key = item[keyField]
      if (key === undefined || key === null) {
        return true
      }
      if (seen.has(key)) {
        return false
      }
      seen.add(key)
      return true
    })
  },

  fillMissingValues(data, field, method = 'linear') {
    if (!Array.isArray(data) || data.length === 0) {
      return data
    }

    const result = [...data]

    if (method === 'linear') {
      for (let i = 0; i < result.length; i++) {
        const currentItem = result[i]
        if (!currentItem || typeof currentItem !== 'object') {
          continue
        }

        if (currentItem[field] === null || currentItem[field] === undefined || isNaN(currentItem[field])) {
          let prevIndex = -1
          let nextIndex = -1

          for (let j = i - 1; j >= 0; j--) {
            const prevItem = result[j]
            if (prevItem &&
                prevItem[field] !== null &&
                prevItem[field] !== undefined &&
                !isNaN(prevItem[field])) {
              prevIndex = j
              break
            }
          }

          for (let j = i + 1; j < result.length; j++) {
            const nextItem = result[j]
            if (nextItem &&
                nextItem[field] !== null &&
                nextItem[field] !== undefined &&
                !isNaN(nextItem[field])) {
              nextIndex = j
              break
            }
          }

          if (prevIndex >= 0 && nextIndex >= 0) {
            const prevValue = result[prevIndex][field]
            const nextValue = result[nextIndex][field]
            const ratio = (i - prevIndex) / (nextIndex - prevIndex)
            const interpolated = prevValue + (nextValue - prevValue) * ratio
            result[i][field] = Number(interpolated.toFixed(2))
          } else if (prevIndex >= 0) {
            result[i][field] = Number(Number(result[prevIndex][field]).toFixed(2))
          } else if (nextIndex >= 0) {
            result[i][field] = Number(Number(result[nextIndex][field]).toFixed(2))
          }
        }
      }
    } else if (method === 'mean') {
      const validValues = result
        .filter((item) =>
          item &&
          item[field] !== null &&
          item[field] !== undefined &&
          !isNaN(item[field])
        )
        .map((item) => item[field])

      const mean = validValues.length > 0
        ? validValues.reduce((a, b) => a + b, 0) / validValues.length
        : 0

      result.forEach((item) => {
        if (item && (item[field] === null || item[field] === undefined || isNaN(item[field]))) {
          item[field] = Number(mean.toFixed(2))
        }
      })
    }

    return result
  },

  smoothData(data, field, windowSize = 3) {
    if (!Array.isArray(data) || data.length === 0) {
      return data
    }

    if (data.length < windowSize) {
      return data.map(item => ({
        ...item,
        [`${field}_smoothed`]: item && !isNaN(item[field]) ? item[field] : null
      }))
    }

    const result = [...data]
    const halfWindow = Math.floor(windowSize / 2)

    for (let i = 0; i < result.length; i++) {
      const start = Math.max(0, i - halfWindow)
      const end = Math.min(result.length, i + halfWindow + 1)
      const window = result.slice(start, end)
      const values = window
        .filter((item) =>
          item &&
          item[field] !== null &&
          item[field] !== undefined &&
          !isNaN(item[field])
        )
        .map((item) => item[field])

      if (values.length > 0) {
        const avg = values.reduce((a, b) => a + b, 0) / values.length
        result[i][`${field}_smoothed`] = Number(avg.toFixed(2))
      } else {
        result[i][`${field}_smoothed`] = null
      }
    }

    return result
  },

  detectOutliers(data, field, threshold = 3) {
    if (!Array.isArray(data) || data.length === 0) {
      return { outliers: [], cleanData: data }
    }

    const values = data
      .filter((item) =>
        item &&
        item[field] !== null &&
        item[field] !== undefined &&
        !isNaN(item[field])
      )
      .map((item) => item[field])

    if (values.length === 0) {
      return { outliers: [], cleanData: data }
    }

    const mean = values.reduce((a, b) => a + b, 0) / values.length
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length
    const stdDev = Math.sqrt(variance)

    const outliers = []
    const cleanData = []

    data.forEach((item) => {
      if (!item || typeof item !== 'object') {
        cleanData.push(item)
        return
      }

      const value = item[field]
      if (value !== null && value !== undefined && !isNaN(value)) {
        const zScore = stdDev > 0 ? Math.abs((value - mean) / stdDev) : 0
        if (zScore > threshold) {
          outliers.push({ ...item, zScore: Number(zScore.toFixed(2)) })
        } else {
          cleanData.push(item)
        }
      } else {
        cleanData.push(item)
      }
    })

    return { outliers, cleanData }
  },

  normalizeTimeSeries(data, timeField = 'timestamp', valueField = 'value') {
    if (!Array.isArray(data) || data.length === 0) {
      return []
    }

    return data
      .filter(item => item && typeof item === 'object')
      .map((item) => {
        let timeValue = item[timeField]
        let parsedTime = dayjs(timeValue)

        if (!parsedTime.isValid()) {
          parsedTime = dayjs()
        }

        let value
        if (item[valueField] !== undefined && !isNaN(item[valueField])) {
          value = item[valueField]
        } else if (item.waterLevel !== undefined && !isNaN(item.waterLevel)) {
          value = item.waterLevel
        } else if (item.flowVelocity !== undefined && !isNaN(item.flowVelocity)) {
          value = item.flowVelocity
        } else if (item.rainfall !== undefined && !isNaN(item.rainfall)) {
          value = item.rainfall
        } else {
          value = null
        }

        return {
          time: parsedTime.valueOf(),
          value,
          ...item
        }
      })
      .filter(item => item.value !== null)
      .sort((a, b) => a.time - b.time)
  },

  mergeMultiSourceData(dataSources) {
    if (!Array.isArray(dataSources) || dataSources.length === 0) {
      return []
    }

    const timeMap = new Map()

    dataSources.forEach((source) => {
      if (!source || !Array.isArray(source.data)) {
        return
      }

      source.data.forEach((item) => {
        if (!item || typeof item !== 'object') {
          return
        }

        const timeKey = item.timestamp || item.time
        if (!timeKey) return

        if (!timeMap.has(timeKey)) {
          timeMap.set(timeKey, { time: timeKey })
        }
        const mergedItem = timeMap.get(timeKey)
        Object.assign(mergedItem, item)
      })
    })

    return Array.from(timeMap.values())
      .filter(item => {
        const timeA = new Date(item.time).getTime()
        return !isNaN(timeA)
      })
      .sort((a, b) => {
        const timeA = new Date(a.time).getTime()
        const timeB = new Date(b.time).getTime()
        return timeA - timeB
      })
  },

  batchClean(data, config) {
    if (!Array.isArray(data) || data.length === 0) {
      return { cleanedData: [], reports: [] }
    }

    let result = [...data]
    const reports = []

    if (config.removeDuplicates) {
      const before = result.length
      result = this.removeDuplicates(result, config.duplicateKey || 'timestamp')
      const after = result.length
      reports.push({ type: '去重', before, after, removed: before - after })
    }

    if (config.fillMissing && config.field) {
      const beforeMissing = result.filter((item) =>
        !item ||
        item[config.field] === null ||
        item[config.field] === undefined ||
        isNaN(item[config.field])
      ).length

      result = this.fillMissingValues(result, config.field, config.fillMethod || 'linear')

      const afterMissing = result.filter((item) =>
        !item ||
        item[config.field] === null ||
        item[config.field] === undefined ||
        isNaN(item[config.field])
      ).length

      reports.push({
        type: '缺失值填充',
        beforeMissing,
        afterMissing,
        filled: beforeMissing - afterMissing,
        method: config.fillMethod || 'linear'
      })
    }

    if (config.smooth && config.field) {
      result = this.smoothData(result, config.field, config.windowSize || 3)
      reports.push({ type: '数据平滑', windowSize: config.windowSize || 3 })
    }

    if (config.detectOutliers && config.field) {
      const { outliers, cleanData } = this.detectOutliers(result, config.field, config.outlierThreshold || 3)
      result = cleanData
      reports.push({ type: '异常值检测', outlierCount: outliers.length, threshold: config.outlierThreshold || 3 })
    }

    return { cleanedData: result, reports }
  },

  downsampleForChart(data, valueField, maxPoints = 1000) {
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

      const values = chunk
        .map(item => item && item[valueField])
        .filter(v => v !== null && v !== undefined && !isNaN(v))

      if (values.length === 0) {
        result.push(chunk[0])
        continue
      }

      const avgValue = values.reduce((a, b) => a + b, 0) / values.length
      const midIndex = Math.floor(chunk.length / 2)

      result.push({
        ...chunk[midIndex],
        [valueField]: Number(avgValue.toFixed(2)),
        _isDownsampled: true,
        _sampleCount: chunk.length
      })
    }

    return result
  }
}

export default dataCleaning
