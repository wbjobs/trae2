import React, { useState, useEffect } from 'react'
import { RoamingState } from '../core/PathRoaming'

interface PathRoamingPanelProps {
  isOpen: boolean
  onClose: () => void
  availablePaths: Array<{ id: string; name: string }>
  currentState: RoamingState | null
  currentPathName: string | null
  onStartRoaming: (pathId: string, loop: boolean) => boolean
  onStopRoaming: () => void
  onPauseRoaming: () => void
  onResumeRoaming: () => void
  onSetSpeed: (speed: number) => void
}

export const PathRoamingPanel: React.FC<PathRoamingPanelProps> = ({
  isOpen,
  onClose,
  availablePaths,
  currentState,
  currentPathName,
  onStartRoaming,
  onStopRoaming,
  onPauseRoaming,
  onResumeRoaming,
  onSetSpeed
}) => {
  const [selectedPath, setSelectedPath] = useState('')
  const [loopMode, setLoopMode] = useState(false)
  const [speed, setSpeed] = useState(1)

  useEffect(() => {
    if (currentState) {
      setSpeed(currentState.speed)
    }
  }, [currentState?.speed])

  const handleStart = () => {
    if (!selectedPath) {
      return
    }
    onStartRoaming(selectedPath, loopMode)
  }

  const handleSpeedChange = (newSpeed: number) => {
    setSpeed(newSpeed)
    onSetSpeed(newSpeed)
  }

  const getStatusText = () => {
    if (!currentState) return '空闲'
    if (currentState.isPaused) return '已暂停'
    return '播放中'
  }

  const getStatusColor = () => {
    if (!currentState) return '#6b7280'
    if (currentState.isPaused) return '#f59e0b'
    return '#22c55e'
  }

  if (!isOpen) {
    return null
  }

  return (
    <div className="path-roaming-panel">
      <div className="panel-header">
        <h3>
          <span className="panel-icon">🚀</span>
          路径漫游
        </h3>
        <button className="close-btn" onClick={onClose}>×</button>
      </div>

      <div className="panel-content">
        {currentState && (
          <div className="roaming-status">
            <div className="status-row">
              <span 
                className="status-indicator"
                style={{ backgroundColor: getStatusColor() }}
              ></span>
              <span className="status-text">{getStatusText()}</span>
            </div>
            {currentPathName && (
              <div className="current-path">
                当前路径: <strong>{currentPathName}</strong>
              </div>
            )}
            <div className="roaming-progress">
              <div className="progress-bar">
                <div 
                  className="progress-fill"
                  style={{ width: `${currentState.progress * 100}%` }}
                ></div>
              </div>
              <span className="progress-text">
                航点 {currentState.currentWaypointIndex + 1}
              </span>
            </div>
          </div>
        )}

        {!currentState && (
          <>
            <div className="section">
              <h4>选择漫游路径</h4>
              <div className="path-list">
                {availablePaths.map(path => (
                  <button
                    key={path.id}
                    className={`path-item ${selectedPath === path.id ? 'active' : ''}`}
                    onClick={() => setSelectedPath(path.id)}
                  >
                    <span className="path-icon">🛣️</span>
                    <span className="path-name">{path.name}</span>
                    {selectedPath === path.id && <span className="path-selected">✓</span>}
                  </button>
                ))}
              </div>
            </div>

            <div className="section">
              <h4>播放设置</h4>
              
              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    checked={loopMode}
                    onChange={(e) => setLoopMode(e.target.checked)}
                  />
                  循环播放
                </label>
              </div>

              <div className="form-group">
                <label>播放速度: {speed.toFixed(2)}x</label>
                <div className="speed-controls">
                  <button 
                    className="speed-btn"
                    onClick={() => handleSpeedChange(Math.max(0.25, speed - 0.25))}
                  >
                    -
                  </button>
                  <input
                    type="range"
                    min="0.25"
                    max="4"
                    step="0.25"
                    value={speed}
                    onChange={(e) => handleSpeedChange(Number(e.target.value))}
                    className="speed-slider"
                  />
                  <button 
                    className="speed-btn"
                    onClick={() => handleSpeedChange(Math.min(4, speed + 0.25))}
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            <button 
              className="btn-primary btn-full start-btn"
              onClick={handleStart}
              disabled={!selectedPath}
            >
              ▶ 开始漫游
            </button>
          </>
        )}

        {currentState && (
          <div className="playback-controls">
            {currentState.isPaused ? (
              <button className="btn-playback" onClick={onResumeRoaming}>
                ▶ 继续
              </button>
            ) : (
              <button className="btn-playback" onClick={onPauseRoaming}>
                ⏸ 暂停
              </button>
            )}
            <button className="btn-playback stop" onClick={onStopRoaming}>
              ⏹ 停止
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
