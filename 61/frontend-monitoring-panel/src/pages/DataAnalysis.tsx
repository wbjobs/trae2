import React, { useEffect, useState } from 'react'
import { Row, Col, Card, Select, DatePicker, Space } from 'antd'
import ReactECharts from 'echarts-for-react'
import { analysisApi, gatewayApi } from '../services/api'
import { SensorData } from '../types'
import dayjs from 'dayjs'

const { RangePicker } = DatePicker

const DataAnalysis: React.FC = () => {
  const [selectedRoom, setSelectedRoom] = useState<string>('room_001')
  const [selectedSensor, setSelectedSensor] = useState<string>('temperature')
  const [sensorList, setSensorList] = useState<string[]>([])
  const [historyData, setHistoryData] = useState<SensorData[]>([])

  const sensorOptions = [
    { label: '温度', value: 'temperature', unit: '°C' },
    { label: '湿度', value: 'humidity', unit: '%' },
    { label: '电流', value: 'current', unit: 'A' },
    { label: '电压', value: 'voltage', unit: 'V' },
    { label: '电弧', value: 'arc', unit: '次' },
    { label: '烟雾', value: 'smoke', unit: 'ppm' },
  ]

  const loadSensorList = async () => {
    try {
      const res = await gatewayApi.getRoomSensors(selectedRoom)
      setSensorList(Object.keys(res.data.data))
    } catch (error) {
      console.error('Failed to load sensor list:', error)
    }
  }

  const loadHistoryData = async () => {
    if (!sensorList.length) return
    
    const device = sensorList.find((d) => d.includes(selectedSensor))
    if (!device) return

    try {
      const res = await gatewayApi.getSensorHistory(selectedRoom, device)
      setHistoryData(res.data.data || [])
    } catch (error) {
      console.error('Failed to load history:', error)
    }
  }

  useEffect(() => {
    loadSensorList()
  }, [selectedRoom])

  useEffect(() => {
    if (sensorList.length) {
      loadHistoryData()
    }
  }, [selectedSensor, sensorList])

  const selectedSensorInfo = sensorOptions.find((s) => s.value === selectedSensor)

  const lineChart = {
    title: {
      text: `${selectedSensorInfo?.label}趋势图`,
      left: 'center',
    },
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: historyData.map((d) => dayjs(d.timestamp).format('HH:mm:ss')),
    },
    yAxis: {
      type: 'value',
      name: selectedSensorInfo?.unit,
    },
    series: [
      {
        name: selectedSensorInfo?.label,
        data: historyData.map((d) => d.value),
        type: 'line',
        smooth: true,
        areaStyle: { opacity: 0.3 },
        markLine: {
          data: [
            { type: 'average', name: '平均值' },
            { yAxis: 40, name: '警告阈值', lineStyle: { color: '#faad14' } },
          ],
        },
      },
    ],
  }

  const scatterChart = {
    title: { text: '数据分布', left: 'center' },
    tooltip: { trigger: 'item' },
    xAxis: { type: 'category', data: sensorOptions.map((s) => s.label) },
    yAxis: { type: 'value' },
    series: [
      {
        type: 'scatter',
        data: sensorOptions.map((s) => {
          const device = sensorList.find((d) => d.includes(s.value))
          const deviceData = historyData.filter((d) => d.sensor_type === s.value)
          return deviceData.length ? deviceData[deviceData.length - 1]?.value || 0 : 0
        }),
        symbolSize: 20,
      },
    ],
  }

  const gaugeChart = {
    series: [
      {
        type: 'gauge',
        startAngle: 180,
        endAngle: 0,
        min: 0,
        max: selectedSensor === 'temperature' ? 60 : selectedSensor === 'current' ? 120 : 100,
        splitNumber: 5,
        itemStyle: { color: '#58D9F9', shadowColor: 'rgba(0,138,255,0.45)', shadowBlur: 10, shadowOffsetX: 2, shadowOffsetY: 2 },
        progress: { show: true, roundCap: true, width: 18 },
        axisLine: { roundCap: true, width: 18 },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { show: false, distance: 25, fontSize: 14 },
        anchor: { show: false },
        title: { show: false },
        detail: {
          valueAnimation: true,
          width: '60%',
          lineHeight: 40,
          borderRadius: 8,
          offsetCenter: [0, '-15%'],
          fontSize: 30,
          fontWeight: 'bolder',
          formatter: '{value} ' + selectedSensorInfo?.unit,
          color: 'auto',
        },
        data: [
          {
            value:
              historyData.length > 0 ? historyData[historyData.length - 1]?.value || 0 : 0,
          },
        ],
      },
    ],
  }

  return (
    <div>
      <Card style={{ marginBottom: 16 }}>
        <Space size="large">
          <Select
            style={{ width: 200 }}
            value={selectedRoom}
            onChange={setSelectedRoom}
            options={[
              { label: '1号配电房', value: 'room_001' },
              { label: '2号配电房', value: 'room_002' },
            ]}
          />
          <Select
            style={{ width: 150 }}
            value={selectedSensor}
            onChange={setSelectedSensor}
            options={sensorOptions}
          />
          <RangePicker
            showTime
            defaultValue={[dayjs().subtract(1, 'hour'), dayjs()]}
          />
        </Space>
      </Card>

      <Row gutter={[16, 16]}>
        <Col span={16}>
          <Card title="趋势分析">
            <ReactECharts option={lineChart} style={{ height: 400 }} />
          </Card>
        </Col>
        <Col span={8}>
          <Card title="实时值">
            <ReactECharts option={gaugeChart} style={{ height: 300 }} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col span={12}>
          <Card title="数据分布">
            <ReactECharts option={scatterChart} style={{ height: 300 }} />
          </Card>
        </Col>
        <Col span={12}>
          <Card title="阈值配置">
            <ThresholdConfig />
          </Card>
        </Col>
      </Row>
    </div>
  )
}

const ThresholdConfig: React.FC = () => {
  const [thresholds, setThresholds] = useState<any>({})

  useEffect(() => {
    loadThresholds()
  }, [])

  const loadThresholds = async () => {
    try {
      const res = await analysisApi.getThresholds()
      setThresholds(res.data.thresholds)
    } catch (error) {
      console.error('Failed to load thresholds:', error)
    }
  }

  return (
    <div>
      {Object.entries(thresholds).map(([key, value]: [string, any]) => (
        <div key={key} style={{ marginBottom: 16, padding: 12, background: '#f5f5f5', borderRadius: 4 }}>
          <div style={{ fontWeight: 'bold', marginBottom: 8 }}>
            {key === 'temperature'
              ? '温度'
              : key === 'humidity'
              ? '湿度'
              : key === 'current'
              ? '电流'
              : key === 'voltage'
              ? '电压'
              : key === 'arc'
              ? '电弧'
              : key === 'smoke'
              ? '烟雾'
              : key}
          </div>
          {value.warning !== undefined && (
            <div style={{ fontSize: 12, color: '#666' }}>
              警告阈值: {value.warning} {value.unit} | 严重阈值: {value.critical} {value.unit}
            </div>
          )}
          {value.warning_min !== undefined && (
            <div style={{ fontSize: 12, color: '#666' }}>
              正常范围: {value.warning_min} - {value.warning_max} {value.unit}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

export default DataAnalysis
