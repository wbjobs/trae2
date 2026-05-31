import React, { useEffect, useState, useCallback } from 'react'
import ReactECharts from 'echarts-for-react'
import { Select, Row, Col, Spin } from 'antd'
import { dashboardApi } from '@/services/api'

interface MetricTrendChartProps {
  deviceId: string
  metricName: string
  onDataLoaded?: (data: any) => void
}

const periodMap: Record<string, string> = {
  '15min': 'min',
  'h': 'h',
  '4h': 'h',
  'D': 'D',
  'W': 'W'
}

const MetricTrendChart: React.FC<MetricTrendChartProps> = ({ deviceId, metricName, onDataLoaded }) => {
  const [loading, setLoading] = useState(false)
  const [trendData, setTrendData] = useState<any[]>([])
  const [unit, setUnit] = useState('')
  const [period, setPeriod] = useState('h')

  const fetchTrendData = useCallback(async () => {
    if (!deviceId || !metricName) return
    
    setLoading(true)
    try {
      const response = await dashboardApi.getMetricTrend(deviceId, metricName, 24, periodMap[period] || period)
      if (response.data.success) {
        const data = response.data.trend_data || []
        setTrendData(data)
        setUnit(response.data.unit || '')
        onDataLoaded?.(response.data)
      }
    } catch (error) {
      console.error('获取趋势数据失败:', error)
      setTrendData([])
    } finally {
      setLoading(false)
    }
  }, [deviceId, metricName, period, onDataLoaded])

  useEffect(() => {
    fetchTrendData()
  }, [fetchTrendData])

  const getChartOption = () => {
    const validData = trendData.filter(item => item && item.time)
    const values = validData.flatMap(d => [d.avg, d.max, d.min]).filter(v => v !== undefined && v !== null)
    const minValue = values.length > 0 ? Math.min(...values) * 0.95 : 0
    const maxValue = values.length > 0 ? Math.max(...values) * 1.05 : 100

    return {
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(15, 52, 96, 0.95)',
        borderColor: 'rgba(100, 150, 255, 0.4)',
        textStyle: { color: '#fff' }
      },
      legend: {
        data: ['平均值', '最大值', '最小值'],
        textStyle: { color: '#90a4ae' },
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
        data: validData.map(item => {
          const timeStr = String(item.time)
          return timeStr.includes(' ') ? timeStr.split(' ')[1].substring(0, 5) : timeStr.substring(0, 5)
        }),
        axisLine: { lineStyle: { color: 'rgba(100, 150, 255, 0.3)' } },
        axisLabel: { color: '#90a4ae', fontSize: 11 }
      },
      yAxis: {
        type: 'value',
        name: unit || '数值',
        min: minValue,
        max: maxValue,
        axisLine: { lineStyle: { color: 'rgba(100, 150, 255, 0.3)' } },
        axisLabel: { 
          color: '#90a4ae',
          fontSize: 11,
          formatter: (value: number) => {
            if (Math.abs(value) >= 1000) return (value / 1000).toFixed(1) + 'k'
            return value.toFixed(1)
          }
        },
        splitLine: { lineStyle: { color: 'rgba(100, 150, 255, 0.1)' } }
      },
      series: [
        {
          name: '平均值',
          type: 'line',
          smooth: true,
          data: validData.map(item => item.avg),
          areaStyle: {
            color: {
              type: 'linear',
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(79, 195, 247, 0.3)' },
                { offset: 1, color: 'rgba(79, 195, 247, 0.05)' }
              ]
            }
          },
          lineStyle: { color: '#4fc3f7', width: 2 },
          itemStyle: { color: '#4fc3f7' }
        },
        {
          name: '最大值',
          type: 'line',
          smooth: true,
          data: validData.map(item => item.max),
          lineStyle: { color: '#66bb6a', width: 1, type: 'dashed' },
          itemStyle: { color: '#66bb6a' },
          symbol: 'none'
        },
        {
          name: '最小值',
          type: 'line',
          smooth: true,
          data: validData.map(item => item.min),
          lineStyle: { color: '#ef5350', width: 1, type: 'dashed' },
          itemStyle: { color: '#ef5350' },
          symbol: 'none'
        }
      ]
    }
  }

  return (
    <div className="chart-card" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Row justify="space-between" align="middle" style={{ marginBottom: 12 }}>
        <Col>
          <div className="chart-title">指标趋势</div>
        </Col>
        <Col>
          <Select
            value={period}
            onChange={setPeriod}
            style={{ width: 120 }}
            options={[
              { value: '15min', label: '15分钟' },
              { value: 'h', label: '1小时' },
              { value: 'D', label: '1天' },
              { value: 'W', label: '1周' }
            ]}
          />
        </Col>
      </Row>
      <div style={{ flex: 1, minHeight: 200 }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            <Spin />
          </div>
        ) : trendData.length > 0 ? (
          <ReactECharts 
            option={getChartOption()} 
            style={{ height: '100%' }}
            notMerge={true}
            lazyUpdate={false}
          />
        ) : (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: '#666' }}>
            暂无数据
          </div>
        )}
      </div>
    </div>
  )
}

export default MetricTrendChart
