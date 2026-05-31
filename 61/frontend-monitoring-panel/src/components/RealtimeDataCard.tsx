import React, { useEffect, useRef, useCallback } from 'react'
import { Card, Statistic, Badge, Progress, Space } from 'antd'
import { useThrottle } from '../hooks/usePerformance'

interface RealtimeDataCardProps {
  title: string
  value: number | string
  unit?: string
  prefix?: React.ReactNode
  suffix?: React.ReactNode
  status?: 'normal' | 'warning' | 'critical'
  trend?: 'rising' | 'falling' | 'stable'
  description?: string
  progress?: number
  updateInterval?: number
  onClick?: () => void
}

const RealtimeDataCard: React.FC<RealtimeDataCardProps> = ({
  title,
  value,
  unit,
  prefix,
  suffix,
  status = 'normal',
  trend,
  description,
  progress,
  updateInterval = 1000,
  onClick
}) => {
  const displayValue = useRef(value)
  const animationRef = useRef<number>()

  const getStatusColor = useCallback(() => {
    switch (status) {
      case 'critical':
        return '#ff4d4f'
      case 'warning':
        return '#faad14'
      default:
        return '#52c41a'
    }
  }, [status])

  const getTrendIcon = useCallback(() => {
    switch (trend) {
      case 'rising':
        return '↑'
      case 'falling':
        return '↓'
      default:
        return '→'
    }
  }, [trend])

  const animateValue = useCallback(() => {
    const current = displayValue.current
    const target = typeof value === 'number' ? value : parseFloat(value as string) || 0
    
    if (typeof current === 'number' && typeof target === 'number') {
      const diff = target - current
      if (Math.abs(diff) > 0.01) {
        displayValue.current = current + diff * 0.3
      } else {
        displayValue.current = target
      }
    }
    
    animationRef.current = requestAnimationFrame(animateValue)
  }, [value])

  useEffect(() => {
    animationRef.current = requestAnimationFrame(animateValue)
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [animateValue])

  const throttledClick = useThrottle(
    () => onClick?.(),
    300
  )

  return (
    <Card
      size="small"
      hoverable
      onClick={throttledClick}
      style={{
        borderLeft: `4px solid ${getStatusColor()}`,
        cursor: onClick ? 'pointer' : 'default'
      }}
    >
      <Space direction="vertical" style={{ width: '100%' }} size="small">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#666', fontSize: 13 }}>{title}</span>
          {trend && (
            <span style={{ color: trend === 'rising' ? '#ff4d4f' : trend === 'falling' ? '#52c41a' : '#999' }}>
              {getTrendIcon()}
            </span>
          )}
        </div>
        
        <Statistic
          value={typeof displayValue.current === 'number' ? displayValue.current.toFixed(2) : displayValue.current}
          prefix={prefix}
          suffix={unit}
          valueStyle={{ color: getStatusColor(), fontSize: 24 }}
        />
        
        {progress !== undefined && (
          <Progress
            percent={Math.min(100, Math.max(0, progress))}
            size="small"
            strokeColor={getStatusColor()}
            showInfo={false}
          />
        )}
        
        {description && (
          <div style={{ color: '#999', fontSize: 12 }}>{description}</div>
        )}
        
        {suffix && (
          <Badge
            status={status === 'critical' ? 'error' : status === 'warning' ? 'warning' : 'success'}
            text={suffix}
          />
        )}
      </Space>
    </Card>
  )
}

export default React.memo(RealtimeDataCard)
