import { Link } from 'react-router-dom'
import {
  Image,
  Calendar,
  MoreVertical,
  Trash2,
  Pencil,
} from 'lucide-react'
import { useState } from 'react'
import type { Project } from '@/lib/types'

interface ProjectCardProps {
  project: Project
  onEdit?: (project: Project) => void
  onDelete?: (project: Project) => void
}

export default function ProjectCard({
  project,
  onEdit,
  onDelete,
}: ProjectCardProps) {
  const [menuOpen, setMenuOpen] = useState(false)

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
  }

  return (
    <div className="card-rice overflow-hidden group">
      <Link to={`/annotate/${project.id}`} className="block">
        <div className="h-40 bg-gradient-to-br from-silk to-ink-100 flex items-center justify-center relative overflow-hidden">
          <div className="flex flex-col items-center gap-2">
            <div className="w-16 h-16 bg-rice rounded-lg border-2 border-ink-200 flex items-center justify-center">
              <Image className="w-8 h-8 text-ink-300" />
            </div>
            <span className="text-ink-300 text-sm">暂无缩略图</span>
          </div>
        </div>
      </Link>

      <div className="p-4">
        <div className="flex items-start justify-between mb-2">
          <Link
            to={`/annotate/${project.id}`}
            className="chinese-title text-lg font-bold text-ink hover:text-cinnabar transition-colors"
          >
            {project.name}
          </Link>
          <div className="relative">
            <button
              onClick={(e) => {
                e.preventDefault()
                setMenuOpen(!menuOpen)
              }}
              className="p-1 hover:bg-ink-100 rounded transition-colors"
            >
              <MoreVertical className="w-4 h-4 text-ink-400" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-7 w-32 bg-rice border border-ink-100 rounded-lg shadow-lg z-10 py-1">
                {onEdit && (
                  <button
                    onClick={(e) => {
                      e.preventDefault()
                      onEdit(project)
                      setMenuOpen(false)
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-ink hover:bg-ink-50"
                  >
                    <Pencil className="w-4 h-4" />
                    编辑
                  </button>
                )}
                {onDelete && (
                  <button
                    onClick={(e) => {
                      e.preventDefault()
                      onDelete(project)
                      setMenuOpen(false)
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-cinnabar hover:bg-cinnabar-50"
                  >
                    <Trash2 className="w-4 h-4" />
                    删除
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <p className="text-sm text-ink-500 line-clamp-2 mb-3">
          {project.description || '暂无描述'}
        </p>

        <div className="flex items-center justify-between text-xs text-ink-400">
          <span className="flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" />
            {formatDate(project.updated_at)}
          </span>
        </div>
      </div>
    </div>
  )
}
