import dayjs from 'dayjs'

const stations = [
  { id: 'ST001', name: '长江上游站', latitude: 30.6598, longitude: 104.0657, basin: '长江流域', elevation: 350 },
  { id: 'ST002', name: '长江中游站', latitude: 30.5843, longitude: 114.3055, basin: '长江流域', elevation: 250 },
  { id: 'ST003', name: '长江下游站', latitude: 32.0603, longitude: 118.7969, basin: '长江流域', elevation: 120 },
  { id: 'ST004', name: '黄河上游站', latitude: 36.0611, longitude: 103.8343, basin: '黄河流域', elevation: 1500 },
  { id: 'ST005', name: '黄河中游站', latitude: 34.7466, longitude: 113.6254, basin: '黄河流域', elevation: 450 },
  { id: 'ST006', name: '珠江上游站', latitude: 25.0389, longitude: 110.3029, basin: '珠江流域', elevation: 280 },
  { id: 'ST007', name: '珠江下游站', latitude: 23.1291, longitude: 113.2644, basin: '珠江流域', elevation: 35 },
  { id: 'ST008', name: '淮河中游站', latitude: 32.9170, longitude: 116.3870, basin: '淮河流域', elevation: 65 }
]

const basins = [
  { id: 'B001', name: '长江流域', area: 1800000, avgElevation: 550 },
  { id: 'B002', name: '黄河流域', area: 750000, avgElevation: 1200 },
  { id: 'B003', name: '珠江流域', area: 450000, avgElevation: 280 },
  { id: 'B004', name: '淮河流域', area: 270000, avgElevation: 90 }
]

function randomNormal(mean, stdDev) {
  let u = 0, v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return mean + stdDev * Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v)
}

function generateWaterLevel(station, date) {
  const dayOfYear = dayjs(date).dayOfYear()
  const seasonalBase = Math.sin((dayOfYear - 80) * 2 * Math.PI / 365) * 2 + 3
  const noise = randomNormal(0, 0.15)
  const stationFactor = station.elevation / 1000
  const baseLevel = station.basin === '黄河流域' ? 4 : station.basin === '长江流域' ? 5 : 3.5
  return Number((baseLevel + seasonalBase * stationFactor + noise).toFixed(2))
}

function generateFlowVelocity(station, date) {
  const dayOfYear = dayjs(date).dayOfYear()
  const seasonalFactor = Math.sin((dayOfYear - 80) * 2 * Math.PI / 365) * 0.8 + 1.2
  const noise = randomNormal(0, 0.1)
  const baseVelocity = station.basin === '长江流域' ? 2.5 : station.basin === '黄河流域' ? 1.8 : 2.0
  return Number((baseVelocity * seasonalFactor + noise).toFixed(2))
}

function generateRainfall(station, date) {
  const dayOfYear = dayjs(date).dayOfYear()
  const seasonalFactor = Math.max(0, Math.sin((dayOfYear - 80) * 2 * Math.PI / 365))
  const randomFactor = Math.random() < 0.3 ? Math.random() * 2 : 0
  const baseRainfall = station.basin === '珠江流域' ? 3 : station.basin === '长江流域' ? 2 : 1.2
  return Number((baseRainfall * seasonalFactor + randomFactor).toFixed(2))
}

