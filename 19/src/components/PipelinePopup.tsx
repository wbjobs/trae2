import React from 'react'
import { Pipeline, Device } from '../types'

interface PipelinePopupProps {
  pipeline: Pipeline
  realtimeData?: Record<string, any>
  onClose: () => void
  onFocus?: () => void
  startDevice?: Device | null
  endDevice?: Device | null
}

const statusMap: Record<string, { label: string; color: string }> = {
  normal: { label: '正常', color: '#22c55e' },
  warning: { label: '警告', color: '#f59e0b' },
  alarm: { label: '报警', color: '#ef4444' }
}

const typeMap: Record<string, { label: string; color: string }> = {
  water: { label: '水管', color: '#3b82f6' },
  gas: { label: '气管', color: '#f59e0b' },
  oil: { label: '油管', color: '#1f2937' },
  steam: { label: '蒸汽管', color: '#e5e7eb' },
  electric: { label: '电力管', color: '#fbbf24' }
}

export const PipelinePopup: React.FC<PipelinePopupProps> = ({
  pipeline,
  realtimeData,
  onClose,
  onFocus,
  startDevice,
  endDevice
}) => {
  const status = statusMap[pipeline.status] || { label: '未知', color: '#9ca3af' }
  const type = typeMap[pipeline.type] || { label: pipeline.type, color: '#6b7280' }

  const length = calculateLength(pipeline)

  return (
    <div className="device-popup">
      <div className="device-popup-header">
        <div className="device-popup-title">
          <span className="pipeline-icon" style={{ backgroundColor: type.color }}></span>
          <div>
            <h3>{pipeline.name}</h3>
            <span className="device-type">{type.label} · 直径 {pipeline.diameter}m</span>
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
            <span className="info-label">管线ID</span>
            <span className="info-value">{pipeline.id}</span>
          </div>
          <div className="info-row">
            <span className="info-label">长度</span>
            <span className="info-value">{length.toFixed(2)} m</span>
          </div>
          <div className="info-row">
            <span className="info-label">直径</span>
            <span className="info-value">{pipeline.diameter} m</span>
          </div>
        </div>

        <div className="path-section">
          <h4>路径信息</h4>
          <div className="path-points">
            <div className="path-point">
              <span className="point-marker start"></span>
              <div className="point-info">
                <span className="point-label">起点</span>
                <span className="point-coords">
                  ({pipeline.startPoint.x.toFixed(1)}, {pipeline.startPoint.y.toFixed(1)}, {pipeline.startPoint.z.toFixed(1)})
                </span>
                {startDevice && (
                  <span className="point-device">连接: {startDevice.name}</span>
                )}
              </div>
            </div>
            <div className="path-line"></div>
            <div className="path-point">
              <span className="point-marker end"></span>
              <div className="point-info">
                <span className="point-label">终点</span>
                <span className="point-coords">
                  ({pipeline.endPoint.x.toFixed(1)}, {pipeline.endPoint.y.toFixed(1)}, {pipeline.endPoint.z.toFixed(1)})
                </span>
                {endDevice && (
                  <span className="point-device">连接: {endDevice.name}</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {(pipeline.flowRate !== undefined || pipeline.pressure !== undefined || pipeline.temperature !== undefined) && (
          <div className="params-section">
            <h4>运行参数</h4>
            <div className="params-grid">
              {pipeline.flowRate !== undefined && (
                <div className="param-item">
                  <span className="param-label">流量</span>
                  <span className="param-value">{pipeline.flowRate.toFixed(2)} m³/h</span>
                </div>
              )}
              {pipeline.pressure !== undefined && (
                <div className="param-item">
                  <span className="param-label">压力</span>
                  <span className="param-value">{pipeline.pressure.toFixed(2)} MPa</span>
                </div>
              )}
              {pipeline.temperature !== undefined && (
                <div className="param-item">
                  <span className="param-label">温度</span>
                  <span className="param-value">{pipeline.temperature.toFixed(2)} °C</span>
                </div>
              )}
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
                    {getParamUnit(key)}
                  </span>
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

function calculateLength(pipeline: Pipeline): number {
  const dx = pipeline.endPoint.x - pipeline.startPoint.x
  const dy = pipeline.endPoint.y - pipeline.startPoint.y
  const dz = pipeline.endPoint.z - pipeline.startPoint.z
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

function formatParamName(key: string): string {
  const names: Record<string, string> = {
    flowRate: '流量',
    pressure: '压力',
    temperature: '温度',
    status: '状态'
  }
  return names[key] || key
}

function getParamUnit(key: string): string {
  const units: Record<string, string> = {
    flowRate: ' m³/h',
    pressure: ' MPa',
    temperature: ' °C'
  }
  return units[key] || ''
}
