import React, { useMemo } from 'react'
import { Card, Select, Space } from 'antd'
import ReactECharts from 'echarts-for-react'
import { useAppStore } from '../../store'
import { logApi } from '../../api'

export const ChartComponent: React.FC = () => {
  const { logs, stats, currentFilter } = useAppStore()
  const [chartType, setChartType] = React.useState<string>('bar')

  const option = useMemo(() => {
    if (chartType === 'bar') {
      return {
        title: { text: '日志级别分布', left: 'center' },
        tooltip: { trigger: 'axis' },
        xAxis: { type: 'category', data: ['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'] },
        yAxis: { type: 'value' },
        series: [{
          type: 'bar',
          data: [
            stats.DEBUG || 0,
            stats.INFO || 0,
            stats.WARN || 0,
            stats.ERROR || 0,
            stats.FATAL || 0
          ],
          itemStyle: {
            color: (params: any) => {
              const colors = ['#909399', '#409EFF', '#E6A23C', '#F56C6C', '#C2185B']
              return colors[params.dataIndex]
            }
          }
        }]
      }
    } else if (chartType === 'pie') {
      return {
        title: { text: '日志占比', left: 'center' },
        tooltip: { trigger: 'item' },
        legend: { bottom: 0 },
        series: [{
          type: 'pie',
          radius: ['40%', '70%'],
          data: [
            { value: stats.DEBUG || 0, name: 'DEBUG', itemStyle: { color: '#909399' } },
            { value: stats.INFO || 0, name: 'INFO', itemStyle: { color: '#409EFF' } },
            { value: stats.WARN || 0, name: 'WARN', itemStyle: { color: '#E6A23C' } },
            { value: stats.ERROR || 0, name: 'ERROR', itemStyle: { color: '#F56C6C' } },
            { value: stats.FATAL || 0, name: 'FATAL', itemStyle: { color: '#C2185B' } }
          ]
        }]
      }
    } else {
      const timeData = logs.reduce((acc: Record<string, number>, log) => {
        const hour = log.timestamp.slice(11, 13)
        acc[hour] = (acc[hour] || 0) + 1
        return acc
      }, {})
      const sortedHours = Object.keys(timeData).sort()
      return {
        title: { text: '日志时间趋势', left: 'center' },
        tooltip: { trigger: 'axis' },
        xAxis: { type: 'category', data: sortedHours.map(h => `${h}:00`) },
        yAxis: { type: 'value' },
        series: [{
          type: 'line',
          data: sortedHours.map(h => timeData[h]),
          smooth: true,
          areaStyle: { opacity: 0.3 }
        }]
      }
    }
  }, [chartType, logs, stats])

  return (
    <Card
      title="可视化图表"
      size="small"
      extra={
        <Select
          value={chartType}
          onChange={setChartType}
          style={{ width: 120 }}
          size="small"
          options={[
            { value: 'bar', label: '柱状图' },
            { value: 'pie', label: '饼图' },
            { value: 'line', label: '折线图' }
          ]}
        />
      }
      style={{ height: '100%' }}
    >
      <ReactECharts option={option} style={{ height: 280 }} />
    </Card>
  )
}