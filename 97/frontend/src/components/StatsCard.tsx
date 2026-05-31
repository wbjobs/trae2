import React from 'react'
import { Card, Row, Col } from 'antd'
import { 
  ThunderboltOutlined, 
  SafetyOutlined, 
  WarningOutlined, 
  DashboardOutlined 
} from '@ant-design/icons'

interface StatsCardProps {
  overview: {
    total_devices: number
    total_metrics: number
    total_records: number
    anomaly_count: number
    anomaly_rate: number
    active_devices: number
    warning_devices: number
  }
}

const StatsCard: React.FC<StatsCardProps> = ({ overview }) => {
  const stats = [
    {
      title: '设备总数',
      value: overview.total_devices,
      icon: <DashboardOutlined style={{ fontSize: 24, color: '#4fc3f7' }} />,
      color: '#4fc3f7'
    },
    {
      title: '运行设备',
      value: overview.active_devices,
      icon: <ThunderboltOutlined style={{ fontSize: 24, color: '#66bb6a' }} />,
      color: '#66bb6a'
    },
    {
      title: '告警设备',
      value: overview.warning_devices,
      icon: <WarningOutlined style={{ fontSize: 24, color: '#ffa726' }} />,
      color: '#ffa726'
    },
    {
      title: '异常率',
      value: `${overview.anomaly_rate.toFixed(2)}%`,
      icon: <SafetyOutlined style={{ fontSize: 24, color: '#ef5350' }} />,
      color: '#ef5350'
    }
  ]

  return (
    <Row gutter={[16, 16]}>
      {stats.map((stat, index) => (
        <Col xs={12} sm={12} md={6} key={index}>
          <div className="stats-card">
            <Row align="middle" gutter={12}>
              <Col>{stat.icon}</Col>
              <Col flex="auto">
                <div className="stats-value" style={{ color: stat.color }}>
                  {stat.value}
                </div>
                <div className="stats-label">{stat.title}</div>
              </Col>
            </Row>
          </div>
        </Col>
      ))}
    </Row>
  )
}

export default StatsCard
