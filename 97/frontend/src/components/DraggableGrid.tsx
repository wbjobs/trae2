import React, { useState, useRef, useCallback, useEffect } from 'react'
import { LayoutWidget, GridConfig } from '@/store/layoutStore'

interface DraggableGridProps {
  widgets: LayoutWidget[]
  gridConfig: GridConfig
  isEditMode: boolean
  selectedWidgetId: string | null
  onWidgetMove: (id: string, x: number, y: number, w: number, h: number) => void
  onWidgetSelect: (id: string | null) => void
  children: (widget: LayoutWidget) => React.ReactNode
}

interface DragState {
  isDragging: boolean
  isResizing: boolean
  widgetId: string | null
  startX: number
  startY: number
  startWidgetX: number
  startWidgetY: number
  startWidgetW: number
  startWidgetH: number
}

const DraggableGrid: React.FC<DraggableGridProps> = ({
  widgets,
  gridConfig,
  isEditMode,
  selectedWidgetId,
  onWidgetMove,
  onWidgetSelect,
  children
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const dragState = useRef<DragState>({
    isDragging: false,
    isResizing: false,
    widgetId: null,
    startX: 0,
    startY: 0,
    startWidgetX: 0,
    startWidgetY: 0,
    startWidgetW: 0,
    startWidgetH: 0
  })

  const { cols, rowHeight, margin } = gridConfig
  const cellWidth = `calc((100% - ${margin[0] * (cols - 1)}px) / ${cols})`

  const getWidgetStyle = useCallback((widget: LayoutWidget): React.CSSProperties => {
    const isSelected = widget.id === selectedWidgetId
    
    return {
      position: 'absolute',
      left: `calc(${widget.x} * (${cellWidth} + ${margin[0]}px))`,
      top: widget.y * (rowHeight + margin[1]),
      width: `calc(${widget.w} * (${cellWidth} + ${margin[0]}px) - ${margin[0]}px)`,
      height: widget.h * rowHeight + (widget.h - 1) * margin[1],
      transition: dragState.current.isDragging || dragState.current.isResizing ? 'none' : 'all 0.2s ease',
      zIndex: isSelected ? 100 : 1,
      border: isSelected && isEditMode ? '2px solid #4fc3f7' : 'none',
      borderRadius: 8,
      cursor: isEditMode ? 'move' : 'default',
      boxSizing: 'border-box'
    }
  }, [cellWidth, cols, rowHeight, margin, selectedWidgetId, isEditMode])

  const handleMouseDown = useCallback((e: React.MouseEvent, widget: LayoutWidget, isResize: boolean = false) => {
    if (!isEditMode) return
    
    e.preventDefault()
    e.stopPropagation()
    
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    
    dragState.current = {
      isDragging: !isResize,
      isResizing: isResize,
      widgetId: widget.id,
      startX: e.clientX - rect.left,
      startY: e.clientY - rect.top,
      startWidgetX: widget.x,
      startWidgetY: widget.y,
      startWidgetW: widget.w,
      startWidgetH: widget.h
    }
    
    onWidgetSelect(widget.id)
    
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [isEditMode, onWidgetSelect])

  const handleMouseMove = useCallback((e: MouseEvent) => {
    const state = dragState.current
    if (!state.widgetId || (!state.isDragging && !state.isResizing)) return
    
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    
    const cellW = (rect.width - margin[0] * (cols - 1)) / cols
    const cellH = rowHeight + margin[1]
    
    const deltaX = e.clientX - rect.left - state.startX
    const deltaY = e.clientY - rect.top - state.startY
    
    const widget = widgets.find(w => w.id === state.widgetId)
    if (!widget) return
    
    if (state.isDragging) {
      const deltaCols = Math.round(deltaX / (cellW + margin[0]))
      const deltaRows = Math.round(deltaY / cellH)
      
      let newX = Math.max(0, Math.min(cols - widget.w, state.startWidgetX + deltaCols))
      let newY = Math.max(0, state.startWidgetY + deltaRows)
      
      if (newX !== widget.x || newY !== widget.y) {
        onWidgetMove(widget.id, newX, newY, widget.w, widget.h)
      }
    } else if (state.isResizing) {
      const deltaCols = Math.round(deltaX / (cellW + margin[0]))
      const deltaRows = Math.round(deltaY / cellH)
      
      const minW = widget.minW || 1
      const minH = widget.minH || 1
      const maxW = widget.maxW || cols
      const maxH = widget.maxH || 100
      
      let newW = Math.max(minW, Math.min(maxW, state.startWidgetW + deltaCols))
      let newH = Math.max(minH, Math.min(maxH, state.startWidgetH + deltaRows))
      
      newW = Math.min(newW, cols - widget.x)
      
      if (newW !== widget.w || newH !== widget.h) {
        onWidgetMove(widget.id, widget.x, widget.y, newW, newH)
      }
    }
  }, [widgets, cols, rowHeight, margin, onWidgetMove])

  const handleMouseUp = useCallback(() => {
    dragState.current.isDragging = false
    dragState.current.isResizing = false
    dragState.current.widgetId = null
    
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', handleMouseUp)
  }, [handleMouseMove])

  const handleContainerClick = useCallback((e: React.MouseEvent) => {
    if (e.target === containerRef.current) {
      onWidgetSelect(null)
    }
  }, [onWidgetSelect])

  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [handleMouseMove, handleMouseUp])

  const gridHeight = widgets.length > 0 
    ? Math.max(...widgets.map(w => w.y + w.h)) * (rowHeight + margin[1]) + 50
    : 400

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        height: gridHeight,
        minHeight: 400
      }}
      onClick={handleContainerClick}
    >
      {widgets.map(widget => (
        <div
          key={widget.id}
          style={getWidgetStyle(widget)}
          onMouseDown={(e) => handleMouseDown(e, widget)}
        >
          {isEditMode && (
            <div 
              style={{
                position: 'absolute',
                top: -28,
                left: 0,
                right: 0,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '4px 8px',
                background: 'rgba(79, 195, 247, 0.9)',
                color: '#fff',
                fontSize: 12,
                borderRadius: '4px 4px 0 0',
                zIndex: 10
              }}
            >
              <span>{widget.title}</span>
              <span style={{ fontSize: 10, opacity: 0.8 }}>
                {widget.w}×{widget.h}
              </span>
            </div>
          )}
          
          {children(widget)}
          
          {isEditMode && (
            <>
              <div
                style={{
                  position: 'absolute',
                  bottom: -2,
                  right: -2,
                  width: 16,
                  height: 16,
                  background: '#4fc3f7',
                  border: '2px solid #fff',
                  borderRadius: '0 0 8px 0',
                  cursor: 'se-resize',
                  zIndex: 20
                }}
                onMouseDown={(e) => handleMouseDown(e, widget, true)}
              />
              
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    position: 'absolute',
                    top: i < 2 ? -4 : 'auto',
                    bottom: i >= 2 ? -4 : 'auto',
                    left: i % 2 === 0 ? -4 : 'auto',
                    right: i % 2 === 1 ? -4 : 'auto',
                    width: 8,
                    height: 8,
                    background: '#4fc3f7',
                    border: '2px solid #fff',
                    borderRadius: '50%',
                    zIndex: 15
                  }}
                />
              ))}
            </>
          )}
        </div>
      ))}
    </div>
  )
}

export default DraggableGrid
