import React, { useEffect, useState } from 'react'
import { Row, Col, Card, Statistic } from 'antd'
import { ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons'
import { dashboardApi } from '@/services/api'
import dayjs from 'dayjs'

interface RealtimeData {
  device_id: string
  device_name: string
  metric_name: string
  value: number
  unit: string
  time: string
  status: string
}

const RealtimeDataPanel: React.FC = () => {
  const [realtimeData, setRealtimeData] = useState<RealtimeData[]>([])
  const [updateTime, setUpdateTime] = useState('')

  useEffect(() => {
    fetchRealtimeData()
    const interval = setInterval(fetchRealtimeData, 5000)
    return () => clearInterval(interval)
  }, [])

  const fetchRealtimeData = async () => {
    try {
      const response = await dashboardApi.getRealtimeData()
      if (response.data.success) {
        setRealtimeData(response.data.data || [])
        setUpdateTime(dayjs(response.data.update_time).format('HH:mm:ss'))
      }
    } catch (error) {
      console.error('获取实时数据失败:', error)
    }
  }

  const getMetricColor = (value: number, baseValue: number) => {
    const ratio = Math.abs(value - baseValue) / baseValue
    if (ratio > 0.3) return '#ef5350'
    if (ratio > 0.15) return '#ffa726'
    return '#66bb6a'
  }

  return (
    <div className="chart-card" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="chart-title">
        实时数据监控
        <span style={{ color: '#66bb6a', fontSize: 12, marginLeft: 8 }}>
          更新于 {updateTime}
        </span>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <Row gutter={[8, 8]}>
          {realtimeData.slice(0, 8).map((item, index) => (
            <Col xs={12} sm={12} md={6} key={index}>
              <Card size="small" style={{ background: 'rgba(255,255,255,0.05)', border: 'none' }}>
                <Statistic
                  title={
                    <div style={{ fontSize: 12, color: '#90a4ae' }}>
                      {item.device_name} - {item.metric_name}
                    </div>
                  }
                  value={item.value}
                  precision={2}
                  suffix={item.unit}
                  valueStyle={{ fontSize: 16, color: getMetricColor(item.value, item.value * 0.9) }}
                />
              </Card>
            </Col>
          ))}
        </Row>
      </div>
    </div>
  )
}

export default RealtimeDataPanel