export const mockDataGenerator = {
  generateStations() {
    return stations
  },

  generateBasins() {
    return basins
  },

  generateWaterLevelData(params) {
    const { stationId, startTime, endTime, page = 1, pageSize = 1000 } = params
    const station = stations.find((s) => s.id === stationId) || stations[0]

    const start = dayjs(startTime || dayjs().subtract(30, 'day'))
    const end = dayjs(endTime || dayjs())
    const hours = end.diff(start, 'hour')

    const allData = []
    for (let i = 0; i <= hours; i++) {
      const timestamp = start.add(i, 'hour').toISOString()
      allData.push({
        id: `${stationId}_WL_${i}`,
        stationId,
        stationName: station.name,
        timestamp,
        waterLevel: generateWaterLevel(station, timestamp),
        warningLevel: 7.5,
        guaranteeLevel: 8.5,
        status: generateWaterLevel(station, timestamp) > 7.5 ? 'warning' : 'normal',
        quality: Math.random() > 0.95 ? '异常' : '正常'
      })
    }

    const startIndex = (page - 1) * pageSize
    const endIndex = Math.min(startIndex + pageSize, allData.length)
    const pagedData = allData.slice(startIndex, endIndex)

    return {
      code: 200,
      message: 'success',
      data: pagedData,
      total: allData.length,
      page,
      pageSize
    }
  },

  generateFlowVelocityData(params) {
    const { stationId, startTime, endTime, page = 1, pageSize = 1000 } = params
    const station = stations.find((s) => s.id === stationId) || stations[0]

    const start = dayjs(startTime || dayjs().subtract(30, 'day'))
    const end = dayjs(endTime || dayjs())
    const hours = end.diff(start, 'hour')

    const allData = []
    for (let i = 0; i <= hours; i++) {
      const timestamp = start.add(i, 'hour').toISOString()
      allData.push({
        id: `${stationId}_FV_${i}`,
        stationId,
        stationName: station.name,
        timestamp,
        flowVelocity: generateFlowVelocity(station, timestamp),
        direction: Math.random() > 0.5 ? '顺流' : '逆流',
        status: '正常',
        quality: Math.random() > 0.97 ? '异常' : '正常'
      })
    }

    const startIndex = (page - 1) * pageSize
    const endIndex = Math.min(startIndex + pageSize, allData.length)
    const pagedData = allData.slice(startIndex, endIndex)

    return {
      code: 200,
      message: 'success',
      data: pagedData,
      total: allData.length,
      page,
      pageSize
    }
  },

  generateRainfallData(params) {
    const { stationId, startTime, endTime, page = 1, pageSize = 1000 } = params
    const station = stations.find((s) => s.id === stationId) || stations[0]

    const start = dayjs(startTime || dayjs().subtract(30, 'day'))
    const end = dayjs(endTime || dayjs())
    const hours = end.diff(start, 'hour')

    const allData = []
    for (let i = 0; i <= hours; i++) {
      const timestamp = start.add(i, 'hour').toISOString()
      allData.push({
        id: `${stationId}_RF_${i}`,
        stationId,
        stationName: station.name,
        timestamp,
        rainfall: generateRainfall(station, timestamp),
        rainfallType: Math.random() > 0.7 ? '小雨' : Math.random() > 0.5 ? '中雨' : '无雨',
        status: '正常',
        quality: Math.random() > 0.98 ? '异常' : '正常'
      })
    }

    const startIndex = (page - 1) * pageSize
    const endIndex = Math.min(startIndex + pageSize, allData.length)
    const pagedData = allData.slice(startIndex, endIndex)

    return {
      code: 200,
      message: 'success',
      data: pagedData,
      total: allData.length,
      page,
      pageSize
    }
  },

  generateMultiDimensionData(params) {
    const { stationIds, dataTypes, startTime, endTime } = params
    const selectedStations = stationIds && stationIds.length > 0
      ? stations.filter((s) => stationIds.includes(s.id))
      : stations.slice(0, 3)

    const types = dataTypes || ['waterLevel', 'flowVelocity', 'rainfall']

    const start = dayjs(startTime || dayjs().subtract(7, 'day'))
    const end = dayjs(endTime || dayjs())
    const hours = Math.min(end.diff(start, 'hour'), 168)

    const result = []
    selectedStations.forEach((station) => {
      const stationData = []
      for (let i = 0; i <= hours; i++) {
        const timestamp = start.add(i, 'hour').toISOString()
        const dataPoint = {
          timestamp,
          stationId: station.id,
          stationName: station.name
        }

        if (types.includes('waterLevel')) {
          dataPoint.waterLevel = generateWaterLevel(station, timestamp)
        }
        if (types.includes('flowVelocity')) {
          dataPoint.flowVelocity = generateFlowVelocity(station, timestamp)
        }
        if (types.includes('rainfall')) {
          dataPoint.rainfall = generateRainfall(station, timestamp)
        }

        stationData.push(dataPoint)
      }
      result.push({
        station,
        data: stationData
      })
    })

    return {
      code: 200,
      message: 'success',
      data: result
    }
  },

  generateRealtimeData(stationId) {
    const station = stations.find((s) => s.id === stationId) || stations[0]
    const now = dayjs()

    return {
      code: 200,
      message: 'success',
      data: {
        stationId: station.id,
        stationName: station.name,
        timestamp: now.toISOString(),
        waterLevel: generateWaterLevel(station, now.toISOString()),
        flowVelocity: generateFlowVelocity(station, now.toISOString()),
        rainfall: generateRainfall(station, now.toISOString()),
        waterLevelTrend: Math.random() > 0.5 ? 'rising' : 'falling',
        flowVelocityTrend: Math.random() > 0.5 ? 'increasing' : 'decreasing',
        rainfallTrend: Math.random() > 0.5 ? 'increasing' : 'decreasing'
      }
    }
  },

  generateSpatialDistribution(params) {
    const { dataType = 'waterLevel' } = params

    const distributionData = stations.map((station) => {
      const value = dataType === 'waterLevel'
        ? generateWaterLevel(station, dayjs().toISOString())
        : dataType === 'flowVelocity'
          ? generateFlowVelocity(station, dayjs().toISOString())
          : generateRainfall(station, dayjs().toISOString())

      return {
        stationId: station.id,
        stationName: station.name,
        basin: station.basin,
        latitude: station.latitude,
        longitude: station.longitude,
        value,
        valueType: dataType
      }
    })

    return {
      code: 200,
      message: 'success',
      data: distributionData
    }
  },

  generateTrendAnalysis(params) {
    const { stationId, dataType = 'waterLevel', interval = 'day' } = params
    const station = stations.find((s) => s.id === stationId) || stations[0]

    const days = 365
    const data = []

    for (let i = 0; i < days; i++) {
      const date = dayjs().subtract(days - i, 'day')
      const value = dataType === 'waterLevel'
        ? generateWaterLevel(station, date.toISOString())
        : dataType === 'flowVelocity'
          ? generateFlowVelocity(station, date.toISOString())
          : generateRainfall(station, date.toISOString())

      data.push({
        date: date.format('YYYY-MM-DD'),
        value,
        timestamp: date.toISOString()
      })
    }

    return {
      code: 200,
      message: 'success',
      data
    }
  },

  generateCorrelationAnalysis(params) {
    const { stationId } = params
    const station = stations.find((s) => s.id === stationId) || stations[0]

    return {
      code: 200,
      message: 'success',
      data: {
        stationId: station.id,
        stationName: station.name,
        correlations: [
          { variables: '水位-流速', correlation: 0.85, strength: '强正相关', pValue: 0.001 },
          { variables: '水位-雨量', correlation: 0.72, strength: '中等正相关', pValue: 0.01 },
          { variables: '流速-雨量', correlation: 0.68, strength: '中等正相关', pValue: 0.02 }
        ]
      }
    }
  },

  generateStatisticsData(params) {
    const { stationId, dataType = 'waterLevel' } = params
    const station = stations.find((s) => s.id === stationId) || stations[0]

    const baseValue = dataType === 'waterLevel' ? 5 : dataType === 'flowVelocity' ? 2.2 : 2.5

    return {
      code: 200,
      message: 'success',
      data: {
        stationId: station.id,
        stationName: station.name,
        dataType,
        statistics: {
          mean: Number((baseValue + Math.random() * 0.5).toFixed(2)),
          median: Number((baseValue + Math.random() * 0.3).toFixed(2)),
          mode: Number((baseValue + Math.random() * 0.2).toFixed(2)),
          stdDev: Number((0.3 + Math.random() * 0.2).toFixed(2)),
          min: Number((baseValue - 1.5 + Math.random() * 0.3).toFixed(2)),
          max: Number((baseValue + 2.5 + Math.random() * 0.3).toFixed(2)),
          count: 720,
          period: '30天'
        },
        percentiles: {
          P10: Number((baseValue - 1.2).toFixed(2)),
          P25: Number((baseValue - 0.6).toFixed(2)),
          P50: Number(baseValue.toFixed(2)),
          P75: Number((baseValue + 0.6).toFixed(2)),
          P90: Number((baseValue + 1.2).toFixed(2)),
          P95: Number((baseValue + 1.8).toFixed(2)),
          P99: Number((baseValue + 2.5).toFixed(2))
        }
      }
    }
  },

  generateHeatmapData(params) {
    const { stationId, dataType = 'waterLevel' } = params
    const station = stations.find((s) => s.id === stationId) || stations[0]

    const hours = 24
    const days = 30
    const data = []

    for (let day = 0; day < days; day++) {
      for (let hour = 0; hour < hours; hour++) {
        const date = dayjs().subtract(days - day, 'day').hour(hour)
        const value = dataType === 'waterLevel'
          ? generateWaterLevel(station, date.toISOString())
          : dataType === 'flowVelocity'
            ? generateFlowVelocity(station, date.toISOString())
            : generateRainfall(station, date.toISOString())

        data.push([day, hour, Number(value.toFixed(2))])
      }
    }

    return {
      code: 200,
      message: 'success',
      data: {
        stationId: station.id,
        stationName: station.name,
        dataType,
        heatmapData: data,
        xAxis: Array.from({ length: days }, (_, i) => dayjs().subtract(days - i, 'day').format('MM-DD')),
        yAxis: Array.from({ length: hours }, (_, i) => `${i}:00`)
      }
    }
  }
}

export default mockDataGenerator
