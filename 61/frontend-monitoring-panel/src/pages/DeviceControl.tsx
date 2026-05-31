import React, { useEffect, useState } from 'react'
import {
  Row,
  Col,
  Card,
  Button,
  Select,
  Table,
  Modal,
  Form,
  InputNumber,
  Switch,
  Space,
  Tag,
  message,
  Descriptions,
} from 'antd'
import { PoweroffOutlined, PlayCircleOutlined, SettingOutlined } from '@ant-design/icons'
import { controlApi } from '../services/api'
import { DeviceState } from '../types'
import dayjs from 'dayjs'

const DeviceControl: React.FC = () => {
  const [devices, setDevices] = useState<DeviceState[]>([])
  const [selectedDevice, setSelectedDevice] = useState<string>('')
  const [autoTripEnabled, setAutoTripEnabled] = useState(true)
  const [cooldown, setCooldown] = useState(5)
  const [tripModalVisible, setTripModalVisible] = useState(false)
  const [configModalVisible, setConfigModalVisible] = useState(false)
  const [history, setHistory] = useState<any[]>([])
  const [form] = Form.useForm()
  const [configForm] = Form.useForm()

  useEffect(() => {
    loadAutoTripStatus()
  }, [])

  const loadAutoTripStatus = async () => {
    try {
      const res = await controlApi.getAutoTripStatus()
      setAutoTripEnabled(res.data.auto_trip_enabled)
      setCooldown(res.data.trip_cooldown_minutes)
    } catch (error) {
      console.error('Failed to load auto trip status:', error)
    }
  }

  const handleRoomChange = async (roomId: string) => {
    try {
      const res = await controlApi.getRoomDevices(roomId)
      setDevices(Object.values(res.data.devices))
    } catch (error) {
      console.error('Failed to load devices:', error)
    }
  }

  const handleDeviceSelect = async (deviceId: string) => {
    setSelectedDevice(deviceId)
    try {
      const res = await controlApi.getCommandHistory(deviceId)
      setHistory(res.data.history || [])
    } catch (error) {
      console.error('Failed to load history:', error)
    }
  }

  const handleTrip = async () => {
    try {
      const values = await form.validateFields()
      await controlApi.tripDevice(selectedDevice, values)
      message.success('跳闸指令已发送')
      setTripModalVisible(false)
      form.resetFields()
    } catch (error) {
      message.error('发送失败')
    }
  }

  const handleClose = async () => {
    try {
      await controlApi.closeDevice(selectedDevice)
      message.success('合闸指令已发送')
    } catch (error) {
      message.error('发送失败')
    }
  }

  const handleConfig = async () => {
    try {
      const values = await configForm.validateFields()
      await controlApi.configDevice(selectedDevice, values)
      message.success('配置已更新')
      setConfigModalVisible(false)
    } catch (error) {
      message.error('配置失败')
    }
  }

  const toggleAutoTrip = async (checked: boolean) => {
    try {
      if (checked) {
        await controlApi.enableAutoTrip()
      } else {
        await controlApi.disableAutoTrip()
      }
      setAutoTripEnabled(checked)
      message.success(`自动跳闸已${checked ? '启用' : '禁用'}`)
    } catch (error) {
      message.error('操作失败')
    }
  }

  const handleCooldownChange = async (value: number) => {
    try {
      await controlApi.setCooldown(value)
      setCooldown(value)
      message.success('冷却时间已更新')
    } catch (error) {
      message.error('设置失败')
    }
  }

  const deviceColumns = [
    { title: '设备ID', dataIndex: 'device_id', key: 'device_id' },
    {
      title: '断路器状态',
      dataIndex: 'breaker_status',
      key: 'breaker_status',
      render: (status: string) => (
        <Tag color={status === 'closed' ? 'green' : 'red'}>
          {status === 'closed' ? '合闸' : '跳闸'}
        </Tag>
      ),
    },
    { title: '跳闸次数', dataIndex: 'trip_count', key: 'trip_count' },
    {
      title: '上次跳闸',
      dataIndex: 'last_trip_time',
      key: 'last_trip_time',
      render: (t: string) => (t ? dayjs(t).format('MM-DD HH:mm:ss') : '-'),
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: DeviceState) => (
        <Space>
          <Button
            type="primary"
            danger
            size="small"
            icon={<PoweroffOutlined />}
            onClick={() => {
              setSelectedDevice(record.device_id)
              setTripModalVisible(true)
            }}
          >
            跳闸
          </Button>
          <Button
            type="primary"
            size="small"
            icon={<PlayCircleOutlined />}
            onClick={() => handleClose()}
            disabled={record.breaker_status === 'closed'}
          >
            合闸
          </Button>
        </Space>
      ),
    },
  ]

  const historyColumns = [
    {
      title: '命令类型',
      key: 'command',
      render: (_: any, record: any) => record.command?.command_type,
    },
    {
      title: '参数',
      key: 'params',
      render: (_: any, record: any) => JSON.stringify(record.command?.params || {}),
    },
    {
      title: '结果',
      key: 'result',
      render: (_: any, record: any) => (
        <Tag color={record.result?.success ? 'green' : 'red'}>
          {record.result?.success ? '成功' : '失败'}
        </Tag>
      ),
    },
    {
      title: '时间',
      dataIndex: 'timestamp',
      key: 'timestamp',
      render: (t: string) => dayjs(t).format('MM-DD HH:mm:ss'),
    },
  ]

  return (
    <div>
      <Row gutter={16}>
        <Col span={24}>
          <Card title="自动跳闸设置" style={{ marginBottom: 16 }}>
            <Space size="large">
              <Space>
                <span>启用自动跳闸:</span>
                <Switch checked={autoTripEnabled} onChange={toggleAutoTrip} />
              </Space>
              <Space>
                <span>跳闸冷却时间(分钟):</span>
                <InputNumber
                  min={1}
                  max={60}
                  value={cooldown}
                  onChange={handleCooldownChange}
                />
              </Space>
            </Space>
          </Card>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={24}>
          <Card
            title="设备列表"
            extra={
              <Select
                style={{ width: 200 }}
                placeholder="选择配电房"
                onChange={handleRoomChange}
                options={[
                  { label: '1号配电房', value: 'room_001' },
                  { label: '2号配电房', value: 'room_002' },
                ]}
              />
            }
          >
            <Table
              columns={deviceColumns}
              dataSource={devices}
              rowKey="device_id"
              pagination={false}
              onRow={(record) => ({
                onClick: () => handleDeviceSelect(record.device_id),
              })}
            />
          </Card>
        </Col>
      </Row>

      {selectedDevice && (
        <Row gutter={16} style={{ marginTop: 16 }}>
          <Col span={12}>
            <Card
              title="设备详情"
              extra={
                <Button
                  icon={<SettingOutlined />}
                  onClick={() => setConfigModalVisible(true)}
                >
                  配置
                </Button>
              }
            >
              <Descriptions column={1} size="small">
                <Descriptions.Item label="设备ID">{selectedDevice}</Descriptions.Item>
              </Descriptions>
            </Card>
          </Col>
          <Col span={12}>
            <Card title="操作历史">
              <Table
                columns={historyColumns}
                dataSource={history}
                rowKey="timestamp"
                pagination={{ pageSize: 5 }}
                size="small"
              />
            </Card>
          </Col>
        </Row>
      )}

      <Modal
        title="确认跳闸"
        open={tripModalVisible}
        onOk={handleTrip}
        onCancel={() => setTripModalVisible(false)}
        okText="确认跳闸"
        okButtonProps={{ danger: true }}
      >
        <Form form={form}>
          <Form.Item name="reason" label="跳闸原因">
            <Select
              options={[
                { label: '手动操作', value: 'manual' },
                { label: '紧急情况', value: 'emergency' },
                { label: '定期维护', value: 'maintenance' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="设备配置"
        open={configModalVisible}
        onOk={handleConfig}
        onCancel={() => setConfigModalVisible(false)}
      >
        <Form form={configForm} layout="vertical">
          <Form.Item name="rated_current" label="额定电流(A)">
            <InputNumber min={0} max={1000} />
          </Form.Item>
          <Form.Item name="rated_voltage" label="额定电压(V)">
            <InputNumber min={0} max={500} />
          </Form.Item>
          <Form.Item name="protection_enabled" label="启用保护">
            <Switch defaultChecked />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default DeviceControl
