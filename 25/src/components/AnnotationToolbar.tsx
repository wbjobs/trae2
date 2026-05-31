import {
  MousePointer2,
  Square,
  Type,
  Undo2,
  Redo2,
  Trash2,
  Send,
} from 'lucide-react'
import { useAnnotationStore, DEFAULT_COLORS } from '@/stores/annotationStore'

export default function AnnotationToolbar() {
  const currentTool = useAnnotationStore((s) => s.currentTool)
  const currentColor = useAnnotationStore((s) => s.currentColor)
  const selectedAnnotationId = useAnnotationStore((s) => s.selectedAnnotationId)
  const annotations = useAnnotationStore((s) => s.annotations)
  const setCurrentTool = useAnnotationStore((s) => s.setCurrentTool)
  const setCurrentColor = useAnnotationStore((s) => s.setCurrentColor)
  const undo = useAnnotationStore((s) => s.undo)
  const redo = useAnnotationStore((s) => s.redo)
  const canUndo = useAnnotationStore((s) => s.canUndo())
  const canRedo = useAnnotationStore((s) => s.canRedo())
  const pushHistory = useAnnotationStore((s) => s.pushHistory)
  const removeLocalAnnotation = useAnnotationStore((s) => s.removeLocalAnnotation)
  const setStatus = useAnnotationStore((s) => s.setStatus)

  const selectedAnnotation = annotations.find((a) => a.id === selectedAnnotationId)

  const handleDelete = () => {
    if (!selectedAnnotationId) return
    pushHistory()
    removeLocalAnnotation(selectedAnnotationId)
  }

  const handleSubmit = () => {
    if (!selectedAnnotationId || !selectedAnnotation) return
    pushHistory()
    setStatus(selectedAnnotationId, 'pending')
  }

  return (
    <div className="flex items-center justify-between p-3 bg-rice-100 border-b border-ink-100">
      <div className="flex items-center gap-1">
        <div className="flex items-center bg-rice rounded-lg border border-ink-100 p-1">
          <button
            className={`tool-btn ${currentTool === 'select' ? 'active' : ''}`}
            onClick={() => setCurrentTool('select')}
            title="选择工具"
          >
            <MousePointer2 className="w-4 h-4" />
          </button>
          <button
            className={`tool-btn ${currentTool === 'rectangle' ? 'active' : ''}`}
            onClick={() => setCurrentTool('rectangle')}
            title="矩形工具"
          >
            <Square className="w-4 h-4" />
          </button>
          <button
            className={`tool-btn ${currentTool === 'text' ? 'active' : ''}`}
            onClick={() => setCurrentTool('text')}
            title="文本工具"
          >
            <Type className="w-4 h-4" />
          </button>
        </div>

        <div className="w-px h-8 bg-ink-100 mx-2" />

        <div className="flex items-center bg-rice rounded-lg border border-ink-100 p-1">
          <button
            className={`tool-btn ${!canUndo ? 'opacity-40 cursor-not-allowed' : ''}`}
            onClick={undo}
            disabled={!canUndo}
            title="撤销"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            className={`tool-btn ${!canRedo ? 'opacity-40 cursor-not-allowed' : ''}`}
            onClick={redo}
            disabled={!canRedo}
            title="重做"
          >
            <Redo2 className="w-4 h-4" />
          </button>
        </div>

        <div className="w-px h-8 bg-ink-100 mx-2" />

        <div className="flex items-center gap-1.5 bg-rice rounded-lg border border-ink-100 px-2 py-1">
          <span className="text-xs text-ink-400 mr-1">颜色:</span>
          {DEFAULT_COLORS.map((color) => (
            <button
              key={color}
              className={`color-swatch ${
                currentColor === color ? 'selected' : ''
              }`}
              style={{ backgroundColor: color }}
              onClick={() => setCurrentColor(color)}
            />
          ))}
          <input
            type="color"
            value={currentColor}
            onChange={(e) => setCurrentColor(e.target.value)}
            className="w-7 h-7 rounded-full cursor-pointer border-0 bg-transparent"
            title="自定义颜色"
          />
        </div>
      </div>

      {selectedAnnotation && (
        <div className="flex items-center gap-2">
          <button
            onClick={handleDelete}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-cinnabar hover:bg-cinnabar-50 rounded-lg transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            删除
          </button>
          {selectedAnnotation.status === 'draft' && (
            <button
              onClick={handleSubmit}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-bronze text-rice hover:bg-bronze-600 rounded-lg transition-colors"
            >
              <Send className="w-4 h-4" />
              提交审核
            </button>
          )}
        </div>
      )}
    </div>
  )
}