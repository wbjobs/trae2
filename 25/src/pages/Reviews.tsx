import { useState } from 'react'
import {
  ClipboardCheck,
  CheckCircle2,
  XCircle,
  Clock,
  Eye,
  Search,
} from 'lucide-react'
import ReviewDrawer from '@/components/ReviewDrawer'
import type { Review, ReviewStatus } from '@/lib/types'

const mockReviews: Review[] = [
  {
    id: 1,
    annotation_id: 101,
    reviewer_id: 2,
    status: 'approved',
    comment: '标注准确，内容完整，位置合理。',
    created_at: '2024-01-16T14:30:00Z',
  },
  {
    id: 2,
    annotation_id: 102,
    reviewer_id: 2,
    status: 'rejected',
    comment: '位置偏差较大，请参照原图重新标注。内容描述过于简略，需补充详细说明。',
    created_at: '2024-01-16T09:00:00Z',
  },
  {
    id: 3,
    annotation_id: 103,
    reviewer_id: 2,
    status: 'pending',
    comment: '',
    created_at: '2024-01-17T08:00:00Z',
  },
]

const statusConfig = {
  approved: { label: '已通过', icon: CheckCircle2, color: 'text-bronze bg-bronze-50 border-bronze-200' },
  rejected: { label: '已驳回', icon: XCircle, color: 'text-cinnabar bg-cinnabar-50 border-cinnabar-200' },
  pending: { label: '待审核', icon: Clock, color: 'text-ink-400 bg-ink-50 border-ink-200' },
}

export default function Reviews() {
  const [reviews, setReviews] = useState<Review[]>(mockReviews)
  const [selectedReview, setSelectedReview] = useState<Review | null>(null)
  const [filter, setFilter] = useState<ReviewStatus | 'all'>('all')
  const [searchQuery, setSearchQuery] = useState('')

  const filteredReviews = reviews.filter((review) => {
    if (filter !== 'all' && review.status !== filter) return false
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      return review.comment.toLowerCase().includes(query)
    }
    return true
  })

  const stats = {
    total: reviews.length,
    approved: reviews.filter((r) => r.status === 'approved').length,
    rejected: reviews.filter((r) => r.status === 'rejected').length,
    pending: reviews.filter((r) => r.status === 'pending').length,
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="chinese-title text-2xl font-bold text-ink">审核记录</h2>
        <p className="text-ink-400 text-sm mt-1">查看和管理所有标注审核记录</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card-rice p-4">
          <p className="text-2xl font-bold text-ink">{stats.total}</p>
          <p className="text-xs text-ink-400">审核总数</p>
        </div>
        <div className="card-rice p-4 border-l-4 border-bronze">
          <p className="text-2xl font-bold text-bronze">{stats.approved}</p>
          <p className="text-xs text-ink-400">已通过</p>
        </div>
        <div className="card-rice p-4 border-l-4 border-cinnabar">
          <p className="text-2xl font-bold text-cinnabar">{stats.rejected}</p>
          <p className="text-xs text-ink-400">已驳回</p>
        </div>
        <div className="card-rice p-4 border-l-4 border-ink-400">
          <p className="text-2xl font-bold text-ink-400">{stats.pending}</p>
          <p className="text-xs text-ink-400">待审核</p>
        </div>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-ink-300" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索审核意见..."
            className="input-ink pl-10"
          />
        </div>
        <div className="flex gap-2">
          {(['all', 'pending', 'approved', 'rejected'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                filter === f
                  ? 'bg-ink text-rice'
                  : 'bg-rice text-ink-400 hover:bg-ink-50 border border-ink-100'
              }`}
            >
              {f === 'all' ? '全部' : statusConfig[f].label}
            </button>
          ))}
        </div>
      </div>

      <div className="card-rice overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-ink-50 border-b border-ink-100">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-ink-400 uppercase tracking-wider">
                  审核ID
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-ink-400 uppercase tracking-wider">
                  标注ID
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-ink-400 uppercase tracking-wider">
                  状态
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-ink-400 uppercase tracking-wider">
                  审核时间
                </th>
                <th className="text-right px-4 py-3 text-xs font-medium text-ink-400 uppercase tracking-wider">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {filteredReviews.map((review) => {
                const status = statusConfig[review.status]
                return (
                  <tr
                    key={review.id}
                    className="hover:bg-ink-50 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <span className="text-sm text-ink font-mono">
                        #{review.id}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-ink-600 font-mono">
                        #{review.annotation_id}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full border ${status.color}`}
                      >
                        <status.icon className="w-3 h-3" />
                        {status.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-ink-400">
                        {new Date(review.created_at).toLocaleDateString('zh-CN')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setSelectedReview(review)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-ink hover:text-cinnabar hover:bg-cinnabar-50 rounded-lg transition-colors"
                      >
                        <Eye className="w-4 h-4" />
                        查看
                      </button>
                    </td>
                  </tr>
                )
              })}
              {filteredReviews.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-ink-300">
                    <ClipboardCheck className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>暂无审核记录</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ReviewDrawer
        review={selectedReview}
        onClose={() => setSelectedReview(null)}
      />
    </div>
  )
}
