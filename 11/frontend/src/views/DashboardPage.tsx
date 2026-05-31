import React from 'react'
import { Row, Col, Card, Statistic, Space, Tag, Progress } from 'antd'
import {
  CheckCircleOutlined,
  WarningOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined
} from '@ant-design/icons'
import { LowCodeProvider, useLowCode } from '../components/lowcode/LowCodeContext'
import { ComponentPallete } from '../components/lowcode/ComponentPallete'
import { ComponentRenderer } from '../components/lowcode/ComponentRenderer'
import { useAppStore } from '../store'
import dayjs from 'dayjs'

const StatCards: React.FC = () => {
  const { stats } = useAppStore()

  return (
    <Row gutter={16} style={{ marginBottom: 16 }}>
      <Col span={6}>
        <Card>
          <Statistic
            title="今日日志总数"
            value={Object.values(stats).reduce((a, b) => a + b, 0)}
            prefix={<ClockCircleOutlined />}
            suffix={
              <Tag color="green" style={{ marginLeft: 8 }}>
                <ArrowUpOutlined /> 12%
              </Tag>
            }
          />
        </Card>
      </Col>
      <Col span={6}>
        <Card>
          <Statistic
            title="正常日志"
            value={stats.INFO || 0}
            valueStyle={{ color: '#3f8600' }}
            prefix={<CheckCircleOutlined />}
          />
        </Card>
      </Col>
      <Col span={6}>
        <Card>
          <Statistic
            title="警告日志"
            value={stats.WARN || 0}
            valueStyle={{ color: '#faad14' }}
            prefix={<WarningOutlined />}
          />
        </Card>
      </Col>
      <Col span={6}>
        <Card>
          <Statistic
            title="错误日志"
            value={(stats.ERROR || 0) + (stats.FATAL || 0)}
            valueStyle={{ color: '#cf1322' }}
            prefix={<CloseCircleOutlined />}
          />
        </Card>
      </Col>
    </Row>
  )
}

const DashboardCanvas: React.FC = () => {
  const { components, selectComponent } = useLowCode()

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: 600,
        border: '1px dashed #d9d9d9',
        borderRadius: 8,
        background: '#fafafa',
        overflow: 'hidden'
      }}
      onClick={() => selectComponent(null)}
    >
      {components.length === 0 ? (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            textAlign: 'center',
            color: '#999'
          }}
        >
          <p style={{ fontSize: 16 }}>点击上方组件按钮添加可视化组件</p>
          <p style={{ fontSize: 12 }}>支持拖拽、缩放、自定义布局</p>
        </div>
      ) : (
        components.map((comp) => (
          <ComponentRenderer key={comp.id} component={comp} />
        ))
      )}
    </div>
  )
}

const DashboardPage: React.FC = () => {
  return (
    <LowCodeProvider>
      <StatCards />
      <ComponentPallete onAddComponent={() => {}} />
      <DashboardCanvas />
    </LowCodeProvider>
  )
}

export default DashboardPage