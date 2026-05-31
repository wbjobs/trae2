import { useRef, useEffect, useState, useCallback } from 'react'
import { ZoomIn, ZoomOut, RotateCcw, Move } from 'lucide-react'
import { useAnnotationStore, DEFAULT_COLORS } from '@/stores/annotationStore'
import type { Annotation } from '@/lib/types'
import { useAuthStore } from '@/stores/authStore'

interface AnnotationCanvasProps {
  imageUrl: string
  imageWidth: number
  imageHeight: number
  projectId: number
  imageId: number
}

export default function AnnotationCanvas({
  imageUrl,
  imageWidth,
  imageHeight,
  projectId,
  imageId,
}: AnnotationCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [isDrawing, setIsDrawing] = useState(false)
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(
    null
  )
  const [drawRect, setDrawRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const [touchMode, setTouchMode] = useState<'none' | 'pan' | 'draw'>('none')
  const lastTouchRef = useRef<{ x: number; y: number } | null>(null)
  const touchStartDistanceRef = useRef<number>(0)
  const initialScaleRef = useRef<number>(1)

  const user = useAuthStore((s) => s.user)
  const annotations = useAnnotationStore((s) => s.annotations)
  const selectedAnnotationId = useAnnotationStore((s) => s.selectedAnnotationId)
  const currentTool = useAnnotationStore((s) => s.currentTool)
  const currentColor = useAnnotationStore((s) => s.currentColor)
  const selectAnnotation = useAnnotationStore((s) => s.selectAnnotation)
  const pushHistory = useAnnotationStore((s) => s.pushHistory)
  const addLocalAnnotation = useAnnotationStore((s) => s.addLocalAnnotation)

  const selectedAnnotation = annotations.find((a) => a.id === selectedAnnotationId)

  const getAnnotationColor = (annotation: Annotation) => {
    const colorIndex = annotation.id % DEFAULT_COLORS.length
    return DEFAULT_COLORS[colorIndex]
  }

  const getImageCoords = useCallback(
    (clientX: number, clientY: number) => {
      const container = containerRef.current
      if (!container || !imgRef.current) return { x: 0, y: 0 }
      const rect = container.getBoundingClientRect()
      const img = imgRef.current
      const imgRect = img.getBoundingClientRect()

      const relativeX = (clientX - imgRect.left) / scale
      const relativeY = (clientY - imgRect.top) / scale

      return {
        x: Math.max(0, Math.min(imageWidth, relativeX)),
        y: Math.max(0, Math.min(imageHeight, relativeY)),
      }
    },
    [scale, imageWidth, imageHeight]
  )

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return

      if (currentTool === 'select' || (e.altKey && currentTool !== 'rectangle')) {
        setIsPanning(true)
        lastTouchRef.current = { x: e.clientX - offset.x, y: e.clientY - offset.y }
        return
      }

      if (currentTool === 'rectangle') {
        const coords = getImageCoords(e.clientX, e.clientY)
        setIsDrawing(true)
        setDrawStart(coords)
        setDrawRect({ x: coords.x, y: coords.y, width: 0, height: 0 })
      }
    },
    [currentTool, offset, getImageCoords]
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (isPanning && lastTouchRef.current) {
        setOffset({
          x: e.clientX - lastTouchRef.current.x,
          y: e.clientY - lastTouchRef.current.y,
        })
        return
      }

      if (isDrawing && drawStart) {
        const coords = getImageCoords(e.clientX, e.clientY)
        const x = Math.min(drawStart.x, coords.x)
        const y = Math.min(drawStart.y, coords.y)
        const width = Math.abs(coords.x - drawStart.x)
        const height = Math.abs(coords.y - drawStart.y)
        setDrawRect({ x, y, width, height })
      }
    },
    [isPanning, isDrawing, drawStart, getImageCoords]
  )

  const handleMouseUp = useCallback(
    (e: React.MouseEvent) => {
      if (isPanning) {
        setIsPanning(false)
        lastTouchRef.current = null
        return
      }

      if (isDrawing && drawRect && drawRect.width > 5 && drawRect.height > 5) {
        pushHistory()
        const newAnnotation: Annotation = {
          id: Date.now(),
          image_id: imageId,
          user_id: user?.id || 0,
          x: drawRect.x,
          y: drawRect.y,
          width: drawRect.width,
          height: drawRect.height,
          content: '',
          status: 'draft',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
        addLocalAnnotation(newAnnotation)
        selectAnnotation(newAnnotation.id)
      }

      setIsDrawing(false)
      setDrawStart(null)
      setDrawRect(null)
    },
    [
      isPanning,
      isDrawing,
      drawRect,
      imageId,
      user?.id,
      pushHistory,
      addLocalAnnotation,
      selectAnnotation,
    ]
  )

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.1 : 0.1
    setScale((prev) => Math.max(0.1, Math.min(5, prev + delta)))
  }, [])

  const zoomIn = () => setScale((prev) => Math.min(5, prev + 0.2))
  const zoomOut = () => setScale((prev) => Math.max(0.1, prev - 0.2))
  const resetView = () => {
    setScale(1)
    setOffset({ x: 0, y: 0 })
  }

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 2) {
        const touch1 = e.touches[0]
        const touch2 = e.touches[1]
        const distance = Math.hypot(
          touch2.clientX - touch1.clientX,
          touch2.clientY - touch1.clientY
        )
        touchStartDistanceRef.current = distance
        initialScaleRef.current = scale
        setTouchMode('pan')
        return
      }

      if (e.touches.length === 1) {
        const touch = e.touches[0]
        if (currentTool === 'rectangle') {
          setTouchMode('draw')
          const coords = getImageCoords(touch.clientX, touch.clientY)
          setDrawStart(coords)
          setDrawRect({ x: coords.x, y: coords.y, width: 0, height: 0 })
        } else {
          setTouchMode('pan')
          lastTouchRef.current = {
            x: touch.clientX - offset.x,
            y: touch.clientY - offset.y,
          }
        }
      }
    },
    [currentTool, scale, offset, getImageCoords]
  )

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 2) {
        const touch1 = e.touches[0]
        const touch2 = e.touches[1]
        const distance = Math.hypot(
          touch2.clientX - touch1.clientX,
          touch2.clientY - touch1.clientY
        )
        const newScale =
          initialScaleRef.current *
          (distance / touchStartDistanceRef.current)
        setScale(Math.max(0.1, Math.min(5, newScale)))
        return
      }

      if (e.touches.length === 1 && touchMode === 'pan' && lastTouchRef.current) {
        const touch = e.touches[0]
        setOffset({
          x: touch.clientX - lastTouchRef.current.x,
          y: touch.clientY - lastTouchRef.current.y,
        })
      }

      if (e.touches.length === 1 && touchMode === 'draw' && drawStart) {
        const touch = e.touches[0]
        const coords = getImageCoords(touch.clientX, touch.clientY)
        const x = Math.min(drawStart.x, coords.x)
        const y = Math.min(drawStart.y, coords.y)
        const width = Math.abs(coords.x - drawStart.x)
        const height = Math.abs(coords.y - drawStart.y)
        setDrawRect({ x, y, width, height })
      }
    },
    [touchMode, drawStart, getImageCoords]
  )

  const handleTouchEnd = useCallback(() => {
    if (touchMode === 'draw' && drawRect && drawRect.width > 5 && drawRect.height > 5) {
      pushHistory()
      const newAnnotation: Annotation = {
        id: Date.now(),
        image_id: imageId,
        user_id: user?.id || 0,
        x: drawRect.x,
        y: drawRect.y,
        width: drawRect.width,
        height: drawRect.height,
        content: '',
        status: 'draft',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      addLocalAnnotation(newAnnotation)
      selectAnnotation(newAnnotation.id)
    }
    setTouchMode('none')
    setDrawStart(null)
    setDrawRect(null)
    lastTouchRef.current = null
  }, [touchMode, drawRect, imageId, user?.id, pushHistory, addLocalAnnotation, selectAnnotation])

  const handleAnnotationClick = (
    e: React.MouseEvent,
    annotation: Annotation
  ) => {
    e.stopPropagation()
    if (currentTool === 'select') {
      selectAnnotation(
        selectedAnnotationId === annotation.id ? null : annotation.id
      )
    }
  }

  const handleCanvasClick = () => {
    if (currentTool === 'select') {
      selectAnnotation(null)
    }
  }

  return (
    <div className="relative h-full flex flex-col bg-ink-950 rounded-lg overflow-hidden">
      <div className="absolute top-3 left-3 z-20 flex items-center gap-1 bg-ink-900 bg-opacity-90 rounded-lg p-1">
        <button
          onClick={zoomOut}
          className="p-2 text-rice hover:bg-ink-700 rounded transition-colors"
          title="缩小"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <span className="text-rice text-xs px-2 min-w-[3rem] text-center">
          {Math.round(scale * 100)}%
        </span>
        <button
          onClick={zoomIn}
          className="p-2 text-rice hover:bg-ink-700 rounded transition-colors"
          title="放大"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <div className="w-px h-5 bg-ink-600 mx-1" />
        <button
          onClick={resetView}
          className="p-2 text-rice hover:bg-ink-700 rounded transition-colors"
          title="重置视图"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      <div className="absolute top-3 right-3 z-20 flex items-center gap-2 bg-ink-900 bg-opacity-90 rounded-lg px-3 py-2">
        <Move className="w-4 h-4 text-ink-300" />
        <span className="text-ink-300 text-xs">
          {currentTool === 'rectangle' ? '拖拽绘制矩形' : '拖拽平移 · 滚轮缩放'}
        </span>
      </div>

      <div
        ref={containerRef}
        className={`flex-1 overflow-hidden select-none-all ${
          isPanning ? 'cursor-grabbing' : currentTool === 'rectangle' ? 'cursor-crosshair' : 'cursor-grab'
        }`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onClick={handleCanvasClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ touchAction: 'none' }}
      >
        <div
          className="relative w-full h-full flex items-center justify-center"
          style={{ minHeight: '400px' }}
        >
          <div
            className="relative"
            style={{
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
              transformOrigin: 'center center',
              transition: isPanning || isDrawing ? 'none' : 'transform 0.1s ease-out',
            }}
          >
            <img
              ref={imgRef}
              src={imageUrl}
              alt="拓片"
              className="block"
              style={{
                width: imageWidth,
                height: imageHeight,
                maxWidth: 'none',
                boxShadow: '0 0 40px rgba(0,0,0,0.3)',
              }}
              draggable={false}
            />

            <div
              className="absolute top-0 left-0"
              style={{ width: imageWidth, height: imageHeight }}
            >
              {[...annotations]
                .sort((a, b) => a.id - b.id)
                .map((annotation) => {
                  const color = getAnnotationColor(annotation)
                  const isSelected = selectedAnnotationId === annotation.id
                  return (
                    <div
                      key={annotation.id}
                      className={`annotation-rect ${
                        isSelected ? 'selected' : ''
                      }`}
                      style={{
                        left: annotation.x,
                        top: annotation.y,
                        width: annotation.width,
                        height: annotation.height,
                        borderColor: color,
                        background: `${color}15`,
                        zIndex: isSelected ? 1000 : annotation.id,
                      }}
                      onClick={(e) => handleAnnotationClick(e, annotation)}
                    >
                    {annotation.content && (
                      <div
                        className="absolute -top-6 left-0 px-2 py-0.5 text-xs rounded whitespace-nowrap"
                        style={{
                          background: color,
                          color: '#f5f0e6',
                        }}
                      >
                        {annotation.content.length > 20
                          ? annotation.content.slice(0, 20) + '...'
                          : annotation.content}
                      </div>
                    )}
                    {selectedAnnotationId === annotation.id && (
                      <>
                        <div className="resize-handle nw" />
                        <div className="resize-handle ne" />
                        <div className="resize-handle sw" />
                        <div className="resize-handle se" />
                      </>
                    )}
                  </div>
                )
              })}

              {drawRect && (
                <div
                  className="absolute border-2 border-dashed rounded-sm pointer-events-none"
                  style={{
                    left: drawRect.x,
                    top: drawRect.y,
                    width: drawRect.width,
                    height: drawRect.height,
                    borderColor: currentColor,
                    background: `${currentColor}20`,
                    zIndex: 9999,
                  }}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
