import React, { useEffect, useState } from 'react'
import { Select, Spin, Empty, Modal, Button, message } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { useDashboardStore } from '@/store/dashboardStore'
import { useLayoutStore, LayoutWidget } from '@/store/layoutStore'
import { dashboardApi } from '@/services/api'

import StatsCard from '@/components/StatsCard'
import MetricTrendChart from '@/components/MetricTrendChart'
import DeviceStatusList from '@/components/DeviceStatusList'
import AnomalyAlertList from '@/components/AnomalyAlertList'
import DeviceComparisonChart from '@/components/DeviceComparisonChart'
import RealtimeDataPanel from '@/components/RealtimeDataPanel'
import DraggableGrid from '@/components/DraggableGrid'
import LayoutToolbar from '@/components/LayoutToolbar'

const Dashboard: React.FC = () => {
  const {
    selectedDevice,
    selectedMetric,
    timeRange,
    devices,
    overview,
    setSelectedDevice,
    setSelectedMetric,
    setTimeRange,
    setDevices,
    setOverview
  } = useDashboardStore()

  const {
    layoutConfig,
    isEditMode,
    selectedWidgetId,
    updateWidgetPosition,
    setSelectedWidget,
    addWidget
  } = useLayoutStore()

  const [loading, setPageLoading] = useState(false)
  const [addWidgetModalVisible, setAddWidgetModalVisible] = useState(false)
  const userId = 'user-001'

  const metrics = [
    { value: 'temperature', label: '温度' },
    { value: 'vibration', label: '振动' },
    { value: 'pressure', label: '压力' },
    { value: 'current', label: '电流' },
    { value: 'power', label: '功率' },
    { value: 'rpm', label: '转速' },
    { value: 'flow_rate', label: '流量' },
    { value: 'air_flow', label: '风量' }
  ]

  const timeRanges = [
    { value: 1, label: '1小时' },
    { value: 6, label: '6小时' },
    { value: 12, label: '12小时' },
    { value: 24, label: '24小时' },
    { value: 168, label: '7天' }
  ]

  useEffect(() => {
    fetchDashboardData()
    const interval = setInterval(fetchDashboardData, 60000)
    return () => clearInterval(interval)
  }, [timeRange])

  const fetchDashboardData = async () => {
    setPageLoading(true)
    try {
      const [overviewRes, devicesRes] = await Promise.all([
        dashboardApi.getOverview(timeRange),
        dashboardApi.getDeviceStatus(timeRange)
      ])

      if (overviewRes.data.success) {
        setOverview(overviewRes.data.overview)
      }
      if (devicesRes.data.success) {
        setDevices(devicesRes.data.devices || [])
      }
    } catch (error) {
      console.error('获取仪表盘数据失败:', error)
    } finally {
      setPageLoading(false)
    }
  }

  const handleDeviceSelect = (deviceId: string) => {
    setSelectedDevice(deviceId === selectedDevice ? null : deviceId)
  }

  const renderWidget = (widget: LayoutWidget) => {
    const commonProps = {
      style: { height: '100%', padding: 0 }
    }

    switch (widget.type) {
      case 'StatsCard':
        return overview ? (
          <div className="chart-card" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div className="chart-title">统计概览</div>
            <div style={{ flex: 1, overflow: 'auto' }}>
              <StatsCard overview={overview} />
            </div>
          </div>
        ) : <Empty description="暂无数据" />

      case 'MetricTrendChart':
        return (
          <div className="chart-card" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div className="chart-title">
              {widget.props?.metricName === 'temperature' ? '温度' : 
               widget.props?.metricName === 'vibration' ? '振动' : 
               widget.props?.metricName === 'pressure' ? '压力' : 
               widget.props?.metricName === 'current' ? '电流' : 
               widget.props?.metricName === 'power' ? '功率' : 
               widget.props?.metricName === 'rpm' ? '转速' : 
               widget.props?.metricName === 'flow_rate' ? '流量' : '风量'}指标趋势
            </div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <MetricTrendChart
                deviceId={selectedDevice || devices[0]?.device_id || 'DEV001'}
                metricName={widget.props?.metricName || selectedMetric || 'temperature'}
              />
            </div>
          </div>
        )

      case 'AnomalyAlertList':
        return <AnomalyAlertList />

      case 'DeviceStatusList':
        return (
          <div className="chart-card" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div className="chart-title">设备状态列表</div>
            <div style={{ flex: 1, overflow: 'auto' }}>
              <DeviceStatusList
                devices={devices}
                onDeviceSelect={handleDeviceSelect}
                selectedDevice={selectedDevice}
              />
            </div>
          </div>
        )

      case 'DeviceComparisonChart':
        return (
          <div className="chart-card" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div className="chart-title">设备对比分析</div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <DeviceComparisonChart />
            </div>
          </div>
        )

      case 'RealtimeDataPanel':
        return <RealtimeDataPanel />

      default:
        return (
          <div className="chart-card" style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Empty description={`未知组件类型: ${widget.type}`} />
          </div>
        )
    }
  }

  const handleAddWidget = () => {
    setAddWidgetModalVisible(true)
  }

  const handleAddWidgetType = (type: string, name: string) => {
    const widgets = layoutConfig?.widgets || []
    const maxY = widgets.length > 0 ? Math.max(...widgets.map(w => w.y + w.h)) : 0
    
    const newWidget: LayoutWidget = {
      id: `${type.toLowerCase()}-${Date.now()}`,
      type,
      title: name,
      x: 0,
      y: maxY,
      w: 12,
      h: 5,
      minW: 6,
      minH: 3,
      props: type === 'MetricTrendChart' ? { metricName: selectedMetric || 'temperature' } : {}
    }

    addWidget(newWidget)
    setAddWidgetModalVisible(false)
    message.success(`已添加组件: ${name}`)
  }

  const availableWidgets = [
    { type: 'StatsCard', name: '统计卡片', desc: '展示核心指标概览' },
    { type: 'MetricTrendChart', name: '指标趋势图', desc: '展示指标随时间变化趋势' },
    { type: 'DeviceComparisonChart', name: '设备对比图', desc: '多设备指标横向对比' },
    { type: 'DeviceStatusList', name: '设备状态列表', desc: '设备运行状态一览' },
    { type: 'AnomalyAlertList', name: '异常告警列表', desc: '实时异常告警信息' },
    { type: 'RealtimeDataPanel', name: '实时监控面板', desc: '关键指标实时监控' }
  ]

  return (
    <div className="dashboard-layout">
      <header className="dashboard-header">
        <div className="dashboard-title">设备运维指标分析平台</div>
        <div style={{ display: 'flex', gap: 12 }}>
          <Select
            value={timeRange}
            onChange={setTimeRange}
            style={{ width: 120 }}
            options={timeRanges}
          />
          <Select
            value={selectedMetric || 'temperature'}
            onChange={setSelectedMetric}
            style={{ width: 120 }}
            options={metrics}
            placeholder="选择指标"
          />
        </div>
      </header>

      <LayoutToolbar userId={userId} onAddWidget={handleAddWidget} />

      <main className="dashboard-content" style={{ padding: isEditMode ? '48px 16px 16px' : '16px' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
            <Spin size="large" tip="加载中..." />
          </div>
        ) : overview && layoutConfig ? (
          <DraggableGrid
            widgets={layoutConfig.widgets}
            gridConfig={layoutConfig.grid}
            isEditMode={isEditMode}
            selectedWidgetId={selectedWidgetId}
            onWidgetMove={updateWidgetPosition}
            onWidgetSelect={setSelectedWidget}
          >
            {renderWidget}
          </DraggableGrid>
        ) : (
          <Empty description="暂无数据" />
        )}
      </main>

      <Modal
        title="添加组件"
        open={addWidgetModalVisible}
        onCancel={() => setAddWidgetModalVisible(false)}
        footer={null}
        width={800}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {availableWidgets.map((widget) => (
            <div
              key={widget.type}
              onClick={() => handleAddWidgetType(widget.type, widget.name)}
              style={{
                padding: 16,
                border: '1px solid #e0e0e0',
                borderRadius: 8,
                cursor: 'pointer',
                transition: 'all 0.2s',
                background: '#0a1929'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#4fc3f7'
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(79, 195, 247, 0.3)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#e0e0e0'
                e.currentTarget.style.boxShadow = 'none'
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 8, color: '#fff' }}>
                {widget.name}
              </div>
              <div style={{ fontSize: 12, color: '#90a4ae' }}>
                {widget.desc}
              </div>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  )
}

export default Dashboard
