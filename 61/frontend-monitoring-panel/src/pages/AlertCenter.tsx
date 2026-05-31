import React, { useEffect, useState } from 'react'
import {
  Row,
  Col,
  Card,
  Table,
  Button,
  Select,
  Space,
  Tag,
  Badge,
  Modal,
  message,
  Statistic,
} from 'antd'
import { CheckOutlined, DeleteOutlined, BellOutlined } from '@ant-design/icons'
import { alertApi } from '../services/api'
import { AlertMessage } from '../types'
import dayjs from 'dayjs'

const AlertCenter: React.FC = () => {
  const [activeAlerts, setActiveAlerts] = useState<AlertMessage[]>([])
  const [historyAlerts, setHistoryAlerts] = useState<AlertMessage[]>([])
  const [selectedLevel, setSelectedLevel] = useState<string>('')
  const [selectedRoom, setSelectedRoom] = useState<string>('')
  const [tabKey, setTabKey] = useState<'active' | 'history'>('active')

  useEffect(() => {
    loadActiveAlerts()
    const interval = setInterval(loadActiveAlerts, 5000)
    return () => clearInterval(interval)
  }, [selectedLevel, selectedRoom])

  const loadActiveAlerts = async () => {
    try {
      const res = await alertApi.getActiveAlerts(
        selectedRoom || undefined,
        selectedLevel || undefined
      )
      setActiveAlerts(res.data.alerts)
    } catch (error) {
      console.error('Failed to load active alerts:', error)
    }
  }

  const loadHistoryAlerts = async () => {
    try {
      const res = await alertApi.getAlertHistory(200)
      setHistoryAlerts(res.data.alerts)
    } catch (error) {
      console.error('Failed to load history alerts:', error)
    }
  }

  const handleAcknowledge = async (alertId: string) => {
    try {
      await alertApi.acknowledgeAlert(alertId)
      message.success('告警已确认')
      loadActiveAlerts()
    } catch (error) {
      message.error('确认失败')
    }
  }

  const handleClearAll = () => {
    Modal.confirm({
      title: '确认清除',
      content: '确定要清除所有活动告警吗？',
      onOk: async () => {
        try {
          await alertApi.clearAlerts(selectedRoom || undefined)
          message.success('告警已清除')
          loadActiveAlerts()
        } catch (error) {
          message.error('清除失败')
        }
      },
    })
  }

  const handleTestAlert = async () => {
    try {
      await alertApi.testAlert({ level: 'warning', message: '测试告警消息' })
      message.success('测试告警已发送')
    } catch (error) {
      message.error('发送失败')
    }
  }

  const alertColumns = [
    {
      title: '级别',
      dataIndex: 'level',
      key: 'level',
      width: 100,
      render: (level: string) => {
        const colorMap: Record<string, string> = {
          emergency: 'red',
          critical: 'red',
          warning: 'orange',
          info: 'blue',
        }
        return (
          <Tag color={colorMap[level] || 'blue'}>
            {level.toUpperCase()}
          </Tag>
        )
      },
    },
    { title: '配电房', dataIndex: 'room_id', key: 'room_id', width: 120 },
    { title: '设备ID', dataIndex: 'device_id', key: 'device_id', width: 150 },
    { title: '告警类型', dataIndex: 'alert_type', key: 'alert_type', width: 150 },
    { title: '消息', dataIndex: 'message', key: 'message' },
    {
      title: '当前值/阈值',
      key: 'value',
      render: (_: any, record: AlertMessage) => (
        <span>
          {record.value} / {record.threshold}
        </span>
      ),
    },
    {
      title: '时间',
      dataIndex: 'timestamp',
      key: 'timestamp',
      width: 160,
      render: (t: string) => dayjs(t).format('MM-DD HH:mm:ss'),
    },
    {
      title: '状态',
      dataIndex: 'acknowledged',
      key: 'acknowledged',
      width: 80,
      render: (ack: boolean) =>
        ack ? <Tag color="green">已确认</Tag> : <Badge status="processing" text="未处理" />,
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_: any, record: AlertMessage) => (
        <Button
          type="link"
          icon={<CheckOutlined />}
          onClick={() => handleAcknowledge(record.alert_id)}
          disabled={record.acknowledged}
        >
          确认
        </Button>
      ),
    },
  ]

  const stats = [
    {
      title: '紧急告警',
      value: activeAlerts.filter((a) => a.level === 'emergency').length,
      color: '#ff4d4f',
    },
    {
      title: '严重告警',
      value: activeAlerts.filter((a) => a.level === 'critical').length,
      color: '#ff7a45',
    },
    {
      title: '警告',
      value: activeAlerts.filter((a) => a.level === 'warning').length,
      color: '#faad14',
    },
    {
      title: '通知',
      value: activeAlerts.filter((a) => a.level === 'info').length,
      color: '#1890ff',
    },
  ]

  return (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        {stats.map((stat, index) => (
          <Col span={6} key={index}>
            <Card>
              <Statistic
                title={stat.title}
                value={stat.value}
                valueStyle={{ color: stat.color }}
                prefix={<BellOutlined />}
              />
            </Card>
          </Col>
        ))}
      </Row>

      <Card
        tabList={[
          { key: 'active', tab: '活动告警' },
          { key: 'history', tab: '历史告警' },
        ]}
        activeTabKey={tabKey}
        onTabChange={(key) => {
          setTabKey(key as 'active' | 'history')
          if (key === 'history') loadHistoryAlerts()
        }}
        extra={
          <Space>
            <Select
              style={{ width: 150 }}
              placeholder="选择配电房"
              value={selectedRoom || undefined}
              onChange={setSelectedRoom}
              allowClear
              options={[
                { label: '1号配电房', value: 'room_001' },
                { label: '2号配电房', value: 'room_002' },
              ]}
            />
            <Select
              style={{ width: 120 }}
              placeholder="告警级别"
              value={selectedLevel || undefined}
              onChange={setSelectedLevel}
              allowClear
              options={[
                { label: '紧急', value: 'emergency' },
                { label: '严重', value: 'critical' },
                { label: '警告', value: 'warning' },
                { label: '通知', value: 'info' },
              ]}
            />
            {tabKey === 'active' && (
              <Button icon={<DeleteOutlined />} onClick={handleClearAll}>
                清除全部
              </Button>
            )}
            <Button type="primary" onClick={handleTestAlert}>
              测试告警
            </Button>
          </Space>
        }
      >
        <Table
          columns={alertColumns}
          dataSource={tabKey === 'active' ? activeAlerts : historyAlerts}
          rowKey="alert_id"
          pagination={{ pageSize: 10 }}
          size="small"
        />
      </Card>
    </div>
  )
}

export default AlertCenter
