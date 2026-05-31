import { useState } from 'react'
import {
  MessageSquare,
  Clock,
  CheckCircle2,
  XCircle,
  Edit3,
  Trash2,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { useAnnotationStore, DEFAULT_COLORS } from '@/stores/annotationStore'
import type { Annotation, AnnotationStatus } from '@/lib/types'

const statusConfig: Record<AnnotationStatus, { label: string; icon: typeof Edit3; color: string; bg: string }> = {
  draft: { label: '草稿', icon: Edit3, color: 'text-ink-400', bg: 'bg-ink-50' },
  pending: {
    label: '待审核',
    icon: Clock,
    color: 'text-cinnabar',
    bg: 'bg-cinnabar-50',
  },
  approved: {
    label: '已通过',
    icon: CheckCircle2,
    color: 'text-bronze',
    bg: 'bg-bronze-50',
  },
  rejected: {
    label: '已驳回',
    icon: XCircle,
    color: 'text-cinnabar-700',
    bg: 'bg-cinnabar-100',
  },
}

export default function AnnotationList() {
  const annotations = useAnnotationStore((s) => s.annotations)
  const selectedAnnotationId = useAnnotationStore((s) => s.selectedAnnotationId)
  const selectAnnotation = useAnnotationStore((s) => s.selectAnnotation)
  const updateLocalAnnotation = useAnnotationStore((s) => s.updateLocalAnnotation)
  const removeLocalAnnotation = useAnnotationStore((s) => s.removeLocalAnnotation)
  const pushHistory = useAnnotationStore((s) => s.pushHistory)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editContent, setEditContent] = useState('')

  const getAnnotationColor = (annotation: Annotation) => {
    const colorIndex = annotation.id % DEFAULT_COLORS.length
    return DEFAULT_COLORS[colorIndex]
  }

  const handleSelect = (id: number) => {
    selectAnnotation(selectedAnnotationId === id ? null : id)
    setExpandedId(expandedId === id ? null : id)
  }

  const handleEdit = (annotation: Annotation) => {
    setEditingId(annotation.id)
    setEditContent(annotation.content)
  }

  const handleSaveEdit = (id: number) => {
    pushHistory()
    updateLocalAnnotation(id, {
      content: editContent,
      updated_at: new Date().toISOString(),
    })
    setEditingId(null)
    setEditContent('')
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setEditContent('')
  }

  const handleDelete = (id: number) => {
    pushHistory()
    removeLocalAnnotation(id)
  }

  if (annotations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-ink-300">
        <MessageSquare className="w-12 h-12 mb-3 opacity-50" />
        <p className="text-sm">暂无标注</p>
        <p className="text-xs mt-1">使用矩形工具在图片上标注</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {annotations.map((annotation, index) => {
        const status = statusConfig[annotation.status]
        const isSelected = selectedAnnotationId === annotation.id
        const isExpanded = expandedId === annotation.id
        const isEditing = editingId === annotation.id
        const color = getAnnotationColor(annotation)

        return (
          <div
            key={annotation.id}
            className={`border rounded-lg transition-all duration-200 ${
              isSelected
                ? 'border-cinnabar bg-cinnabar-50 shadow-sm'
                : 'border-ink-100 bg-rice hover:border-ink-200'
            }`}
          >
            <div
              className="flex items-center gap-2 p-3 cursor-pointer"
              onClick={() => handleSelect(annotation.id)}
            >
              <span
                className="w-4 h-4 rounded flex-shrink-0"
                style={{ backgroundColor: color }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-ink">
                    标注 #{index + 1}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-xs rounded ${status.bg} ${status.color}`}
                  >
                    <status.icon className="w-3 h-3" />
                    {status.label}
                  </span>
                </div>
                {annotation.content && !isEditing && (
                  <p className="text-xs text-ink-500 mt-1 line-clamp-1">
                    {annotation.content}
                  </p>
                )}
              </div>
              <button
                className="p-1 hover:bg-ink-100 rounded"
                onClick={(e) => {
                  e.stopPropagation()
                  setExpandedId(isExpanded ? null : annotation.id)
                }}
              >
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-ink-400" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-ink-400" />
                )}
              </button>
            </div>

            {isExpanded && (
              <div className="px-3 pb-3 border-t border-ink-100 pt-3">
                {isEditing ? (
                  <div className="space-y-2">
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      placeholder="输入标注内容..."
                      className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ink-100"
                      rows={3}
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleSaveEdit(annotation.id)}
                        className="flex-1 px-3 py-1.5 text-sm bg-ink text-rice rounded-lg hover:bg-ink-700 transition-colors"
                      >
                        保存
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        className="flex-1 px-3 py-1.5 text-sm border border-ink-200 rounded-lg hover:bg-ink-50 transition-colors"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="text-sm text-ink-600 mb-3 whitespace-pre-wrap">
                      {annotation.content || (
                        <span className="text-ink-300">暂无内容，点击编辑添加</span>
                      )}
                    </div>
                    <div className="text-xs text-ink-400 mb-2">
                      位置: x:{Math.round(annotation.x)}, y:
                      {Math.round(annotation.y)}, 宽:
                      {Math.round(annotation.width)}, 高:
                      {Math.round(annotation.height)}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEdit(annotation)}
                        className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 text-sm border border-ink-200 rounded-lg hover:bg-ink-50 transition-colors"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        编辑
                      </button>
                      <button
                        onClick={() => handleDelete(annotation.id)}
                        className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 text-sm text-cinnabar border border-cinnabar-200 rounded-lg hover:bg-cinnabar-50 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        删除
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
