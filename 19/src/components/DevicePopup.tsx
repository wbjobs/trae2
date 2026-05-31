import React from 'react'
import { Device, Pipeline } from '../types'

interface DevicePopupProps {
  device: Device
  realtimeData?: Record<string, any>
  onClose: () => void
  onFocus?: () => void
  connectedDevices?: Device[]
  connectedPipelines?: Pipeline[]
}

const statusMap: Record<string, { label: string; color: string }> = {
  running: { label: '运行中', color: '#22c55e' },
  stopped: { label: '已停止', color: '#6b7280' },
  maintenance: { label: '维护中', color: '#f59e0b' },
  fault: { label: '故障', color: '#ef4444' }
}

const typeMap: Record<string, string> = {
  pump: '泵',
  valve: '阀门',
  tank: '储罐',
  sensor: '传感器',
  heatExchanger: '换热器'
}

export const DevicePopup: React.FC<DevicePopupProps> = ({
  device,
  realtimeData,
  onClose,
  onFocus,
  connectedDevices = [],
  connectedPipelines = []
}) => {
  const status = statusMap[device.status] || { label: '未知', color: '#9ca3af' }

  return (
    <div className="device-popup">
      <div className="device-popup-header">
        <div className="device-popup-title">
          <span className="device-icon">{getDeviceIcon(device.type)}</span>
          <div>
            <h3>{device.name}</h3>
            <span className="device-type">{typeMap[device.type] || device.type}</span>
          </div>
        </div>
        <button className="close-btn" onClick={onClose}>×</button>
      </div>

      <div className="device-popup-body">
        <div className="info-section">
          <div className="info-row">
            <span className="info-label">状态</span>
            <span className="info-value" style={{ color: status.color }}>
              <span className="status-dot" style={{ backgroundColor: status.color }}></span>
              {status.label}
            </span>
          </div>
          <div className="info-row">
            <span className="info-label">设备ID</span>
            <span className="info-value">{device.id}</span>
          </div>
          <div className="info-row">
            <span className="info-label">位置</span>
            <span className="info-value">
              X: {device.position.x.toFixed(1)}, Y: {device.position.y.toFixed(1)}, Z: {device.position.z.toFixed(1)}
            </span>
          </div>
        </div>

        {Object.keys(device.parameters).length > 0 && (
          <div className="params-section">
            <h4>运行参数</h4>
            <div className="params-grid">
              {Object.entries(device.parameters).map(([key, value]) => (
                <div key={key} className="param-item">
                  <span className="param-label">{formatParamName(key)}</span>
                  <span className="param-value">
                    {typeof value === 'number' ? value.toFixed(2) : String(value)}
                    {getParamUnit(key)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {realtimeData && Object.keys(realtimeData).length > 0 && (
          <div className="realtime-section">
            <h4>实时数据</h4>
            <div className="params-grid">
              {Object.entries(realtimeData).map(([key, value]) => (
                <div key={key} className="param-item realtime">
                  <span className="param-label">{formatParamName(key)}</span>
                  <span className="param-value">
                    {typeof value === 'number' ? value.toFixed(2) : String(value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {connectedPipelines.length > 0 && (
          <div className="connections-section">
            <h4>连接管线 ({connectedPipelines.length})</h4>
            <div className="connection-list">
              {connectedPipelines.map(pipe => (
                <div key={pipe.id} className="connection-item pipeline">
                  <span className="connection-icon">━</span>
                  <span className="connection-name">{pipe.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {connectedDevices.length > 0 && (
          <div className="connections-section">
            <h4>关联设备 ({connectedDevices.length})</h4>
            <div className="connection-list">
              {connectedDevices.map(dev => (
                <div key={dev.id} className="connection-item device">
                  <span className="connection-icon">{getDeviceIcon(dev.type)}</span>
                  <span className="connection-name">{dev.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="device-popup-footer">
        <button className="btn btn-secondary" onClick={onClose}>关闭</button>
        <button className="btn btn-primary" onClick={onFocus}>定位查看</button>
      </div>
    </div>
  )
}

function getDeviceIcon(type: string): string {
  const icons: Record<string, string> = {
    pump: '⚙️',
    valve: '🔧',
    tank: '🛢️',
    sensor: '📡',
    heatExchanger: '🔥'
  }
  return icons[type] || '📦'
}

function formatParamName(key: string): string {
  const names: Record<string, string> = {
    flowRate: '流量',
    pressure: '压力',
    power: '功率',
    temperature: '温度',
    currentLevel: '当前液位',
    capacity: '容量',
    openPercent: '开度',
    pressureIn: '入口压力',
    pressureOut: '出口压力',
    tempIn: '入口温度',
    tempOut: '出口温度',
    efficiency: '效率',
    unit: '单位'
  }
  return names[key] || key
}

function getParamUnit(key: string): string {
  const units: Record<string, string> = {
    flowRate: ' m³/h',
    pressure: ' MPa',
    power: ' kW',
    temperature: ' °C',
    currentLevel: ' m³',
    capacity: ' m³',
    openPercent: ' %',
    tempIn: ' °C',
    tempOut: ' °C',
    efficiency: ''
  }
  return units[key] || ''
}
