import React from 'react'
import type { LowCodeComponent } from '../../types'
import { FilterComponent } from './FilterComponent'
import { ChartComponent } from './ChartComponent'
import { TableComponent } from './TableComponent'
import { TraceViewComponent } from './TraceViewComponent'
import { ClusterViewComponent } from './ClusterViewComponent'
import { useLowCode } from './LowCodeContext'

interface ComponentRendererProps {
  component: LowCodeComponent
}

export const ComponentRenderer: React.FC<ComponentRendererProps> = ({ component }) => {
  const { selectedComponent, selectComponent, removeComponent, moveComponent, resizeComponent } = useLowCode()
  const [isDragging, setIsDragging] = React.useState(false)
  const [isResizing, setIsResizing] = React.useState(false)
  const [dragOffset, setDragOffset] = React.useState({ x: 0, y: 0 })

  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation()
    selectComponent(component.id)
    setIsDragging(true)
    setDragOffset({
      x: e.clientX - component.position.x,
      y: e.clientY - component.position.y
    })
  }

  const handleMouseMove = React.useCallback(
    (e: MouseEvent) => {
      if (isDragging) {
        moveComponent(component.id, {
          x: Math.max(0, e.clientX - dragOffset.x),
          y: Math.max(0, e.clientY - dragOffset.y)
        })
      }
    },
    [isDragging, dragOffset, component.id, moveComponent]
  )

  const handleMouseUp = React.useCallback(() => {
    setIsDragging(false)
    setIsResizing(false)
  }, [])

  React.useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [isDragging, handleMouseMove, handleMouseUp])

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    setIsResizing(true)
    const startX = e.clientX
    const startY = e.clientY
    const startWidth = component.size.width
    const startHeight = component.size.height

    const handleResizeMove = (ev: MouseEvent) => {
      resizeComponent(component.id, {
        width: Math.max(200, startWidth + (ev.clientX - startX)),
        height: Math.max(150, startHeight + (ev.clientY - startY))
      })
    }

    const handleResizeUp = () => {
      setIsResizing(false)
      document.removeEventListener('mousemove', handleResizeMove)
      document.removeEventListener('mouseup', handleResizeUp)
    }

    document.addEventListener('mousemove', handleResizeMove)
    document.addEventListener('mouseup', handleResizeUp)
  }

  const renderContent = () => {
    switch (component.type) {
      case 'filter':
        return <FilterComponent />
      case 'chart':
        return <ChartComponent />
      case 'table':
        return <TableComponent />
      case 'trace-view':
        return <TraceViewComponent />
      case 'cluster-view':
        return <ClusterViewComponent />
      default:
        return null
    }
  }

  return (
    <div
      style={{
        position: 'absolute',
        left: component.position.x,
        top: component.position.y,
        width: component.size.width,
        height: component.size.height,
        border: selectedComponent === component.id ? '2px solid #1890ff' : '1px solid #e8e8e8',
        borderRadius: 8,
        backgroundColor: '#fff',
        boxShadow: selectedComponent === component.id ? '0 4px 12px rgba(24,144,255,0.15)' : '0 2px 8px rgba(0,0,0,0.06)',
        overflow: 'hidden',
        zIndex: selectedComponent === component.id ? 10 : 1
      }}
      onMouseDown={handleMouseDown}
    >
      {selectedComponent === component.id && (
        <>
          <div
            style={{
              position: 'absolute',
              top: -8,
              right: -8,
              width: 18,
              height: 18,
              borderRadius: '50%',
              backgroundColor: '#ff4d4f',
              color: '#fff',
              fontSize: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              zIndex: 20
            }}
            onClick={(e) => {
              e.stopPropagation()
              removeComponent(component.id)
            }}
          >
            ×
          </div>
          <div
            style={{
              position: 'absolute',
              right: 0,
              bottom: 0,
              width: 16,
              height: 16,
              cursor: 'se-resize',
              background: 'linear-gradient(135deg, transparent 50%, #1890ff 50%)',
              zIndex: 20
            }}
            onMouseDown={handleResizeMouseDown}
          />
        </>
      )}
      <div style={{ width: '100%', height: '100%', overflow: 'auto', padding: 0 }}>
        {renderContent()}
      </div>
    </div>
  )
}