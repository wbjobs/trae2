import React, { useEffect, useState } from 'react'
import { Row, Col, Card, Select, Space, Badge, Tag, Table, Statistic, Progress } from 'antd'
import {
  ThermometerOutlined,
  DropletOutlined,
  ThunderboltOutlined,
  BulbOutlined,
  FireOutlined,
  ZapOutlined,
  DatabaseOutlined,
  CheckCircleOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import ReactECharts from 'echarts-for-react'
import { gatewayApi, alertApi, controlApi } from '../services/api'
import { Room, SensorData, AlertMessage, AggregateData } from '../types'
import dayjs from 'dayjs'

const Dashboard: React.FC = () => {
  const [rooms, setRooms] = useState<Room[]>([])
  const [selectedRoom, setSelectedRoom] = useState<string>('')
  const [sensorData, setSensorData] = useState<Record<string, SensorData>>({})
  const [alerts, setAlerts] = useState<AlertMessage[]>([])
  const [historyData, setHistoryData] = useState<any[]>([])
  const [aggregateData, setAggregateData] = useState<AggregateData | null>(null)
  const [deviceSummary, setDeviceSummary] = useState<any>(null)

  useEffect(() => {
    loadRooms()
    loadAlerts()
    loadAggregateData()
    loadDeviceSummary()
  }, [])

  useEffect(() => {
    if (selectedRoom) {
      loadSensorData()
      const interval = setInterval(loadSensorData, 2000)
      return () => clearInterval(interval)
    }
  }, [selectedRoom])

  const loadRooms = async () => {
    try {
      const res = await gatewayApi.getRooms()
      setRooms(res.data.rooms)
      if (res.data.rooms.length > 0) {
        setSelectedRoom(res.data.rooms[0].id)
      }
    } catch (error) {
      console.error('Failed to load rooms:', error)
    }
  }

  const loadSensorData = async () => {
    try {
      const res = await gatewayApi.getRoomSensors(selectedRoom)
      setSensorData(res.data.data)
    } catch (error) {
      console.error('Failed to load sensor data:', error)
    }
  }

  const loadAlerts = async () => {
    try {
      const res = await alertApi.getActiveAlerts()
      setAlerts(res.data.alerts.slice(0, 5))
    } catch (error) {
      console.error('Failed to load alerts:', error)
    }
  }

  const loadAggregateData = async () => {
    try {
      const res = await gatewayApi.getAggregateData()
      setAggregateData(res.data)
    } catch (error) {
      console.error('Failed to load aggregate data:', error)
    }
  }

  const loadDeviceSummary = async () => {
    try {
      const res = await controlApi.getDevicesSummary()
      setDeviceSummary(res.data)
    } catch (error) {
      console.error('Failed to load device summary:', error)
    }
  }

  const getSensorValue = (type: string) => {
    const sensor = Object.values(sensorData).find((s) => s.sensor_type === type)
    return sensor?.value || 0
  }

  const getSensorUnit = (type: string) => {
    const sensor = Object.values(sensorData).find((s) => s.sensor_type === type)
    return sensor?.unit || ''
  }

  const temperatureChart = {
    title: { text: '温度趋势', left: 'center', textStyle: { fontSize: 14 } },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: historyData.map((_, i) => i) },
    yAxis: { type: 'value' },
    series: [
      {
        data: [...historyData.map((d) => d.temperature || 0), getSensorValue('temperature')],
        type: 'line',
        smooth: true,
        lineStyle: { color: '#ff4d4f' },
        areaStyle: { color: 'rgba(255,77,79,0.2)' },
      },
    ],
  }

  const alertColumns = [
    {
      title: '级别',
      dataIndex: 'level',
      key: 'level',
      render: (level: string) => (
        <Tag color={level === 'emergency' || level === 'critical' ? 'red' : level === 'warning' ? 'orange' : 'blue'}>
          {level.toUpperCase()}
        </Tag>
      ),
    },
    { title: '消息', dataIndex: 'message', key: 'message' },
    {
      title: '时间',
      dataIndex: 'timestamp',
      key: 'timestamp',
      render: (t: string) => dayjs(t).format('HH:mm:ss'),
    },
  ]

  return (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="配电房总数"
              value={rooms.length}
              prefix={<DatabaseOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="设备总数"
              value={aggregateData?.summary.total_devices || 0}
              prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="跳闸设备"
              value={deviceSummary?.by_status?.tripped || 0}
              prefix={<WarningOutlined style={{ color: '#ff4d4f' }} />}
              valueStyle={{ color: deviceSummary?.by_status?.tripped > 0 ? '#ff4d4f' : undefined }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="活动告警"
              value={alerts.length}
              prefix={<WarningOutlined style={{ color: '#faad14' }} />}
            />
          </Card>
        </Col>
      </Row>

      <Space style={{ marginBottom: 20 }}>
        <Select
          style={{ width: 200 }}
          value={selectedRoom}
          onChange={setSelectedRoom}
          options={rooms.map((r) => ({ label: r.name, value: r.id }))}
        />
        <Badge status="processing" text="实时监控中" />
      </Space>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card className="dashboard-card">
            <Space align="center">
              <ThermometerOutlined style={{ fontSize: 32 }} />
              <div>
                <div>温度</div>
                <div className="sensor-value">
                  {getSensorValue('temperature')}
                  <span className="sensor-unit">{getSensorUnit('temperature')}</span>
                </div>
              </div>
            </Space>
          </Card>
        </Col>
        <Col span={6}>
          <Card className="dashboard-card-green">
            <Space align="center">
              <DropletOutlined style={{ fontSize: 32 }} />
              <div>
                <div>湿度</div>
                <div className="sensor-value">
                  {getSensorValue('humidity')}
                  <span className="sensor-unit">{getSensorUnit('humidity')}</span>
                </div>
              </div>
            </Space>
          </Card>
        </Col>
        <Col span={6}>
          <Card className="dashboard-card-orange">
            <Space align="center">
              <ThunderboltOutlined style={{ fontSize: 32 }} />
              <div>
                <div>电流</div>
                <div className="sensor-value">
                  {getSensorValue('current')}
                  <span className="sensor-unit">{getSensorUnit('current')}</span>
                </div>
              </div>
            </Space>
          </Card>
        </Col>
        <Col span={6}>
          <Card className="dashboard-card-blue">
            <Space align="center">
              <BulbOutlined style={{ fontSize: 32 }} />
              <div>
                <div>电压</div>
                <div className="sensor-value">
                  {getSensorValue('voltage')}
                  <span className="sensor-unit">{getSensorUnit('voltage')}</span>
                </div>
              </div>
            </Space>
          </Card>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={8}>
          <Card title="电弧检测" extra={<ZapOutlined />}>
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div className="sensor-value" style={{ color: getSensorValue('arc') > 0 ? '#ff4d4f' : '#52c41a' }}>
                {getSensorValue('arc')}
              </div>
              <div>电弧次数 / 10分钟</div>
            </div>
          </Card>
        </Col>
        <Col span={8}>
          <Card title="烟雾检测" extra={<FireOutlined />}>
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div className="sensor-value" style={{ color: getSensorValue('smoke') > 50 ? '#ff4d4f' : '#52c41a' }}>
                {getSensorValue('smoke')}
                <span className="sensor-unit">ppm</span>
              </div>
              <div>烟雾浓度</div>
            </div>
          </Card>
        </Col>
        <Col span={8}>
          <Card title="设备状态">
            <Space direction="vertical">
              <div>
                <Badge status="success" text="断路器: 正常" />
              </div>
              <div>
                <Badge status="success" text="通信: 在线" />
              </div>
              <div>
                <Badge status="processing" text="数据采集: 运行中" />
              </div>
            </Space>
          </Card>
        </Col>
      </Row>

      <Row gutter={16} style={{ marginTop: 24 }}>
        <Col span={14}>
          <Card title="趋势分析">
            <ReactECharts option={temperatureChart} style={{ height: 300 }} />
          </Card>
        </Col>
        <Col span={10}>
          <Card title="最新告警">
            <Table
              columns={alertColumns}
              dataSource={alerts}
              rowKey="alert_id"
              pagination={false}
              size="small"
            />
          </Card>
        </Col>
      </Row>
    </div>
  )
}

export default Dashboard
