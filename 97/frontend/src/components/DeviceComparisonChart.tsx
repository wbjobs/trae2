import React, { useEffect, useState, useCallback } from 'react'
import ReactECharts from 'echarts-for-react'
import { Select, Spin } from 'antd'
import { dashboardApi } from '@/services/api'

interface DeviceComparisonChartProps {
  onDeviceSelect?: (deviceId: string) => void
}

const DeviceComparisonChart: React.FC<DeviceComparisonChartProps> = ({ onDeviceSelect }) => {
  const [loading, setLoading] = useState(false)
  const [metricName, setMetricName] = useState('temperature')
  const [comparisonData, setComparisonData] = useState<any[]>([])
  const [unit, setUnit] = useState('')

  const metrics = [
    { value: 'temperature', label: '温度' },
    { value: 'vibration', label: '振动' },
    { value: 'pressure', label: '压力' },
    { value: 'current', label: '电流' },
    { value: 'power', label: '功率' },
    { value: 'voltage', label: '电压' },
    { value: 'rpm', label: '转速' },
    { value: 'flow_rate', label: '流量' },
    { value: 'humidity', label: '湿度' }
  ]

  const fetchComparisonData = useCallback(async () => {
    setLoading(true)
    try {
      const response = await dashboardApi.getDeviceComparison(metricName, 24)
      if (response.data.success) {
        const data = response.data.comparison_data || []
        setComparisonData(data)
        setUnit(response.data.unit || '')
      }
    } catch (error) {
      console.error('获取对比数据失败:', error)
      setComparisonData([])
    } finally {
      setLoading(false)
    }
  }, [metricName])

  useEffect(() => {
    fetchComparisonData()
  }, [fetchComparisonData])

  const getChartOption = () => {
    const validData = comparisonData.filter(item => item && item.device_id)
    const values = validData.flatMap(d => [d.avg, d.max, d.min]).filter(v => v !== undefined && v !== null)
    const maxValue = values.length > 0 ? Math.max(...values) * 1.1 : 100

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
        bottom: '15%',
        top: '18%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: validData.map(item => item.device_name || item.device_id),
        axisLine: { lineStyle: { color: 'rgba(100, 150, 255, 0.3)' } },
        axisLabel: { 
          color: '#90a4ae', 
          rotate: 30,
          fontSize: 10,
          interval: 0
        }
      },
      yAxis: {
        type: 'value',
        name: unit || '数值',
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
          type: 'bar',
          data: validData.map(item => item.avg),
          itemStyle: { color: '#4fc3f7' },
          barWidth: '25%'
        },
        {
          name: '最大值',
          type: 'bar',
          data: validData.map(item => item.max),
          itemStyle: { color: '#66bb6a' },
          barWidth: '25%'
        },
        {
          name: '最小值',
          type: 'bar',
          data: validData.map(item => item.min),
          itemStyle: { color: '#ffa726' },
          barWidth: '25%'
        }
      ]
    }
  }

  const handleChartClick = (params: any) => {
    if (params && params.name && onDeviceSelect) {
      const device = comparisonData.find(d => (d.device_name || d.device_id) === params.name)
      if (device) {
        onDeviceSelect(device.device_id)
      }
    }
  }

  const onEvents = {
    click: handleChartClick
  }

  return (
    <div className="chart-card" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div className="chart-title">设备指标对比</div>
        <Select
          value={metricName}
          onChange={setMetricName}
          style={{ width: 120 }}
          options={metrics}
        />
      </div>
      <div style={{ flex: 1, minHeight: 200 }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            <Spin />
          </div>
        ) : comparisonData.length > 0 ? (
          <ReactECharts 
            option={getChartOption()} 
            style={{ height: '100%' }}
            onEvents={onEvents}
            notMerge={true}
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

export default DeviceComparisonChart
