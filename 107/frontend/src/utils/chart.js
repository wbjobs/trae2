import * as echarts from 'echarts'

export const createChart = (el, option) => {
  const chart = echarts.init(el)
  chart.setOption(option)
  return chart
}

export const resizeChart = (chart) => {
  chart && chart.resize()
}

export const baseOption = {
  backgroundColor: 'transparent',
  textStyle: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 12
  }
}

export const getLineChartOption = (data, name = '发电量', unit = 'kWh') => ({
  ...baseOption,
  tooltip: {
    trigger: 'axis',
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    borderColor: '#409eff',
    textStyle: { color: '#fff' }
  },
  grid: {
    left: '3%',
    right: '4%',
    bottom: '3%',
    top: '15%',
    containLabel: true
  },
  xAxis: {
    type: 'category',
    boundaryGap: false,
    data: data.map(d => d.time),
    axisLine: { lineStyle: { color: 'rgba(64, 158, 255, 0.3)' } },
    axisLabel: { color: 'rgba(255, 255, 255, 0.7)' }
  },
  yAxis: {
    type: 'value',
    name: unit,
    nameTextStyle: { color: 'rgba(255, 255, 255, 0.7)' },
    axisLine: { show: false },
    splitLine: { lineStyle: { color: 'rgba(64, 158, 255, 0.1)' } },
    axisLabel: { color: 'rgba(255, 255, 255, 0.7)' }
  },
  series: [{
    name,
    type: 'line',
    smooth: true,
    symbol: 'circle',
    symbolSize: 6,
    lineStyle: {
      width: 3,
      color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
        { offset: 0, color: '#409eff' },
        { offset: 1, color: '#00d4ff' }
      ])
    },
    itemStyle: { color: '#00d4ff' },
    areaStyle: {
      color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
        { offset: 0, color: 'rgba(64, 158, 255, 0.3)' },
        { offset: 1, color: 'rgba(64, 158, 255, 0)' }
      ])
    },
    data: data.map(d => d.value)
  }]
})

export const getBarChartOption = (data, name = '数量') => ({
  ...baseOption,
  tooltip: {
    trigger: 'axis',
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    borderColor: '#409eff'
  },
  grid: {
    left: '3%',
    right: '4%',
    bottom: '3%',
    top: '10%',
    containLabel: true
  },
  xAxis: {
    type: 'category',
    data: data.map(d => d.name),
    axisLine: { lineStyle: { color: 'rgba(64, 158, 255, 0.3)' } },
    axisLabel: { color: 'rgba(255, 255, 255, 0.7)', rotate: 30 }
  },
  yAxis: {
    type: 'value',
    name: name,
    axisLine: { show: false },
    splitLine: { lineStyle: { color: 'rgba(64, 158, 255, 0.1)' } },
    axisLabel: { color: 'rgba(255, 255, 255, 0.7)' }
  },
  series: [{
    type: 'bar',
    barWidth: '50%',
    itemStyle: {
      color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
        { offset: 0, color: '#409eff' },
        { offset: 1, color: '#00d4ff' }
      ]),
      borderRadius: [4, 4, 0, 0]
    },
    data: data.map(d => d.value)
  }]
})

export const getPieChartOption = (data, name = '占比') => ({
  ...baseOption,
  tooltip: {
    trigger: 'item',
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    borderColor: '#409eff',
    formatter: '{b}: {c} ({d}%)'
  },
  legend: {
    orient: 'vertical',
    right: '5%',
    top: 'center',
    textStyle: { color: 'rgba(255, 255, 255, 0.7)' }
  },
  series: [{
    name,
    type: 'pie',
    radius: ['40%', '70%'],
    center: ['35%', '50%'],
    avoidLabelOverlap: false,
    itemStyle: {
      borderRadius: 4,
      borderColor: '#0a1628',
      borderWidth: 2
    },
    label: { show: false },
    emphasis: {
      label: {
        show: true,
        fontSize: 14,
        fontWeight: 'bold',
        color: '#fff'
      }
    },
    labelLine: { show: false },
    data: data.map((d, i) => ({
      ...d,
      itemStyle: {
        color: [
          '#409eff', '#67c23a', '#e6a23c', '#f56c6c',
          '#909399', '#00d4ff', '#ff6b6b', '#4ecdc4'
        ][i % 8]
      }
    }))
  }]
})

