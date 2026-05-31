import React from 'react'
import { InteractionMode } from '../core/InteractionController'

interface ToolbarProps {
  currentMode: InteractionMode
  onModeChange: (mode: InteractionMode) => void
  onResetView: () => void
  onFitView: () => void
  onOpenFaultPanel: () => void
  onOpenRoamingPanel: () => void
  activeFaults: number
  isRoaming: boolean
  stats: {
    totalPipelines: number
    totalDevices: number
    runningDevices: number
    alarmCount: number
    warningCount: number
  }
}

const modeConfig: Record<InteractionMode, { icon: string; label: string; shortcut: string }> = {
  orbit: { icon: '🔄', label: '漫游', shortcut: '1' },
  select: { icon: '👆', label: '选择', shortcut: '2' },
  measure: { icon: '📏', label: '测量', shortcut: '3' },
  rotate: { icon: '🔃', label: '旋转', shortcut: '4' },
  pan: { icon: '✋', label: '平移', shortcut: '5' }
}

export const Toolbar: React.FC<ToolbarProps> = ({
  currentMode,
  onModeChange,
  onResetView,
  onFitView,
  onOpenFaultPanel,
  onOpenRoamingPanel,
  activeFaults,
  isRoaming,
  stats
}) => {
  const modes: InteractionMode[] = ['orbit', 'select', 'measure']

  return (
    <div className="toolbar">
      <div className="toolbar-section">
        <div className="toolbar-title">
          <span className="logo">🏭</span>
          <span>工业厂区管线可视化平台</span>
        </div>
      </div>

      <div className="toolbar-section">
        <div className="mode-buttons">
          {modes.map(mode => (
            <button
              key={mode}
              className={`mode-btn ${currentMode === mode ? 'active' : ''}`}
              onClick={() => onModeChange(mode)}
              title={`${modeConfig[mode].label} (${modeConfig[mode].shortcut})`}
            >
              <span className="mode-icon">{modeConfig[mode].icon}</span>
              <span className="mode-label">{modeConfig[mode].label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="toolbar-section">
        <div className="view-buttons">
          <button className="view-btn" onClick={onResetView} title="重置视图 (R)">
            🏠 重置
          </button>
          <button className="view-btn" onClick={onFitView} title="自适应视图">
            📐 适配
          </button>
        </div>
      </div>

      <div className="toolbar-section">
        <div className="feature-buttons">
          <button 
            className={`feature-btn ${activeFaults > 0 ? 'has-fault' : ''}`} 
            onClick={onOpenFaultPanel} 
            title="故障模拟 (F)"
          >
            ⚡ 故障模拟
            {activeFaults > 0 && <span className="badge">{activeFaults}</span>}
          </button>
          <button 
            className={`feature-btn ${isRoaming ? 'is-roaming' : ''}`} 
            onClick={onOpenRoamingPanel} 
            title="路径漫游 (P)"
          >
            🚀 路径漫游
            {isRoaming && <span className="badge active">●</span>}
          </button>
        </div>
      </div>

      <div className="toolbar-section stats-section">
        <div className="stats-item">
          <span className="stats-icon">┃</span>
          <span className="stats-value">{stats.totalPipelines}</span>
          <span className="stats-label">管线</span>
        </div>
        <div className="stats-item">
          <span className="stats-icon">⚙️</span>
          <span className="stats-value">{stats.totalDevices}</span>
          <span className="stats-label">设备</span>
        </div>
        <div className="stats-item running">
          <span className="stats-icon">▶</span>
          <span className="stats-value">{stats.runningDevices}</span>
          <span className="stats-label">运行</span>
        </div>
        {stats.warningCount > 0 && (
          <div className="stats-item warning">
            <span className="stats-icon">⚠</span>
            <span className="stats-value">{stats.warningCount}</span>
            <span className="stats-label">警告</span>
          </div>
        )}
        {stats.alarmCount > 0 && (
          <div className="stats-item alarm">
            <span className="stats-icon">🚨</span>
            <span className="stats-value">{stats.alarmCount}</span>
            <span className="stats-label">报警</span>
          </div>
        )}
      </div>
    </div>
  )
}
