import React, { useEffect, useState } from 'react'
import { Badge, List, Tag } from 'antd'
import { WarningOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { dashboardApi } from '@/services/api'

interface Alert {
  id: string
  device_id: string
  device_name: string
  metric_name: string
  metric_value: number
  cleaned_value: number
  unit: string
  time: string
  reason: string
  level: string
}

const AnomalyAlertList: React.FC = () => {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetchAlerts()
    const interval = setInterval(fetchAlerts, 30000)
    return () => clearInterval(interval)
  }, [])

  const fetchAlerts = async () => {
    setLoading(true)
    try {
      const response = await dashboardApi.getAnomalyAlerts(24, 20)
      if (response.data.success) {
        setAlerts(response.data.alerts || [])
      }
    } catch (error) {
      console.error('获取告警失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'high': return 'error'
      case 'medium': return 'warning'
      default: return 'default'
    }
  }

  return (
    <div className="chart-card" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="chart-title">
        <Badge count={alerts.length} offset={[10, 0]}>
          异常告警
        </Badge>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <List
          dataSource={alerts}
          size="small"
          loading={loading}
          renderItem={(item) => (
            <List.Item style={{ padding: '8px 0', borderBottom: '1px solid rgba(100, 150, 255, 0.1)' }}>
              <List.Item.Meta
                avatar={<WarningOutlined style={{ color: '#ef5350', fontSize: 20 }} />}
                title={
                  <div>
                    <span className="alert-device">{item.device_name}</span>
                    <Tag color={getLevelColor(item.level)} style={{ marginLeft: 8 }}>{item.level}</Tag>
                  </div>
                }
                description={
                  <div>
                    <div className="alert-metric">
                    {item.metric_name}: {item.metric_value.toFixed(2)} {item.unit}
                    </div>
                    <div style={{ color: '#666', fontSize: 11, marginTop: 2 }}>
                      {dayjs(item.time).format('MM-DD HH:mm:ss')}
                    </div>
                  </div>
                }
              />
            </List.Item>
          )}
        />
      </div>
    </div>
  )
}

export default AnomalyAlertList
