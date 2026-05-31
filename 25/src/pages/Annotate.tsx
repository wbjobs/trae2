import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ChevronLeft, Image, Save, RefreshCw } from 'lucide-react'
import { useProjectStore } from '@/stores/projectStore'
import { useAnnotationStore } from '@/stores/annotationStore'
import { useAuthStore } from '@/stores/authStore'
import AnnotationCanvas from '@/components/AnnotationCanvas'
import AnnotationToolbar from '@/components/AnnotationToolbar'
import AnnotationList from '@/components/AnnotationList'

export default function Annotate() {
  const { projectId, imageId: imageIdParam } = useParams<{ projectId: string; imageId?: string }>()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)

  const currentProject = useProjectStore((s) => s.currentProject)
  const images = useProjectStore((s) => s.images)
  const fetchProject = useProjectStore((s) => s.fetchProject)
  const fetchImages = useProjectStore((s) => s.fetchImages)
  const loading = useProjectStore((s) => s.loading)

  const annotations = useAnnotationStore((s) => s.annotations)
  const fetchAnnotations = useAnnotationStore((s) => s.fetchAnnotations)
  const setAnnotations = useAnnotationStore((s) => s.setAnnotations)

  const [selectedImageId, setSelectedImageId] = useState<number | null>(
    imageIdParam ? parseInt(imageIdParam) : null
  )
  const [isSaving, setIsSaving] = useState(false)

  const projectIdNum = projectId ? parseInt(projectId) : 0

  useEffect(() => {
    if (projectIdNum) {
      fetchProject(projectIdNum)
      fetchImages(projectIdNum)
    }
  }, [projectIdNum, fetchProject, fetchImages])

  useEffect(() => {
    if (images.length > 0 && !selectedImageId) {
      setSelectedImageId(images[0].id)
    }
  }, [images, selectedImageId])

  useEffect(() => {
    if (selectedImageId) {
      localStorage.setItem('selectedImageId', String(selectedImageId))
      fetchAnnotations(selectedImageId)
    }
  }, [selectedImageId, fetchAnnotations])

  const selectedImage = images.find((img) => img.id === selectedImageId)

  const handleSave = async () => {
    setIsSaving(true)
    try {
      await new Promise((resolve) => setTimeout(resolve, 500))
    } finally {
      setIsSaving(false)
    }
  }

  if (loading && !currentProject) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="w-12 h-12 border-4 border-ink-200 border-t-cinnabar rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="h-[calc(100vh-5rem)] flex flex-col gap-4">
      <div className="flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-1 text-ink-400 hover:text-ink transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
            <span>返回</span>
          </button>
          <div className="h-6 w-px bg-ink-200" />
          <div>
            <h2 className="chinese-title text-xl font-bold text-ink">
              {currentProject?.name || '加载中...'}
            </h2>
            {selectedImage && (
              <p className="text-sm text-ink-400">
                {selectedImage.file_name}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-ink-400">
            {annotations.length} 个标注
          </span>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-4 py-2 bg-bronze text-rice rounded-lg hover:bg-bronze-600 transition-colors disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {isSaving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>

      <div className="flex flex-1 gap-4 min-h-0">
        <div className="w-48 flex-shrink-0 flex flex-col gap-2 overflow-y-auto">
          <p className="text-xs text-ink-400 uppercase tracking-wider px-2">
            图片列表 ({images.length})
          </p>
          {images.map((img) => (
            <button
              key={img.id}
              onClick={() => setSelectedImageId(img.id)}
              className={`p-2 rounded-lg border-2 transition-all duration-200 text-left ${
                selectedImageId === img.id
                  ? 'border-cinnabar bg-cinnabar-50'
                  : 'border-ink-100 bg-rice hover:border-ink-200'
              }`}
            >
              <div className="aspect-video bg-ink-100 rounded mb-2 flex items-center justify-center overflow-hidden">
                <img
                  src={img.file_path}
                  alt={img.file_name}
                  className="w-full h-full object-cover"
                />
              </div>
              <p className="text-xs text-ink-500 truncate">
                {img.file_name}
              </p>
            </button>
          ))}
          {images.length === 0 && (
            <div className="text-center py-8 text-ink-300 text-sm">
              <Image className="w-10 h-10 mx-auto mb-2 opacity-50" />
              暂无图片
            </div>
          )}
        </div>

        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          {selectedImage ? (
            <>
              <AnnotationToolbar />
              <div className="flex-1 min-h-0 mt-3">
                <AnnotationCanvas
                  imageUrl={selectedImage.file_path}
                  imageWidth={1200}
                  imageHeight={800}
                  projectId={projectIdNum}
                  imageId={selectedImage.id}
                />
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center bg-ink-950 rounded-lg">
              <div className="text-center text-ink-400">
                <Image className="w-16 h-16 mx-auto mb-4 opacity-50" />
                <p>请选择一张图片开始标注</p>
              </div>
            </div>
          )}
        </div>

        <div className="w-72 flex-shrink-0 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-ink">标注列表</h3>
            <button
              onClick={() => selectedImageId && fetchAnnotations(selectedImageId)}
              className="p-1.5 hover:bg-ink-100 rounded transition-colors"
              title="刷新"
            >
              <RefreshCw className="w-4 h-4 text-ink-400" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto pr-1">
            <AnnotationList />
          </div>
        </div>
      </div>
    </div>
  )
}
