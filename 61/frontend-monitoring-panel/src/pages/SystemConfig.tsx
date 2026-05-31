import React, { useEffect, useState } from 'react'
import {
  Row,
  Col,
  Card,
  Form,
  Input,
  InputNumber,
  Switch,
  Button,
  Tabs,
  message,
  Space,
  Tag,
  List,
  Divider,
} from 'antd'
import { SaveOutlined, ReloadOutlined, PlusOutlined } from '@ant-design/icons'
import { analysisApi, controlApi, alertApi } from '../services/api'

const SystemConfig: React.FC = () => {
  const [thresholdForm] = Form.useForm()
  const [controlForm] = Form.useForm()
  const [alertForm] = Form.useForm()
  const [channels, setChannels] = useState<string[]>([])

  useEffect(() => {
    loadConfig()
  }, [])

  const loadConfig = async () => {
    try {
      const [thresholdRes, controlRes, alertRes] = await Promise.all([
        analysisApi.getThresholds(),
        controlApi.getAutoTripStatus(),
        alertApi.getChannels(),
      ])

      thresholdForm.setFieldsValue(thresholdRes.data.thresholds)
      controlForm.setFieldsValue({
        auto_trip_enabled: controlRes.data.auto_trip_enabled,
        cooldown_minutes: controlRes.data.trip_cooldown_minutes,
      })
      setChannels(alertRes.data.channels)
    } catch (error) {
      console.error('Failed to load config:', error)
    }
  }

  const handleThresholdSave = async () => {
    try {
      const values = await thresholdForm.validateFields()
      message.success('阈值配置已保存')
    } catch (error) {
      message.error('保存失败')
    }
  }

  const handleControlSave = async () => {
    try {
      const values = await controlForm.validateFields()
      if (values.auto_trip_enabled) {
        await controlApi.enableAutoTrip()
      } else {
        await controlApi.disableAutoTrip()
      }
      await controlApi.setCooldown(values.cooldown_minutes)
      message.success('控制配置已保存')
    } catch (error) {
      message.error('保存失败')
    }
  }

  const handleAlertSave = async () => {
    try {
      await alertForm.validateFields()
      message.success('告警配置已保存')
    } catch (error) {
      message.error('保存失败')
    }
  }

  const tabItems = [
    {
      key: 'threshold',
      label: '阈值配置',
      children: (
        <Form form={thresholdForm} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Card title="温度" size="small">
                <Form.Item name={['temperature', 'warning']} label="警告阈值(°C)">
                  <InputNumber min={0} max={100} style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item name={['temperature', 'critical']} label="严重阈值(°C)">
                  <InputNumber min={0} max={100} style={{ width: '100%' }} />
                </Form.Item>
              </Card>
            </Col>
            <Col span={12}>
              <Card title="湿度" size="small">
                <Form.Item name={['humidity', 'warning']} label="警告阈值(%)">
                  <InputNumber min={0} max={100} style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item name={['humidity', 'critical']} label="严重阈值(%)">
                  <InputNumber min={0} max={100} style={{ width: '100%' }} />
                </Form.Item>
              </Card>
            </Col>
          </Row>
          <Row gutter={16} style={{ marginTop: 16 }}>
            <Col span={12}>
              <Card title="电流" size="small">
                <Form.Item name={['current', 'warning']} label="警告阈值(A)">
                  <InputNumber min={0} max={200} style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item name={['current', 'critical']} label="严重阈值(A)">
                  <InputNumber min={0} max={200} style={{ width: '100%' }} />
                </Form.Item>
              </Card>
            </Col>
            <Col span={12}>
              <Card title="电压" size="small">
                <Form.Item name={['voltage', 'warning_min']} label="警告下限(V)">
                  <InputNumber min={0} max={400} style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item name={['voltage', 'warning_max']} label="警告上限(V)">
                  <InputNumber min={0} max={400} style={{ width: '100%' }} />
                </Form.Item>
              </Card>
            </Col>
          </Row>
          <Row gutter={16} style={{ marginTop: 16 }}>
            <Col span={12}>
              <Card title="电弧" size="small">
                <Form.Item name={['arc', 'warning']} label="警告阈值(次/10分钟)">
                  <InputNumber min={0} max={10} style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item name={['arc', 'critical']} label="严重阈值(次/10分钟)">
                  <InputNumber min={0} max={10} style={{ width: '100%' }} />
                </Form.Item>
              </Card>
            </Col>
            <Col span={12}>
              <Card title="烟雾" size="small">
                <Form.Item name={['smoke', 'warning']} label="警告阈值(ppm)">
                  <InputNumber min={0} max={500} style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item name={['smoke', 'critical']} label="严重阈值(ppm)">
                  <InputNumber min={0} max={500} style={{ width: '100%' }} />
                </Form.Item>
              </Card>
            </Col>
          </Row>
          <div style={{ marginTop: 16, textAlign: 'right' }}>
            <Space>
              <Button icon={<ReloadOutlined />} onClick={loadConfig}>
                重置
              </Button>
              <Button type="primary" icon={<SaveOutlined />} onClick={handleThresholdSave}>
                保存配置
              </Button>
            </Space>
          </div>
        </Form>
      ),
    },
    {
      key: 'control',
      label: '控制设置',
      children: (
        <Form form={controlForm} layout="vertical">
          <Card title="自动跳闸设置">
            <Form.Item name="auto_trip_enabled" label="启用自动跳闸" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="cooldown_minutes" label="跳闸冷却时间(分钟)">
              <InputNumber min={1} max={60} />
            </Form.Item>
            <div style={{ color: '#666', fontSize: 12 }}>
              冷却时间内同一设备不会重复触发自动跳闸
            </div>
          </Card>
          <div style={{ marginTop: 16, textAlign: 'right' }}>
            <Space>
              <Button icon={<ReloadOutlined />} onClick={loadConfig}>
                重置
              </Button>
              <Button type="primary" icon={<SaveOutlined />} onClick={handleControlSave}>
                保存配置
              </Button>
            </Space>
          </div>
        </Form>
      ),
    },
    {
      key: 'alert',
      label: '告警通道',
      children: (
        <div>
          <Card title="已启用通道">
            <List
              dataSource={channels}
              renderItem={(item) => (
                <List.Item
                  actions={[
                    <Button type="link" size="small">
                      配置
                    </Button>,
                    <Button type="link" size="small" danger>
                      禁用
                    </Button>,
                  ]}
                >
                  <List.Item.Meta
                    title={
                      <Space>
                        {item === 'console'
                          ? '控制台'
                          : item === 'email'
                          ? '邮件'
                          : item === 'sms'
                          ? '短信'
                          : item === 'webhook'
                          ? 'Webhook'
                          : item}
                        <Tag color="green">已启用</Tag>
                      </Space>
                    }
                  />
                </List.Item>
              )}
            />
          </Card>
          <Divider />
          <Card
            title="邮件配置"
            extra={
              <Button icon={<PlusOutlined />} type="dashed">
                添加收件人
              </Button>
            }
          >
            <Form form={alertForm} layout="vertical">
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="smtp_server" label="SMTP服务器">
                    <Input placeholder="smtp.example.com" />
                  </Form.Item>
                </Col>
                <Col span={6}>
                  <Form.Item name="smtp_port" label="端口">
                    <InputNumber style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={6}>
                  <Form.Item name="use_ssl" label="使用SSL" valuePropName="checked">
                    <Switch />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="username" label="用户名">
                    <Input />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="password" label="密码">
                    <Input.Password />
                  </Form.Item>
                </Col>
              </Row>
            </Form>
          </Card>
          <div style={{ marginTop: 16, textAlign: 'right' }}>
            <Space>
              <Button icon={<ReloadOutlined />} onClick={loadConfig}>
                重置
              </Button>
              <Button type="primary" icon={<SaveOutlined />} onClick={handleAlertSave}>
                保存配置
              </Button>
            </Space>
          </div>
        </div>
      ),
    },
  ]

  return (
    <div>
      <Tabs items={tabItems} />
    </div>
  )
}

export default SystemConfig
