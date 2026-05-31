import React, { useState, useEffect } from 'react'
import { FaultType, FaultEvent, SimulationResult } from '../core/FaultSimulator'

interface FaultSimulationProps {
  isOpen: boolean
  onClose: () => void
  pipelineIds: Array<{ id: string; name: string }>
  onCreateFault: (pipelineId: string, type: FaultType, severity: number) => FaultEvent
  onSimulateFault: (faultId: string) => SimulationResult | null
  onClearFault: (faultId: string) => void
  activeFaults: FaultEvent[]
}

const faultTypes: Array<{ type: FaultType; label: string; icon: string; color: string }> = [
  { type: 'leak', label: '管线泄漏', icon: '💧', color: '#3b82f6' },
  { type: 'blockage', label: '管线堵塞', icon: '🚫', color: '#f59e0b' },
  { type: 'burst', label: '管线爆裂', icon: '💥', color: '#ef4444' },
  { type: 'pressure_loss', label: '压力损失', icon: '📉', color: '#8b5cf6' },
  { type: 'contamination', label: '介质污染', icon: '☣️', color: '#10b981' }
]

export const FaultSimulation: React.FC<FaultSimulationProps> = ({
  isOpen,
  onClose,
  pipelineIds,
  onCreateFault,
  onSimulateFault,
  onClearFault,
  activeFaults
}) => {
  const [selectedPipeline, setSelectedPipeline] = useState('')
  const [selectedFaultType, setSelectedFaultType] = useState<FaultType>('leak')
  const [severity, setSeverity] = useState(50)
  const [simulationResult, setSimulationResult] = useState<SimulationResult | null>(null)

  useEffect(() => {
    if (activeFaults.length > 0) {
      const latestFault = activeFaults[activeFaults.length - 1]
      const result = onSimulateFault(latestFault.id)
      if (result) {
        setSimulationResult(result)
      }
    }
  }, [activeFaults, onSimulateFault])

  const handleCreateFault = () => {
    if (!selectedPipeline) {
      return
    }
    const fault = onCreateFault(selectedPipeline, selectedFaultType, severity / 100)
    const result = onSimulateFault(fault.id)
    if (result) {
      setSimulationResult(result)
    }
  }

  const getSeverityLabel = (severity: number) => {
    if (severity >= 0.8) return { text: '严重', color: '#ef4444' }
    if (severity >= 0.5) return { text: '中等', color: '#f59e0b' }
    return { text: '轻微', color: '#22c55e' }
  }

  const formatDuration = (ms: number) => {
    const hours = Math.floor(ms / 3600000)
    const minutes = Math.floor((ms % 3600000) / 60000)
    if (hours > 0) {
      return `${hours}小时${minutes}分钟`
    }
    return `${minutes}分钟`
  }

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('zh-CN', { 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit'
    })
  }

  if (!isOpen) {
    return null
  }

  return (
    <div className="fault-simulation-panel">
      <div className="panel-header">
        <h3>
          <span className="panel-icon">⚡</span>
          故障模拟推演
        </h3>
        <button className="close-btn" onClick={onClose}>×</button>
      </div>

      <div className="panel-content">
        <div className="section">
          <h4>创建故障</h4>
          
          <div className="form-group">
            <label>选择管线</label>
            <select 
              value={selectedPipeline}
              onChange={(e) => setSelectedPipeline(e.target.value)}
            >
              <option value="">请选择管线...</option>
              {pipelineIds.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>故障类型</label>
            <div className="fault-type-grid">
              {faultTypes.map(ft => (
                <button
                  key={ft.type}
                  className={`fault-type-btn ${selectedFaultType === ft.type ? 'active' : ''}`}
                  style={{ borderColor: selectedFaultType === ft.type ? ft.color : 'transparent' }}
                  onClick={() => setSelectedFaultType(ft.type)}
                >
                  <span className="fault-icon">{ft.icon}</span>
                  <span>{ft.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label>
              严重程度: {severity}% 
              <span className="severity-badge" style={{ 
                backgroundColor: severity >= 80 ? '#ef4444' : severity >= 50 ? '#f59e0b' : '#22c55e' 
              }}>
                {severity >= 80 ? '严重' : severity >= 50 ? '中等' : '轻微'}
              </span>
            </label>
            <input
              type="range"
              min="10"
              max="100"
              value={severity}
              onChange={(e) => setSeverity(Number(e.target.value))}
              className="severity-slider"
            />
          </div>

          <button 
            className="btn-primary btn-full"
            onClick={handleCreateFault}
            disabled={!selectedPipeline}
          >
            🔧 创建并模拟故障
          </button>
        </div>

        {activeFaults.length > 0 && (
          <div className="section">
            <h4>当前故障 ({activeFaults.length})</h4>
            <div className="fault-list">
              {activeFaults.map(fault => {
                const severityInfo = getSeverityLabel(fault.severity)
                const faultTypeInfo = faultTypes.find(ft => ft.type === fault.type)
                return (
                  <div key={fault.id} className="fault-item">
                    <div className="fault-item-header">
                      <span 
                        className="fault-type-badge" 
                        style={{ backgroundColor: faultTypeInfo?.color || '#666' }}
                      >
                        {faultTypeInfo?.icon} {faultTypeInfo?.label}
                      </span>
                      <span 
                        className="severity-indicator"
                        style={{ backgroundColor: severityInfo.color }}
                      >
                        {severityInfo.text}
                      </span>
                    </div>
                    <div className="fault-item-info">
                      <p>{fault.description}</p>
                      <p className="fault-meta">
                        影响范围: {fault.affectedArea.toFixed(0)}㎡ | 
                        预计修复: {formatDuration(fault.duration)}
                      </p>
                    </div>
                    <button 
                      className="btn-clear-fault"
                      onClick={() => onClearFault(fault.id)}
                    >
                      清除故障
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {simulationResult && (
          <div className="section">
            <h4>模拟推演结果</h4>
            
            <div className="simulation-result">
              <div className="result-card">
                <h5>影响分析</h5>
                <div className="result-stats">
                  <div className="stat-item">
                    <span className="stat-value">{simulationResult.consequences.affectedPipelines.length}</span>
                    <span className="stat-label">受影响管线</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-value">{simulationResult.consequences.affectedDevices.length}</span>
                    <span className="stat-label">受影响设备</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-value">{simulationResult.consequences.affectedArea.toFixed(0)}</span>
                    <span className="stat-label">影响面积(㎡)</span>
                  </div>
                </div>
              </div>

              {simulationResult.consequences.isolationPoint && (
                <div className="result-card warning">
                  <h5>⚠️ 隔离点建议</h5>
                  <p>建议关闭阀门: <strong>{simulationResult.consequences.isolationPoint}</strong></p>
                </div>
              )}

              <div className="result-card">
                <h5>事件时间线</h5>
                <div className="timeline">
                  {simulationResult.timeline.map((event, index) => (
                    <div key={index} className="timeline-item">
                      <div className="timeline-dot"></div>
                      <div className="timeline-content">
                        <span className="timeline-time">{formatTime(event.time)}</span>
                        <p>{event.event}</p>
                        {event.affectedPipelines && event.affectedPipelines.length > 0 && (
                          <div className="timeline-detail">
                            受影响管线: {event.affectedPipelines.slice(0, 3).join(', ')}
                            {event.affectedPipelines.length > 3 && ` 等${event.affectedPipelines.length}条`}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="result-card">
                <h5>推荐措施</h5>
                <ul className="recommendations">
                  {simulationResult.recommendedActions.map((action, index) => (
                    <li key={index}>
                      <span className="action-index">{index + 1}</span>
                      {action}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
