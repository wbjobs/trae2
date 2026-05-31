import dayjs from 'dayjs'
import { statisticsService } from './statistics'
import { dataCleaning } from './dataCleaning'

export const comparisonAnalysis = {
  compareBasinStats(basinDataList, valueField, config = {}) {
    if (!Array.isArray(basinDataList) || basinDataList.length === 0) {
      return { comparisons: [], summary: null }
    }

    const comparisons = basinDataList.map((basinData, index) => {
      const { basinName, data } = basinData

      if (!Array.isArray(data) || data.length === 0) {
        return {
          basinName,
          dataCount: 0,
          stats: null,
          trend: null,
          percentile: null
        }
      }

      const cleanedData = data.filter(item =>
        item &&
        item[valueField] !== null &&
        item[valueField] !== undefined &&
        !isNaN(item[valueField])
      )

      if (cleanedData.length === 0) {
        return {
          basinName,
          dataCount: 0,
          stats: null,
          trend: null,
          percentile: null
        }
      }

      const stats = statisticsService.calculateBasicStats(cleanedData, valueField)
      const trend = statisticsService.calculateTrend(cleanedData, 'timestamp', valueField)
      const percentile = statisticsService.calculatePercentiles(cleanedData, valueField)

      return {
        basinName,
        dataCount: cleanedData.length,
        stats,
        trend,
        percentile
      }
    })

    const validComparisons = comparisons.filter(c => c.stats !== null)

    if (validComparisons.length === 0) {
      return { comparisons, summary: null }
    }

    const summary = this.calculateComparisonSummary(validComparisons)

    return { comparisons, summary }
  },

  calculateComparisonSummary(comparisons) {
    const statsList = comparisons.map(c => c.stats).filter(Boolean)

    if (statsList.length === 0) {
      return null
    }

    const means = statsList.map(s => s.mean)
    const maxes = statsList.map(s => s.max)
    const mins = statsList.map(s => s.min)

    return {
      highestMean: comparisons[means.indexOf(Math.max(...means))]?.basinName,
      lowestMean: comparisons[means.indexOf(Math.min(...means))]?.basinName,
      highestMax: comparisons[maxes.indexOf(Math.max(...maxes))]?.basinName,
      lowestMin: comparisons[mins.indexOf(Math.min(...mins))]?.basinName,
      meanRange: Number((Math.max(...means) - Math.min(...means)).toFixed(2)),
      avgStdDev: Number(
        (statsList.reduce((sum, s) => sum + s.stdDev, 0) / statsList.length).toFixed(2)
      )
    }
  },

  prepareComparisonChartData(basinDataList, valueField, timeField = 'timestamp') {
    if (!Array.isArray(basinDataList) || basinDataList.length === 0) {
      return { categories: [], series: [] }
    }

    const allTimes = new Set()
    basinDataList.forEach(basinData => {
      if (Array.isArray(basinData.data)) {
        basinData.data.forEach(item => {
          if (item?.[timeField]) {
            allTimes.add(item[timeField])
          }
        })
      }
    })

    const categories = Array.from(allTimes)
      .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())
      .map(t => dayjs(t).format('MM-DD HH:mm'))

    const series = basinDataList.map((basinData, index) => {
      const { basinName, data } = basinData
      const colorPalette = ['#409EFF', '#67C23A', '#E6A23C', '#F56C6C', '#909399', '#8E44AD']
      const color = colorPalette[index % colorPalette.length]

      const dataMap = new Map()
      if (Array.isArray(data)) {
        data.forEach(item => {
          if (item?.[timeField]) {
            dataMap.set(item[timeField], item[valueField])
          }
        })
      }

      const seriesData = categories.map(time => {
        const originalTime = Array.from(allTimes).find(
          t => dayjs(t).format('MM-DD HH:mm') === time
        )
        return dataMap.get(originalTime) ?? null
      })

      return {
        name: basinName,
        type: 'line',
        data: seriesData,
        smooth: true,
        symbol: 'circle',
        symbolSize: 4,
        lineStyle: {
          width: 2,
          color
        },
        itemStyle: { color },
        emphasis: {
          focus: 'series'
        }
      }
    })

    return { categories, series }
  },

  compareTimePeriods(data, valueField, periods) {
    if (!Array.isArray(data) || data.length === 0 || !Array.isArray(periods) || periods.length === 0) {
      return []
    }

    const timeSeriesData = dataCleaning.normalizeTimeSeries(data, 'timestamp', valueField)

    if (timeSeriesData.length === 0) {
      return []
    }

    return periods.map(period => {
      const { name, start, end } = period
      const startTime = dayjs(start).valueOf()
      const endTime = dayjs(end).valueOf()

      const periodData = timeSeriesData.filter(
        item => item.time >= startTime && item.time <= endTime
      )

      if (periodData.length === 0) {
        return {
          name,
          dataCount: 0,
          stats: null
        }
      }

      const values = periodData.map(item => item.value)
      const stats = {
        mean: Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(2)),
        max: Number(Math.max(...values).toFixed(2)),
        min: Number(Math.min(...values).toFixed(2)),
        stdDev: Number(
          Math.sqrt(values.reduce((sum, val) => sum + Math.pow(val - values.reduce((a, b) => a + b, 0) / values.length, 2), 0) / values.length).toFixed(2)
        )
      }

      return {
        name,
        dataCount: periodData.length,
        stats
      }
    })
  },

  calculateCorrelationMatrix(dataSets) {
    if (!Array.isArray(dataSets) || dataSets.length < 2) {
      return { matrix: [], labels: [] }
    }

    const labels = dataSets.map(ds => ds.name)
    const matrix = []

    for (let i = 0; i < dataSets.length; i++) {
      const row = []
      for (let j = 0; j < dataSets.length; j++) {
        if (i === j) {
          row.push(1)
        } else {
          const correlation = statisticsService.calculateCorrelation(
            dataSets[i].data,
            dataSets[j].data,
            dataSets[i].valueField || 'value',
            dataSets[j].valueField || 'value'
          )
          row.push(correlation.correlation)
        }
      }
      matrix.push(row)
    }

    return { matrix, labels }
  },

  generateComparisonReport(basinComparisons, valueField, unit) {
    if (!Array.isArray(basinComparisons) || basinComparisons.length === 0) {
      return '无对比数据'
    }

    let report = '========================================\n'
    report += '        多流域数据对比分析报告\n'
    report += '========================================\n\n'
    report += `生成时间: ${dayjs().format('YYYY-MM-DD HH:mm:ss')}\n\n`
    report += `对比指标: ${valueField} (${unit})\n\n`

    report += '--- 各流域统计 ---\n\n'

    basinComparisons.forEach(comparison => {
      report += `【${comparison.basinName}】\n`

      if (!comparison.stats) {
        report += `  数据量: 0 (无有效数据)\n\n`
        return
      }

      const { stats, trend } = comparison

      report += `  数据量: ${stats.count}\n`
      report += `  平均值: ${stats.mean} ${unit}\n`
      report += `  最大值: ${stats.max} ${unit}\n`
      report += `  最小值: ${stats.min} ${unit}\n`
      report += `  标准差: ${stats.stdDev} ${unit}\n`

      if (trend) {
        const trendText = {
          increasing: '上升',
          decreasing: '下降',
          stable: '稳定'
        }[trend.trend] || '未知'

        report += `  趋势方向: ${trendText}\n`
        report += `  变化速率: ${trend.slope}\n`
        report += `  预测值: ${trend.predictedNext} ${unit}\n`
      }

      report += '\n'
    })

    report += '========================================\n'
    report += '        报告结束\n'
    report += '========================================\n'

    return report
  }
}

export default comparisonAnalysis
