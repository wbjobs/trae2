import { useState, useCallback, useMemo } from 'react'
import {
  GitCompare,
  Loader2,
  FileText,
} from 'lucide-react'

interface TextComparisonProps {
  projectId?: number
  annotationId?: number
}

interface ComparisonResult {
  similarity: number
  commonChars: string[]
  differentChars: {
    text1: string[]
    text2: string[]
  }
  alignment: Array<{
    char: string
    type: 'match' | 'mismatch' | 'insert' | 'delete'
    position: number
  }>
}

export default function TextComparison({ projectId, annotationId }: TextComparisonProps) {
  const [text1, setText1] = useState('')
  const [text2, setText2] = useState('')
  const [result, setResult] = useState<ComparisonResult | null>(null)
  const [loading, setLoading] = useState(false)

  const handleCompare = useCallback(async () => {
    if (!text1.trim() || !text2.trim()) return

    setLoading(true)
    try {
      const response = await fetch('/api/text-compare', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ text1, text2 }),
      })
      const data = await response.json()
      if (data.success) {
        setResult(data.data)
      }
    } catch (error) {
      console.error('对比失败:', error)
    } finally {
      setLoading(false)
    }
  }, [text1, text2])

  const getSimilarityLevel = useCallback((similarity: number) => {
    if (similarity >= 0.95) return { label: '完全匹配', color: 'text-bronze', bg: 'bg-bronze-50' }
    if (similarity >= 0.8) return { label: '高度相似', color: 'text-bronze-600', bg: 'bg-bronze-50' }
    if (similarity >= 0.5) return { label: '部分匹配', color: 'text-silk', bg: 'bg-silk-50' }
    return { label: '差异较大', color: 'text-cinnabar', bg: 'bg-cinnabar-50' }
  }, [])

  const getAlignmentStyle = useCallback((type: string) => {
    switch (type) {
      case 'match':
        return 'bg-transparent text-ink'
      case 'mismatch':
        return 'bg-cinnabar-100 text-cinnabar'
      case 'insert':
        return 'bg-bronze-100 text-bronze-700'
      case 'delete':
        return 'bg-red-100 text-red-500 line-through'
      default:
        return 'bg-transparent'
    }
  }, [])

  const canCompare = useMemo(
    () => text1.trim().length > 0 && text2.trim().length > 0,
    [text1, text2]
  )

  return (
    <div className="card-rice p-6">
      <div className="flex items-center gap-2 mb-4">
        <FileText className="w-5 h-5 text-ink-400" />
        <h3 className="text-lg font-medium text-ink">拓片文字智能比对</h3>
      </div>

      <div className="grid md:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-sm text-ink-400 mb-2">原文 / 底本</label>
          <textarea
            value={text1}
            onChange={(e) => setText1(e.target.value)}
            placeholder="输入原始文字..."
            className="w-full h-32 p-3 border border-ink-200 rounded-lg resize-none focus:outline-none focus:border-ink-400 font-mono text-sm"
          />
        </div>
        <div>
          <label className="block text-sm text-ink-400 mb-2">比对文本 / 释读</label>
          <textarea
            value={text2}
            onChange={(e) => setText2(e.target.value)}
            placeholder="输入待比对文字..."
            className="w-full h-32 p-3 border border-ink-200 rounded-lg resize-none focus:outline-none focus:border-ink-400 font-mono text-sm"
          />
        </div>
      </div>

      <div className="flex justify-center mb-6">
        <button
          onClick={handleCompare}
          disabled={loading || !canCompare}
          className="flex items-center gap-2 px-6 py-2 bg-ink text-rice rounded-lg hover:bg-ink-700 transition-colors disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <GitCompare className="w-4 h-4" />
          )}
          {loading ? '比对中...' : '开始比对'}
        </button>
      </div>

      {result && (
        <div className="space-y-4 mt-6 pt-6 border-t border-ink-100">
          <div className="flex items-center justify-center gap-6">
            <div className={`px-4 py-2 rounded-lg ${getSimilarityLevel(result.similarity).bg}`}>
              <span className={`text-sm ${getSimilarityLevel(result.similarity).color}`}>
                {getSimilarityLevel(result.similarity).label}
              </span>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-ink">
                {Math.round(result.similarity * 100)}%
              </div>
              <div className="text-xs text-ink-400">相似度</div>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="p-3 bg-ink-50 rounded-lg">
              <div className="text-xs text-ink-400 mb-2">共有字符</div>
              <div className="font-mono text-sm">
                {result.commonChars.length > 0 ? (
                  result.commonChars.join(' · ')
                ) : (
                  <span className="text-ink-300">无</span>
                )}
              </div>
            </div>
            <div className="p-3 bg-ink-50 rounded-lg">
              <div className="text-xs text-ink-400 mb-2">差异字符</div>
              <div className="font-mono text-sm space-y-1">
                <div>
                  <span className="text-cinnabar">原文独有:</span>{' '}
                  {result.differentChars.text1.length > 0 ? result.differentChars.text1.join(' · ') : '无'}
                </div>
                <div>
                  <span className="text-bronze">比对独有:</span>{' '}
                  {result.differentChars.text2.length > 0 ? result.differentChars.text2.join(' · ') : '无'}
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 bg-ink-50 rounded-lg">
            <div className="text-xs text-ink-400 mb-3">对齐对比</div>
            <div className="font-mono text-sm leading-8 flex flex-wrap">
              {result.alignment.map((item, index) => (
                <span
                  key={index}
                  className={`px-1 rounded ${getAlignmentStyle(item.type)}`}
                  title={`位置 ${item.position}`}
                >
                  {item.char}
                </span>
              ))}
            </div>
            <div className="flex gap-4 mt-4 text-xs text-ink-400">
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 bg-transparent border border-ink-300 rounded" />
                匹配
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 bg-cinnabar-100 rounded" />
                不匹配
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 bg-bronze-100 rounded" />
                插入
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 bg-red-100 rounded line-through" />
                删除
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