export const getGaugeOption = (value, name = '效率', max = 100, unit = '%') => ({
  ...baseOption,
  series: [{
    type: 'gauge',
    startAngle: 200,
    endAngle: -20,
    min: 0,
    max: max,
    splitNumber: 10,
    radius: '90%',
    itemStyle: {
      color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
        { offset: 0, color: '#409eff' },
        { offset: 1, color: '#00d4ff' }
      ])
    },
    progress: {
      show: true,
      width: 12
    },
    pointer: { show: false },
    axisLine: {
      lineStyle: {
        width: 12,
        color: [[1, 'rgba(255, 255, 255, 0.1)']]
      }
    },
    axisTick: { show: false },
    splitLine: { show: false },
    axisLabel: { show: false },
    anchor: { show: false },
    title: {
      offsetCenter: [0, '20%'],
      fontSize: 14,
      color: 'rgba(255, 255, 255, 0.7)'
    },
    detail: {
      valueAnimation: true,
      fontSize: 28,
      fontWeight: 'bold',
      offsetCenter: [0, '-10%'],
      formatter: `{value}${unit}`,
      color: '#00d4ff'
    },
    data: [{ value, name }]
  }]
})

export const getYoYMoMChartOption = (data, compareType = 'all') => {
  const yoyDetails = data.yoy?.details || []
  const momDetails = data.mom?.details || []
  const xData = yoyDetails.length > 0 ? yoyDetails.map(d => d.time) : momDetails.map(d => d.time)

  const series = []

  if (compareType === 'yoy' || compareType === 'all') {
    series.push({
      name: '当年',
      type: 'line',
      smooth: true,
      symbol: 'circle',
      symbolSize: 6,
      lineStyle: {
        width: 3,
        color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
          { offset: 0, color: '#409eff' },
          { offset: 1, color: '#00d4ff' }
        ])
      },
      itemStyle: { color: '#00d4ff' },
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: 'rgba(64, 158, 255, 0.25)' },
          { offset: 1, color: 'rgba(64, 158, 255, 0)' }
        ])
      },
      data: yoyDetails.map(d => d.current)
    })
    series.push({
      name: '去年',
      type: 'line',
      smooth: true,
      symbol: 'circle',
      symbolSize: 6,
      lineStyle: {
        width: 2,
        type: 'dashed',
        color: 'rgba(255, 255, 255, 0.4)'
      },
      itemStyle: { color: 'rgba(255, 255, 255, 0.5)' },
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: 'rgba(255, 255, 255, 0.08)' },
          { offset: 1, color: 'rgba(255, 255, 255, 0)' }
        ])
      },
      data: yoyDetails.map(d => d.previous)
    })
  }

  if (compareType === 'mom' || compareType === 'all') {
    series.push({
      name: '本期',
      type: 'line',
      smooth: true,
      symbol: 'diamond',
      symbolSize: 6,
      lineStyle: {
        width: 3,
        color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
          { offset: 0, color: '#67c23a' },
          { offset: 1, color: '#95d475' }
        ])
      },
      itemStyle: { color: '#95d475' },
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: 'rgba(103, 194, 58, 0.2)' },
          { offset: 1, color: 'rgba(103, 194, 58, 0)' }
        ])
      },
      data: momDetails.map(d => d.current)
    })
    series.push({
      name: '上期',
      type: 'line',
      smooth: true,
      symbol: 'diamond',
      symbolSize: 6,
      lineStyle: {
        width: 2,
        type: 'dashed',
        color: 'rgba(255, 255, 255, 0.35)'
      },
      itemStyle: { color: 'rgba(255, 255, 255, 0.45)' },
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: 'rgba(255, 255, 255, 0.06)' },
          { offset: 1, color: 'rgba(255, 255, 255, 0)' }
        ])
      },
      data: momDetails.map(d => d.previous)
    })
  }

  const yoyRate = data.yoy?.changeRate ?? 0
  const momRate = data.mom?.changeRate ?? 0

  return {
    ...baseOption,
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      borderColor: '#409eff',
      textStyle: { color: '#fff' },
      formatter: (params) => {
        let html = `<div style="margin-bottom:4px;font-weight:bold">${params[0].axisValue}</div>`
        params.forEach(p => {
          html += `<div style="display:flex;justify-content:space-between;gap:16px;">
            <span>${p.marker} ${p.seriesName}</span>
            <span style="font-weight:bold">${p.value}</span>
          </div>`
        })
        if (compareType === 'yoy' || compareType === 'all') {
          html += `<div style="margin-top:6px;color:#e6a23c;">同比变化率: ${yoyRate}%</div>`
        }
        if (compareType === 'mom' || compareType === 'all') {
          html += `<div style="margin-top:2px;color:#67c23a;">环比变化率: ${momRate}%</div>`
        }
        return html
      }
    },
    legend: {
      data: series.map(s => s.name),
      textStyle: { color: 'rgba(255, 255, 255, 0.7)' },
      top: 0
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      top: '15%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: xData,
      axisLine: { lineStyle: { color: 'rgba(64, 158, 255, 0.3)' } },
      axisLabel: { color: 'rgba(255, 255, 255, 0.7)' }
    },
    yAxis: {
      type: 'value',
      name: 'kWh',
      nameTextStyle: { color: 'rgba(255, 255, 255, 0.7)' },
      axisLine: { show: false },
      splitLine: { lineStyle: { color: 'rgba(64, 158, 255, 0.1)' } },
      axisLabel: { color: 'rgba(255, 255, 255, 0.7)' }
    },
    series
  }
}

