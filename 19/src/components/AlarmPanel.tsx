import React from 'react'

interface Alarm {
  id: string
  type: string
  level: 'info' | 'warning' | 'alarm'
  message: string
  timestamp: string
  sourceId: string
  sourceType: 'pipeline' | 'device'
}

interface AlarmPanelProps {
  alarms: Alarm[]
  onAlarmClick?: (alarm: Alarm) => void
}

const levelConfig: Record<string, { label: string; color: string; bgColor: string }> = {
  info: { label: '信息', color: '#3b82f6', bgColor: 'rgba(59, 130, 246, 0.1)' },
  warning: { label: '警告', color: '#f59e0b', bgColor: 'rgba(245, 158, 11, 0.1)' },
  alarm: { label: '报警', color: '#ef4444', bgColor: 'rgba(239, 68, 68, 0.1)' }
}

const typeConfig: Record<string, { icon: string; label: string }> = {
  pressure: { icon: '📊', label: '压力' },
  flow: { icon: '💧', label: '流量' },
  sensor: { icon: '📡', label: '传感器' },
  temperature: { icon: '🌡️', label: '温度' },
  device: { icon: '⚙️', label: '设备' }
}

export const AlarmPanel: React.FC<AlarmPanelProps> = ({ alarms, onAlarmClick }) => {
  const sortedAlarms = [...alarms].sort((a, b) => {
    const levelOrder = { alarm: 0, warning: 1, info: 2 }
    return levelOrder[a.level] - levelOrder[b.level]
  })

  const alarmCount = alarms.filter(a => a.level === 'alarm').length
  const warningCount = alarms.filter(a => a.level === 'warning').length

  return (
    <div className="alarm-panel">
      <div className="panel-header">
        <h3>
          报警信息
          {alarmCount > 0 && <span className="badge alarm">{alarmCount}</span>}
          {warningCount > 0 && <span className="badge warning">{warningCount}</span>}
        </h3>
      </div>
      <div className="panel-content">
        {sortedAlarms.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">✅</span>
            <span>暂无报警信息</span>
          </div>
        ) : (
          <div className="alarm-list">
            {sortedAlarms.map(alarm => (
              <div
                key={alarm.id}
                className={`alarm-item ${alarm.level}`}
                onClick={() => onAlarmClick?.(alarm)}
                style={{ borderLeftColor: levelConfig[alarm.level].color }}
              >
                <div className="alarm-header">
                  <span className="alarm-icon">
                    {typeConfig[alarm.type]?.icon || '⚠️'}
                  </span>
                  <span className="alarm-level" style={{ color: levelConfig[alarm.level].color }}>
                    {levelConfig[alarm.level].label}
                  </span>
                  <span className="alarm-time">{formatTime(alarm.timestamp)}</span>
                </div>
                <div className="alarm-message">{alarm.message}</div>
                <div className="alarm-source">
                  来源: {alarm.sourceType === 'pipeline' ? '管线' : '设备'} - {alarm.sourceId}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function formatTime(timestamp: string): string {
  const date = new Date(timestamp)
  const now = new Date()
  const diff = now.getTime() - date.getTime()

  if (diff < 60000) {
    return '刚刚'
  } else if (diff < 3600000) {
    return `${Math.floor(diff / 60000)}分钟前`
  } else if (diff < 86400000) {
    return `${Math.floor(diff / 3600000)}小时前`
  } else {
    return date.toLocaleDateString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }
}
