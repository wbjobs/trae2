import {
  X,
  CheckCircle2,
  XCircle,
  Clock,
  Calendar,
  MessageSquare,
} from 'lucide-react'
import type { Review } from '@/lib/types'

const statusConfig = {
  approved: { label: '已通过', icon: CheckCircle2, color: 'text-bronze bg-bronze-50' },
  rejected: { label: '已驳回', icon: XCircle, color: 'text-cinnabar bg-cinnabar-50' },
  pending: { label: '待审核', icon: Clock, color: 'text-ink-400 bg-ink-50' },
}

interface ReviewDrawerProps {
  review: Review | null
  onClose: () => void
}

export default function ReviewDrawer({ review, onClose }: ReviewDrawerProps) {
  if (!review) return null

  const status = statusConfig[review.status]

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />

      <div className="drawer-panel">
        <div className="flex items-center justify-between p-4 border-b border-ink-100">
          <h2 className="chinese-title text-lg font-bold text-ink">审核详情</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-ink-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-ink" />
          </button>
        </div>

        <div className="p-4 space-y-6 overflow-y-auto h-[calc(100%-4rem)]">
          <div className="flex items-center gap-3">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium ${status.color}`}
            >
              <status.icon className="w-4 h-4" />
              {status.label}
            </span>
          </div>

          <div className="card-rice p-4">
            <h3 className="text-sm font-medium text-ink-600 mb-3 flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              审核信息
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-ink-400">审核ID</span>
                <span className="text-ink font-mono text-xs">{review.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-400">标注ID</span>
                <span className="text-ink font-mono text-xs">{review.annotation_id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-400">审核人ID</span>
                <span className="text-ink font-mono text-xs">{review.reviewer_id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-400">审核时间</span>
                <span className="text-ink">
                  {new Date(review.created_at).toLocaleString('zh-CN')}
                </span>
              </div>
            </div>
          </div>

          <div className="card-rice p-4">
            <h3 className="text-sm font-medium text-ink-600 mb-3 flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              审核意见
            </h3>
            <p className="text-sm text-ink whitespace-pre-wrap bg-rice-50 p-3 rounded-lg">
              {review.comment || '暂无审核意见'}
            </p>
          </div>
        </div>
      </div>
    </>
  )
}
