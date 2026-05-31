import api from '@/lib/api'

export interface ChunkUploadOptions {
  file: File
  chunkSize?: number
  onProgress?: (progress: number, uploadedBytes: number, totalBytes: number) => void
  onChunkUploaded?: (chunkNumber: number, totalChunks: number) => void
  onError?: (error: Error) => void
}

export interface ChunkUploadResult {
  uploadId: string
  filePath: string
}

const DEFAULT_CHUNK_SIZE = 5 * 1024 * 1024

export async function chunkUpload(options: ChunkUploadOptions): Promise<ChunkUploadResult> {
  const { file, chunkSize = DEFAULT_CHUNK_SIZE, onProgress, onChunkUploaded, onError } = options

  const totalChunks = Math.ceil(file.size / chunkSize)
  let uploadedChunks = 0
  let uploadId: string | null = null

  try {
    const initResponse = await fetch('/api/upload/chunk/init', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('token')}`,
      },
      body: JSON.stringify({
        fileName: file.name,
        fileSize: file.size,
        chunkSize,
      }),
    })

    const initData = await initResponse.json()
    if (!initData.success) {
      throw new Error(initData.error || '初始化上传失败')
    }

    uploadId = initData.data.uploadId

    const uploadPromises: Promise<void>[] = []
    const concurrency = 3

    for (let i = 0; i < totalChunks; i += concurrency) {
      const batch = []
      for (let j = i; j < Math.min(i + concurrency, totalChunks); j++) {
        batch.push(uploadSingleChunk(file, j, chunkSize, uploadId!))
      }

      const results = await Promise.allSettled(batch)

      for (const result of results) {
        if (result.status === 'fulfilled') {
          uploadedChunks++
          onChunkUploaded?.(uploadedChunks, totalChunks)
          onProgress?.((uploadedChunks / totalChunks) * 100, uploadedChunks * chunkSize, file.size)
        } else {
          onError?.(result.reason)
          throw result.reason
        }
      }
    }

    const statusResponse = await fetch(`/api/upload/chunk/${uploadId}/status`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token')}`,
      },
    })
    const statusData = await statusResponse.json()

    if (statusData.data?.complete) {
      return {
        uploadId,
        filePath: statusData.data.filePath,
      }
    }

    const missingResponse = await fetch(`/api/upload/chunk/${uploadId}/missing`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token')}`,
      },
    })
    const missingData = await missingResponse.json()

    if (missingData.data?.missing?.length > 0) {
      throw new Error(`还有 ${missingData.data.missing.length} 个分片上传失败`)
    }

    throw new Error('上传未完成，请重试')
  } catch (error) {
    if (uploadId) {
      fetch(`/api/upload/chunk/${uploadId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      }).catch(() => {})
    }
    throw error
  }
}

async function uploadSingleChunk(
  file: File,
  chunkNumber: number,
  chunkSize: number,
  uploadId: string
): Promise<void> {
  const start = chunkNumber * chunkSize
  const end = Math.min(start + chunkSize, file.size)
  const chunk = file.slice(start, end)

  const response = await fetch(`/api/upload/chunk/${uploadId}/${chunkNumber}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${localStorage.getItem('token')}`,
      'Content-Type': 'application/octet-stream',
    },
    body: chunk,
  })

  if (!response.ok) {
    throw new Error(`分片 ${chunkNumber} 上传失败`)
  }
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}
