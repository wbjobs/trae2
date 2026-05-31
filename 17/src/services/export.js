import { saveAs } from 'file-saver'
import * as XLSX from 'xlsx'
import dayjs from 'dayjs'

export const exportService = {
  exportToExcel(data, filename, options = {}) {
    if (!Array.isArray(data) || data.length === 0) {
      console.warn('没有可导出的数据')
      return
    }

    const { sheetName = '数据导出', headers } = options

    let exportData = data
    if (headers && Array.isArray(headers)) {
      exportData = data.map((item) => {
        const newItem = {}
        headers.forEach((header) => {
          newItem[header.label || header.key] = item[header.key] !== undefined ? item[header.key] : ''
        })
        return newItem
      })
    }

    const worksheet = XLSX.utils.json_to_sheet(exportData)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)

    worksheet['!cols'] = this.calculateColumnWidths(exportData)

    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
    const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })

    const finalFilename = filename || `水文数据_${dayjs().format('YYYYMMDD_HHmmss')}.xlsx`
    saveAs(blob, finalFilename)
  },

  exportToCSV(data, filename, options = {}) {
    if (!Array.isArray(data) || data.length === 0) {
      console.warn('没有可导出的数据')
      return
    }

    const { headers, delimiter = ',', includeBOM = true } = options

    const keys = Object.keys(data[0])
    let csvContent = ''

    if (includeBOM) {
      csvContent += '\uFEFF'
    }

    if (headers && Array.isArray(headers)) {
      csvContent += headers.map((h) => `"${h.label || h.key}"`).join(delimiter) + '\n'
    } else {
      csvContent += keys.map((k) => `"${k}"`).join(delimiter) + '\n'
    }

    data.forEach((item) => {
      if (headers && Array.isArray(headers)) {
        const row = headers.map((h) => {
          const value = item[h.key] !== undefined ? item[h.key] : ''
          return `"${String(value).replace(/"/g, '""')}"`
        })
        csvContent += row.join(delimiter) + '\n'
      } else {
        const row = keys.map((k) => {
          const value = item[k] !== undefined ? item[k] : ''
          return `"${String(value).replace(/"/g, '""')}"`
        })
        csvContent += row.join(delimiter) + '\n'
      }
    })

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' })
    const finalFilename = filename || `水文数据_${dayjs().format('YYYYMMDD_HHmmss')}.csv`
    saveAs(blob, finalFilename)
  },

  exportToJSON(data, filename) {
    if (!Array.isArray(data) || data.length === 0) {
      console.warn('没有可导出的数据')
      return
    }

    const jsonContent = JSON.stringify(data, null, 2)
    const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8' })
    const finalFilename = filename || `水文数据_${dayjs().format('YYYYMMDD_HHmmss')}.json`
    saveAs(blob, finalFilename)
  },

  async exportToPDF(element, filename, options = {}) {
    const { jsPDF } = await import('jspdf')
    const html2canvas = await import('html2canvas')

    if (!element) {
      console.warn('需要提供要导出的DOM元素')
      return
    }

    try {
      const canvas = await html2canvas.default(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        ...options.canvasOptions
      })

      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF({
        orientation: options.orientation || 'landscape',
        unit: 'px',
        format: [canvas.width, canvas.height],
        ...options.pdfOptions
      })

      pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height)

      const finalFilename = filename || `水文分析报告_${dayjs().format('YYYYMMDD_HHmmss')}.pdf`
      pdf.save(finalFilename)
    } catch (error) {
      console.error('PDF导出失败:', error)
      throw error
    }
  },

  exportAnalysisReport(report, filename, format = 'excel') {
    const reportData = this.formatReportData(report)

    switch (format.toLowerCase()) {
      case 'excel':
      case 'xlsx':
        this.exportToExcel(reportData, filename || '水文分析报告.xlsx', {
          sheetName: '分析报告'
        })
        break
      case 'csv':
        this.exportToCSV(reportData, filename || '水文分析报告.csv')
        break
      case 'json':
        this.exportToJSON(report, filename || '水文分析报告.json')
        break
      default:
        this.exportToExcel(reportData, filename || '水文分析报告.xlsx', {
          sheetName: '分析报告'
        })
    }
  },

  formatReportData(report) {
    if (!report) return []

    const formattedData = []

    if (report.basicStats) {
      Object.entries(report.basicStats).forEach(([key, value]) => {
        formattedData.push({
          '统计项目': this.translateStatKey(key),
          '数值': value,
          '分类': '基础统计'
        })
      })
    }

    if (report.percentiles) {
      Object.entries(report.percentiles).forEach(([key, value]) => {
        formattedData.push({
          '统计项目': key,
          '数值': value,
          '分类': '百分位数'
        })
      })
    }

    if (report.trend) {
      Object.entries(report.trend).forEach(([key, value]) => {
        formattedData.push({
          '统计项目': this.translateTrendKey(key),
          '数值': value,
          '分类': '趋势分析'
        })
      })
    }

    if (report.timeAggregation && Array.isArray(report.timeAggregation)) {
      report.timeAggregation.forEach((item, index) => {
        formattedData.push({
          '统计项目': `时间段${index + 1}`,
          '时间': item.time,
          '数值': item.mean,
          '分类': '时间聚合'
        })
      })
    }

    return formattedData
  },

  translateStatKey(key) {
    const translations = {
      mean: '平均值',
      median: '中位数',
      mode: '众数',
      variance: '方差',
      stdDev: '标准差',
      min: '最小值',
      max: '最大值',
      range: '极差',
      count: '数据量'
    }
    return translations[key] || key
  },

  translateTrendKey(key) {
    const translations = {
      slope: '斜率',
      intercept: '截距',
      rSquared: 'R平方',
      trend: '趋势方向',
      predictedNext: '预测值'
    }
    return translations[key] || key
  },

  calculateColumnWidths(data) {
    if (!Array.isArray(data) || data.length === 0) {
      return []
    }

    const keys = Object.keys(data[0])
    return keys.map((key) => {
      const maxLength = Math.max(
        key.length,
        ...data.map((item) => String(item[key] || '').length)
      )
      return { wch: Math.min(maxLength + 4, 30) }
    })
  },

  exportMultiSheetExcel(sheets, filename) {
    if (!Array.isArray(sheets) || sheets.length === 0) {
      console.warn('没有可导出的数据')
      return
    }

    const workbook = XLSX.utils.book_new()

    sheets.forEach((sheet) => {
      const { name, data, headers } = sheet
      let exportData = data

      if (headers && Array.isArray(headers)) {
        exportData = data.map((item) => {
          const newItem = {}
          headers.forEach((header) => {
            newItem[header.label || header.key] = item[header.key] !== undefined ? item[header.key] : ''
          })
          return newItem
        })
      }

      const worksheet = XLSX.utils.json_to_sheet(exportData)
      worksheet['!cols'] = this.calculateColumnWidths(exportData)
      XLSX.utils.book_append_sheet(workbook, worksheet, name || 'Sheet1')
    })

    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
    const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })

    const finalFilename = filename || `水文数据_${dayjs().format('YYYYMMDD_HHmmss')}.xlsx`
    saveAs(blob, finalFilename)
  },

  exportSummaryReport(summary, filename) {
    const reportContent = this.formatSummaryReport(summary)

    const blob = new Blob([reportContent], { type: 'text/plain;charset=utf-8' })
    const finalFilename = filename || `水文数据摘要_${dayjs().format('YYYYMMDD_HHmmss')}.txt`
    saveAs(blob, finalFilename)
  },

  formatSummaryReport(summary) {
    let report = '========================================\n'
    report += '        水文数据统计分析摘要报告\n'
    report += '========================================\n\n'
    report += `生成时间: ${dayjs().format('YYYY-MM-DD HH:mm:ss')}\n\n`

    if (summary.dataRange) {
      report += `--- 数据范围 ---\n`
      report += `起始时间: ${summary.dataRange.start}\n`
      report += `结束时间: ${summary.dataRange.end}\n`
      report += `数据总量: ${summary.dataRange.total}\n\n`
    }

    if (summary.waterLevel) {
      report += `--- 水位统计 ---\n`
      report += `  平均值: ${summary.waterLevel.mean} m\n`
      report += `  最大值: ${summary.waterLevel.max} m\n`
      report += `  最小值: ${summary.waterLevel.min} m\n`
      report += `  标准差: ${summary.waterLevel.stdDev} m\n\n`
    }

    if (summary.flowVelocity) {
      report += `--- 流速统计 ---\n`
      report += `  平均值: ${summary.flowVelocity.mean} m/s\n`
      report += `  最大值: ${summary.flowVelocity.max} m/s\n`
      report += `  最小值: ${summary.flowVelocity.min} m/s\n`
      report += `  标准差: ${summary.flowVelocity.stdDev} m/s\n\n`
    }

    if (summary.rainfall) {
      report += `--- 雨量统计 ---\n`
      report += `  累计雨量: ${summary.rainfall.sum} mm\n`
      report += `  平均雨量: ${summary.rainfall.mean} mm\n`
      report += `  最大雨量: ${summary.rainfall.max} mm\n\n`
    }

    if (summary.trend) {
      report += `--- 趋势分析 ---\n`
      report += `  趋势方向: ${this.translateTrendDirection(summary.trend.trend)}\n`
      report += `  变化速率: ${summary.trend.slope}\n`
      report += `  预测值: ${summary.trend.predictedNext}\n\n`
    }

    report += '========================================\n'
    report += '        报告结束\n'
    report += '========================================\n'

    return report
  },

  translateTrendDirection(trend) {
    const translations = {
      increasing: '上升趋势',
      decreasing: '下降趋势',
      stable: '稳定趋势'
    }
    return translations[trend] || trend
  }
}

export default exportService