export const getGeoMapOption = (geoData) => {
  const scatterData = (geoData || []).map(item => ({
    name: item.name,
    value: [...item.coord, item.count]
  }))
  const effectData = (geoData || []).filter(item => item.severity === 'high').map(item => ({
    name: item.name,
    value: [...item.coord, item.count]
  }))

  return {
    ...baseOption,
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      borderColor: '#409eff',
      textStyle: { color: '#fff' },
      formatter: (params) => {
        if (params.seriesType === 'effectScatter' || params.seriesType === 'scatter') {
          return `${params.name}<br/>故障数量: ${params.value[2]}`
        }
        return params.name
      }
    },
    geo: {
      map: 'china',
      roam: true,
      zoom: 1.2,
      itemStyle: {
        areaColor: 'rgba(15, 38, 68, 0.6)',
        borderColor: 'rgba(64, 158, 255, 0.4)',
        borderWidth: 1
      },
      emphasis: {
        itemStyle: {
          areaColor: 'rgba(64, 158, 255, 0.2)'
        },
        label: {
          show: true,
          color: '#fff'
        }
      },
      label: { show: false }
    },
    visualMap: {
      min: 0,
      max: 50,
      calculable: true,
      orient: 'vertical',
      left: '3%',
      bottom: '5%',
      textStyle: { color: 'rgba(255, 255, 255, 0.7)' },
      inRange: {
        color: ['#67c23a', '#e6a23c', '#f56c6c']
      }
    },
    series: [
      {
        name: '故障分布',
        type: 'scatter',
        coordinateSystem: 'geo',
        symbolSize: (val) => Math.max(8, val[2] * 1.2),
        itemStyle: { color: '#e6a23c' },
        data: scatterData
      },
      {
        name: '严重故障',
        type: 'effectScatter',
        coordinateSystem: 'geo',
        symbolSize: (val) => Math.max(12, val[2] * 1.5),
        rippleEffect: {
          brushType: 'stroke',
          scale: 3,
          period: 4
        },
        itemStyle: { color: '#f56c6c' },
        data: effectData
      }
    ]
  }
}
