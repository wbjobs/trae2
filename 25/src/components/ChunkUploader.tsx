import { useState, useRef, useCallback } from 'react'
import {
  Upload,
  X,
  FileUp,
  CheckCircle,
  AlertCircle,
  Pause,
  Play,
} from 'lucide-react'
import { chunkUpload, formatFileSize } from '@/lib/chunkUpload'

interface ChunkUploaderProps {
  projectId: number
  onUploadComplete?: (filePath: string, fileName: string) => void
  onUploadError?: (error: Error) => void
}

export default function ChunkUploader({
  projectId,
  onUploadComplete,
  onUploadError,
}: ChunkUploaderProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [uploadedBytes, setUploadedBytes] = useState(0)
  const [totalBytes, setTotalBytes] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [currentFile, setCurrentFile] = useState<File | null>(null)
  const [isPaused, setIsPaused] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = useCallback(
    async (file: File) => {
      setCurrentFile(file)
      setTotalBytes(file.size)
      setUploadedBytes(0)
      setProgress(0)
      setError(null)
      setSuccess(false)
      setIsPaused(false)

      setUploading(true)
      try {
        const result = await chunkUpload({
          file,
          chunkSize: 5 * 1024 * 1024,
          onProgress: (progress, uploaded, total) => {
            setProgress(progress)
            setUploadedBytes(uploaded)
            setTotalBytes(total)
          },
        })

        setSuccess(true)
        onUploadComplete?.(result.filePath, file.name)

        setTimeout(() => {
          setSuccess(false)
          setUploading(false)
          setCurrentFile(null)
          setProgress(0)
        }, 2000)
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : '上传失败'
        setError(errorMessage)
        onUploadError?.(err instanceof Error ? err : new Error(errorMessage))
      } finally {
        setUploading(false)
      }
    },
    [onUploadComplete, onUploadError]
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)

      const files = e.dataTransfer.files
      if (files.length > 0) {
        handleFileSelect(files[0])
      }
    },
    [handleFileSelect]
  )

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (files && files.length > 0) {
        handleFileSelect(files[0])
      }
    },
    [handleFileSelect]
  )

  const handleCancel = useCallback(() => {
    setUploading(false)
    setCurrentFile(null)
    setProgress(0)
    setError(null)
    setIsPaused(false)
  }, [])

  return (
    <div className="card-rice p-4">
      <div
        className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
          isDragging
            ? 'border-cinnabar bg-cinnabar-50'
            : 'border-ink-200 hover:border-ink-400'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleInputChange}
          className="hidden"
          disabled={uploading}
        />

        {uploading ? (
          <div className="space-y-4">
            <div className="flex items-center justify-center gap-3">
              <div className="w-12 h-12 rounded-full bg-ink-100 flex items-center justify-center">
                <FileUp className="w-6 h-6 text-ink-400" />
              </div>
              <div className="text-left">
                <div className="text-sm font-medium text-ink">{currentFile?.name}</div>
                <div className="text-xs text-ink-400">
                  {formatFileSize(uploadedBytes)} / {formatFileSize(totalBytes)}
                </div>
              </div>
            </div>

            <div className="w-full bg-ink-100 rounded-full h-2 overflow-hidden">
              <div
                className="h-full bg-cinnabar transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>

            <div className="flex items-center justify-center gap-4">
              <span className="text-2xl font-bold text-ink">{Math.round(progress)}%</span>
              <div className="flex gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setIsPaused(!isPaused)
                  }}
                  className="p-2 hover:bg-ink-100 rounded-lg"
                  disabled
                >
                  {isPaused ? (
                    <Play className="w-4 h-4 text-ink-400" />
                  ) : (
                    <Pause className="w-4 h-4 text-ink-400" />
                  )}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleCancel()
                  }}
                  className="p-2 hover:bg-cinnabar-50 rounded-lg"
                >
                  <X className="w-4 h-4 text-cinnabar" />
                </button>
              </div>
            </div>
          </div>
        ) : success ? (
          <div className="space-y-2">
            <CheckCircle className="w-12 h-12 text-bronze mx-auto" />
            <div className="text-bronze font-medium">上传成功！</div>
          </div>
        ) : error ? (
          <div className="space-y-2">
            <AlertCircle className="w-12 h-12 text-cinnabar mx-auto" />
            <div className="text-cinnabar font-medium">上传失败</div>
            <div className="text-xs text-cinnabar-600">{error}</div>
            <button
              onClick={(e) => {
                e.stopPropagation()
                setError(null)
                if (currentFile) {
                  handleFileSelect(currentFile)
                }
              }}
              className="mt-2 px-4 py-1 text-sm bg-cinnabar-50 text-cinnabar rounded hover:bg-cinnabar-100"
            >
              重试
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <Upload className="w-12 h-12 text-ink-400 mx-auto" />
            <div className="text-ink font-medium">点击或拖拽上传拓片图片</div>
            <div className="text-xs text-ink-400">支持 JPG、PNG、TIFF 格式，最大 500MB</div>
            <div className="text-xs text-ink-300 mt-1">使用分片上传，支持断点续传</div>
          </div>
        )}
      </div>
    </div>
  )
}
