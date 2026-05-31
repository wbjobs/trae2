import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  GitCompare,
  ChevronDown,
  ArrowRight,
  Calendar,
  User,
  FileText,
  CheckCircle2,
  XCircle,
  Minus,
  Plus,
  Loader2,
  AlertCircle,
  Image as ImageIcon,
  Download,
  FileSpreadsheet,
  FileJson,
  FileCode,
  Copy,
} from 'lucide-react'
import type { Version, Annotation } from '@/lib/types'
import api from '@/lib/api'

interface DiffLine {
  type: 'added' | 'removed' | 'unchanged'
  content: string
}

interface VersionDiffData {
  added: Annotation[]
  removed: Annotation[]
  modified: Array<{ old: Annotation; new: Annotation }>
  version1: Version
  version2: Version
}

interface VersionDiff {
  added: Annotation[]
  removed: Annotation[]
  modified: Array<{ old: Annotation; new: Annotation }>
}

export default function Versions() {
  const [versions, setVersions] = useState<Version[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [leftVersionId, setLeftVersionId] = useState<number | null>(null)
  const [rightVersionId, setRightVersionId] = useState<number | null>(null)
  const [showDropdown, setShowDropdown] = useState<'left' | 'right' | null>(null)
  const [diffData, setDiffData] = useState<VersionDiffData | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)
  const [selectedImageId, setSelectedImageId] = useState<number | null>(null)
  const [exportFormat, setExportFormat] = useState<string | null>(null)
  const [exportLoading, setExportLoading] = useState(false)
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null)
  const [exportPreview, setExportPreview] = useState<any>(null)

  useEffect(() => {
    const savedImageId = localStorage.getItem('selectedImageId')
    const savedProjectId = localStorage.getItem('selectedProjectId')
    if (savedImageId) {
      const id = Number(savedImageId)
      setSelectedImageId(id)
      loadVersions(id)
    }
    if (savedProjectId) {
      setSelectedProjectId(Number(savedProjectId))
      loadExportPreview(Number(savedProjectId))
    }
  }, [])

  useEffect(() => {
    if (selectedImageId && leftVersionId && rightVersionId) {
      loadDiff(selectedImageId, leftVersionId, rightVersionId)
    }
  }, [leftVersionId, rightVersionId, selectedImageId])

  const loadVersions = useCallback(async (imageId: number) => {
    try {
      setLoading(true)
      setError(null)
      const data = await api.versions.list(imageId)
      setVersions(data)
      if (data.length >= 2) {
        setLeftVersionId(data[data.length - 1].id)
        setRightVersionId(data[0].id)
      } else if (data.length === 1) {
        setLeftVersionId(data[0].id)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载版本列表失败')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadDiff = useCallback(
    async (imageId: number, v1: number, v2: number) => {
      try {
        setDiffLoading(true)
        const response = await fetch(`/api/images/${imageId}/versions/${v1}/diff/${v2}`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
        })
        const data = await response.json()
        if (data.success) {
          setDiffData(data.data)
        } else {
          setDiffData(null)
        }
      } catch {
        setDiffData(null)
      } finally {
        setDiffLoading(false)
      }
    },
    []
  )

  const loadExportPreview = useCallback(async (projectId: number) => {
    try {
      const response = await fetch(`/api/projects/${projectId}/export/preview`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      })
      const data = await response.json()
      if (data.success) {
        setExportPreview(data.data)
      }
    } catch {
      // ignore
    }
  }, [])

  const handleExport = useCallback(
    async (format: string) => {
      if (!selectedProjectId) return
      setExportLoading(true)
      try {
        const response = await fetch(`/api/projects/${selectedProjectId}/export?format=${format}`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
        })
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        const ext = format === 'markdown' ? 'md' : format
        a.download = `勘校意见_${new Date().toISOString().split('T')[0]}.${ext}`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        window.URL.revokeObjectURL(url)
      } catch (err) {
        console.error('导出失败:', err)
      } finally {
        setExportLoading(false)
        setExportFormat(null)
      }
    },
    [selectedProjectId]
  )

  const leftVersion = useMemo(
    () => versions.find((v) => v.id === leftVersionId),
    [versions, leftVersionId]
  )
  const rightVersion = useMemo(
    () => versions.find((v) => v.id === rightVersionId),
    [versions, rightVersionId]
  )

  const getLineIcon = (type: DiffLine['type']) => {
    switch (type) {
      case 'added':
        return <Plus className="w-3.5 h-3.5 text-bronze" />
      case 'removed':
        return <Minus className="w-3.5 h-3.5 text-cinnabar" />
      default:
        return <span className="w-3.5 h-3.5" />
    }
  }

  const getLineStyle = (type: DiffLine['type']) => {
    switch (type) {
      case 'added':
        return 'bg-bronze-50 border-l-2 border-bronze'
      case 'removed':
        return 'bg-cinnabar-50 border-l-2 border-cinnabar'
      default:
        return ''
    }
  }

  const generateDiffLines = useCallback((): DiffLine[] => {
    const lines: DiffLine[] = []
    lines.push({ type: 'unchanged', content: '## 拓片标注差异对比' })
    lines.push({ type: 'unchanged', content: '' })

    if (!diffData) return lines

    if (diffData.added.length > 0) {
      lines.push({ type: 'unchanged', content: '### 新增标注' })
      diffData.added.forEach((a) => {
        lines.push({
          type: 'added',
          content: `- 新增：${a.content || '未命名标注'}（位置: ${a.x},${a.y},${a.width},${a.height}）`,
        })
      })
      lines.push({ type: 'unchanged', content: '' })
    }

    if (diffData.removed.length > 0) {
      lines.push({ type: 'unchanged', content: '### 删除标注' })
      diffData.removed.forEach((a) => {
        lines.push({
          type: 'removed',
          content: `- 删除：${a.content || '未命名标注'}（位置: ${a.x},${a.y},${a.width},${a.height}）`,
        })
      })
      lines.push({ type: 'unchanged', content: '' })
    }

    if (diffData.modified.length > 0) {
      lines.push({ type: 'unchanged', content: '### 修改标注' })
      diffData.modified.forEach(({ old: oldA, new: newA }) => {
        lines.push({
          type: 'removed',
          content: `- 旧：${oldA.content || '未命名标注'}（位置: ${oldA.x},${oldA.y},${oldA.width},${oldA.height}）`,
        })
        lines.push({
          type: 'added',
          content: `+ 新：${newA.content || '未命名标注'}（位置: ${newA.x},${newA.y},${newA.width},${newA.height}）`,
        })
      })
    }

    if (lines.length === 2) {
      lines.push({ type: 'unchanged', content: '两个版本无差异' })
    }

    return lines
  }, [diffData])

  const getImageUrl = (version: Version) => {
    return `/api/uploads/${version.file_path}`
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-ink-400" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="chinese-title text-2xl font-bold text-ink">版本对比</h2>
          <p className="text-ink-400 text-sm mt-1">对比不同版本的标注差异</p>
        </div>

        {exportPreview && (
          <div className="relative">
            <button
              onClick={() => setExportFormat(exportFormat === null ? 'json' : null)}
              disabled={exportLoading}
              className="flex items-center gap-2 px-4 py-2 bg-ink text-rice rounded-lg hover:bg-ink-700 transition-colors disabled:opacity-50"
            >
              {exportLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              导出勘校意见
              <ChevronDown className="w-4 h-4" />
            </button>
            {exportFormat !== null && (
              <div className="absolute right-0 top-full mt-2 bg-rice border border-ink-100 rounded-lg shadow-lg z-20 min-w-[160px]">
                <button
                  onClick={() => handleExport('json')}
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-ink-50 text-left"
                >
                  <FileJson className="w-4 h-4 text-ink-400" />
                  JSON 格式
                </button>
                <button
                  onClick={() => handleExport('csv')}
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-ink-50 text-left"
                >
                  <FileSpreadsheet className="w-4 h-4 text-ink-400" />
                  CSV 格式
                </button>
                <button
                  onClick={() => handleExport('html')}
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-ink-50 text-left"
                >
                  <FileCode className="w-4 h-4 text-ink-400" />
                  HTML 报告
                </button>
                <button
                  onClick={() => handleExport('markdown')}
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-ink-50 text-left"
                >
                  <FileText className="w-4 h-4 text-ink-400" />
                  Markdown 文档
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {exportPreview && (
        <div className="grid grid-cols-4 gap-4">
          <div className="card-rice p-4 text-center">
            <div className="text-3xl font-bold text-ink">{exportPreview.reviewCount}</div>
            <div className="text-xs text-ink-400 mt-1">总审核数</div>
          </div>
          <div className="card-rice p-4 text-center">
            <div className="text-3xl font-bold text-bronze">{exportPreview.statistics.approved}</div>
            <div className="text-xs text-ink-400 mt-1">通过</div>
          </div>
          <div className="card-rice p-4 text-center">
            <div className="text-3xl font-bold text-cinnabar">{exportPreview.statistics.rejected}</div>
            <div className="text-xs text-ink-400 mt-1">驳回</div>
          </div>
          <div className="card-rice p-4 text-center">
            <div className="text-3xl font-bold text-silk">{exportPreview.statistics.pending}</div>
            <div className="text-xs text-ink-400 mt-1">待审核</div>
          </div>
        </div>
      )}

      <div className="card-rice p-4">
        <div className="flex items-center justify-center gap-4 flex-wrap">
          <div className="relative">
            <button
              onClick={() => setShowDropdown(showDropdown === 'left' ? null : 'left')}
              disabled={versions.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-rice border-2 border-ink-100 rounded-lg hover:border-ink-200 transition-colors min-w-[200px] disabled:opacity-50"
            >
              <GitCompare className="w-4 h-4 text-ink-400" />
              <span className="text-sm text-ink">
                v{leftVersion?.version_number || '选择版本'}
              </span>
              <ChevronDown className="w-4 h-4 text-ink-400 ml-auto" />
            </button>
            {showDropdown === 'left' && (
              <div className="absolute top-full left-0 mt-2 w-full bg-rice border border-ink-100 rounded-lg shadow-lg z-10 max-h-60 overflow-y-auto">
                {versions.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => {
                      setLeftVersionId(v.id)
                      setShowDropdown(null)
                    }}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-ink-50"
                  >
                    v{v.version_number}
                  </button>
                ))}
              </div>
            )}
          </div>

          <ArrowRight className="w-6 h-6 text-ink-300" />

          <div className="relative">
            <button
              onClick={() => setShowDropdown(showDropdown === 'right' ? null : 'right')}
              disabled={versions.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-cinnabar-50 border-2 border-cinnabar-200 rounded-lg hover:border-cinnabar transition-colors min-w-[200px] disabled:opacity-50"
            >
              <GitCompare className="w-4 h-4 text-cinnabar" />
              <span className="text-sm text-ink">
                v{rightVersion?.version_number || '选择版本'}
              </span>
              <ChevronDown className="w-4 h-4 text-cinnabar ml-auto" />
            </button>
            {showDropdown === 'right' && (
              <div className="absolute top-full left-0 mt-2 w-full bg-rice border border-ink-100 rounded-lg shadow-lg z-10 max-h-60 overflow-y-auto">
                {versions.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => {
                      setRightVersionId(v.id)
                      setShowDropdown(null)
                    }}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-ink-50"
                  >
                    v{v.version_number}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="card-rice p-8 text-center">
          <AlertCircle className="w-12 h-12 text-cinnabar mx-auto mb-4" />
          <p className="text-ink-600">{error}</p>
        </div>
      )}

      {versions.length === 0 && !error && (
        <div className="card-rice p-12 text-center">
          <ImageIcon className="w-16 h-16 text-ink-300 mx-auto mb-4" />
          <p className="text-ink-500">当前图片暂无版本记录</p>
          <p className="text-ink-400 text-sm mt-1">在标注页面提交勘校后会自动生成版本</p>
        </div>
      )}

      {leftVersion && rightVersion && (
        <>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="card-rice p-4 border-l-4 border-ink">
              <div className="flex items-center justify-between mb-3">
                <span className="chinese-title text-lg font-bold text-ink">
                  v{leftVersion.version_number}
                </span>
                <span className="text-xs text-ink-400">基础版本</span>
              </div>
              <p className="text-sm text-ink-600 mb-3">{leftVersion.description}</p>
              <div className="flex items-center gap-4 text-xs text-ink-400">
                <span className="flex items-center gap-1">
                  <User className="w-3.5 h-3.5" />
                  用户 #{leftVersion.created_by}
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  {new Date(leftVersion.created_at).toLocaleDateString('zh-CN')}
                </span>
              </div>
            </div>
            <div className="card-rice p-4 border-l-4 border-cinnabar">
              <div className="flex items-center justify-between mb-3">
                <span className="chinese-title text-lg font-bold text-ink">
                  v{rightVersion.version_number}
                </span>
                <span className="text-xs text-cinnabar">对比版本</span>
              </div>
              <p className="text-sm text-ink-600 mb-3">{rightVersion.description}</p>
              <div className="flex items-center gap-4 text-xs text-ink-400">
                <span className="flex items-center gap-1">
                  <User className="w-3.5 h-3.5" />
                  用户 #{rightVersion.created_by}
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  {new Date(rightVersion.created_at).toLocaleDateString('zh-CN')}
                </span>
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="card-rice overflow-hidden">
              <div className="px-4 py-2 border-b border-ink-100 bg-ink-50 flex items-center justify-between">
                <span className="text-sm font-medium text-ink flex items-center gap-2">
                  <ImageIcon className="w-4 h-4" />
                  v{leftVersion.version_number} 图像
                </span>
                <span className="text-xs text-ink-400">
                  {leftVersion.file_path.split('/').pop()}
                </span>
              </div>
              <div className="bg-ink-950 p-4 flex items-center justify-center min-h-[300px]">
                <img
                  src={getImageUrl(leftVersion)}
                  alt={`版本 ${leftVersion.version_number}`}
                  className="max-w-full max-h-[400px] object-contain"
                  loading="lazy"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement
                    target.style.display = 'none'
                    target.nextElementSibling?.classList.remove('hidden')
                  }}
                />
                <div className="hidden text-ink-400 text-center">
                  <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>图像加载失败</p>
                </div>
              </div>
            </div>

            <div className="card-rice overflow-hidden">
              <div className="px-4 py-2 border-b border-ink-100 bg-cinnabar-50 flex items-center justify-between">
                <span className="text-sm font-medium text-ink flex items-center gap-2">
                  <ImageIcon className="w-4 h-4" />
                  v{rightVersion.version_number} 图像
                </span>
                <span className="text-xs text-ink-400">
                  {rightVersion.file_path.split('/').pop()}
                </span>
              </div>
              <div className="bg-ink-950 p-4 flex items-center justify-center min-h-[300px]">
                <img
                  src={getImageUrl(rightVersion)}
                  alt={`版本 ${rightVersion.version_number}`}
                  className="max-w-full max-h-[400px] object-contain"
                  loading="lazy"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement
                    target.style.display = 'none'
                    target.nextElementSibling?.classList.remove('hidden')
                  }}
                />
                <div className="hidden text-ink-400 text-center">
                  <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>图像加载失败</p>
                </div>
              </div>
            </div>
          </div>

          <div className="card-rice overflow-hidden">
            <div className="px-4 py-3 border-b border-ink-100 bg-ink-50 flex items-center justify-between">
              <h3 className="text-sm font-medium text-ink flex items-center gap-2">
                <GitCompare className="w-4 h-4" />
                差异详情
              </h3>
              {diffLoading && <Loader2 className="w-4 h-4 animate-spin text-ink-400" />}
            </div>
            <div className="p-4 font-mono text-sm overflow-x-auto max-h-96 overflow-y-auto">
              {generateDiffLines().map((line, index) => (
                <div
                  key={index}
                  className={`flex items-start gap-2 py-1 px-2 rounded ${getLineStyle(line.type)}`}
                >
                  <span className="text-ink-300 select-none w-6 text-right">
                    {index + 1}
                  </span>
                  <span className="flex-shrink-0 mt-0.5">{getLineIcon(line.type)}</span>
                  <span
                    className={
                      line.type === 'added'
                        ? 'text-bronze-700'
                        : line.type === 'removed'
                          ? 'text-cinnabar'
                          : 'text-ink-500'
                    }
                  >
                    {line.content || '\u00A0'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="card-rice overflow-hidden">
            <div className="px-4 py-3 border-b border-ink-100 bg-ink-50">
              <h3 className="text-sm font-medium text-ink">版本历史</h3>
            </div>
            <div className="divide-y divide-ink-100 max-h-80 overflow-y-auto">
              {[...versions].reverse().map((version) => (
                <div
                  key={version.id}
                  className="px-4 py-3 flex items-center justify-between hover:bg-ink-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="chinese-title font-bold text-ink">
                      v{version.version_number}
                    </span>
                    <span className="text-xs text-ink-400">
                      {new Date(version.created_at).toLocaleDateString('zh-CN')}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-ink-600">
                      用户 #{version.created_by}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full ${
                        version.id === rightVersionId
                          ? 'bg-cinnabar-50 text-cinnabar'
                          : 'bg-ink-50 text-ink-400'
                      }`}
                    >
                      {version.id === rightVersionId ? (
                        <CheckCircle2 className="w-3 h-3" />
                      ) : (
                        <XCircle className="w-3 h-3" />
                      )}
                      {version.id === rightVersionId ? '当前对比' : '历史版本'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
