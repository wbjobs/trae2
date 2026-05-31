import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { Plus, Search, FolderOpen, ClipboardCheck, Image, Edit3 } from 'lucide-react'
import { useProjectStore } from '@/stores/projectStore'
import ProjectCard from '@/components/ProjectCard'
import type { Project, CreateProjectRequest } from '@/lib/types'

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => {
      clearTimeout(handler)
    }
  }, [value, delay])

  return debouncedValue
}

export default function Dashboard() {
  const projects = useProjectStore((s) => s.projects)
  const loading = useProjectStore((s) => s.loading)
  const error = useProjectStore((s) => s.error)
  const fetchProjects = useProjectStore((s) => s.fetchProjects)
  const createProject = useProjectStore((s) => s.createProject)
  const deleteProject = useProjectStore((s) => s.deleteProject)
  const updateProject = useProjectStore((s) => s.updateProject)

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [formData, setFormData] = useState<CreateProjectRequest>({
    name: '',
    description: '',
  })

  const debouncedSearchQuery = useDebounce(searchQuery, 300)

  useEffect(() => {
    fetchProjects()
  }, [fetchProjects])

  const filteredProjects = useMemo(
    () =>
      projects.filter(
        (p) =>
          p.name.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
          p.description.toLowerCase().includes(debouncedSearchQuery.toLowerCase())
      ),
    [projects, debouncedSearchQuery]
  )

  const stats = useMemo(
    () => ({
      total: projects.length,
    }),
    [projects.length]
  )

  const handleCreate = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      try {
        await createProject(formData)
        setShowCreateModal(false)
        setFormData({ name: '', description: '' })
      } catch {
        // error handled in store
      }
    },
    [createProject, formData]
  )

  const handleEdit = useCallback((project: Project) => {
    setEditingProject(project)
    setFormData({ name: project.name, description: project.description })
    setShowEditModal(true)
  }, [])

  const handleUpdate = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (!editingProject) return
      try {
        await updateProject(editingProject.id, formData)
        setShowEditModal(false)
        setEditingProject(null)
        setFormData({ name: '', description: '' })
      } catch {
        // error handled in store
      }
    },
    [updateProject, editingProject, formData]
  )

  const handleDelete = useCallback(
    async (project: Project) => {
      if (!confirm(`确定要删除项目 "${project.name}" 吗？此操作不可撤销。`)) return
      try {
        await deleteProject(project.id)
      } catch {
        // error handled in store
      }
    },
    [deleteProject]
  )

  const handleCloseModal = useCallback(() => {
    setShowCreateModal(false)
    setShowEditModal(false)
    setEditingProject(null)
    setFormData({ name: '', description: '' })
  }, [])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="chinese-title text-2xl font-bold text-ink">项目总览</h2>
          <p className="text-ink-400 text-sm mt-1">管理和查看所有勘校项目</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-cinnabar text-rice rounded-lg hover:bg-cinnabar-500 transition-colors shadow-md"
        >
          <Plus className="w-5 h-5" />
          新建项目
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card-rice p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-ink-100 rounded-lg flex items-center justify-center">
              <FolderOpen className="w-5 h-5 text-ink" />
            </div>
            <div>
              <p className="text-2xl font-bold text-ink">{stats.total}</p>
              <p className="text-xs text-ink-400">项目总数</p>
            </div>
          </div>
        </div>
        <div className="card-rice p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-bronze-100 rounded-lg flex items-center justify-center">
              <Edit3 className="w-5 h-5 text-bronze" />
            </div>
            <div>
              <p className="text-2xl font-bold text-ink">--</p>
              <p className="text-xs text-ink-400">进行中</p>
            </div>
          </div>
        </div>
        <div className="card-rice p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-cinnabar-100 rounded-lg flex items-center justify-center">
              <Image className="w-5 h-5 text-cinnabar" />
            </div>
            <div>
              <p className="text-2xl font-bold text-ink">--</p>
              <p className="text-xs text-ink-400">拓片图片</p>
            </div>
          </div>
        </div>
        <div className="card-rice p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-silk-100 rounded-lg flex items-center justify-center">
              <ClipboardCheck className="w-5 h-5 text-ink-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-ink">--</p>
              <p className="text-xs text-ink-400">标注总数</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-ink-300" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索项目..."
            className="input-ink pl-10"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-12 h-12 border-4 border-ink-200 border-t-cinnabar rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="card-rice p-8 text-center">
          <p className="text-cinnabar">{error}</p>
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="card-rice p-12 text-center">
          <FolderOpen className="w-16 h-16 mx-auto text-ink-200 mb-4" />
          <p className="text-ink-400 mb-4">
            {searchQuery ? '没有找到匹配的项目' : '暂无项目'}
          </p>
          {!searchQuery && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="btn-cinnabar"
            >
              创建第一个项目
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProjects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {(showCreateModal || showEditModal) && (
        <div className="fixed inset-0 bg-ink-700/50 flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-rice rounded-xl shadow-2xl w-full max-w-md animate-slide-up">
            <div className="p-6 border-b border-ink-100">
              <h3 className="chinese-title text-xl font-bold text-ink">
                {showCreateModal ? '新建项目' : '编辑项目'}
              </h3>
            </div>
            <form onSubmit={showCreateModal ? handleCreate : handleUpdate} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-ink mb-2">
                  项目名称
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  className="input-ink"
                  placeholder="请输入项目名称"
                  required
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink mb-2">
                  项目描述
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  className="input-ink resize-none"
                  placeholder="请输入项目描述"
                  rows={3}
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="flex-1 btn-outline-ink"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="flex-1 btn-cinnabar"
                >
                  {showCreateModal ? '创建' : '保存'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
