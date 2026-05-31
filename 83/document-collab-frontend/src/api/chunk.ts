import { post, get } from './request'

export interface ChunkUploadResponse {
  uploadId: string
  chunkIndex: number
  status: 'CHUNK_UPLOADED' | 'CHUNKS_COMPLETE' | 'EXISTS' | 'NOT_EXISTS' | 'MERGED' | 'CANCELLED'
  mergedVersion?: DocumentVersionDTO
}

export interface DocumentVersionDTO {
  id: string
  documentId: string
  tenantId: string
  versionNumber: number
  baseVersionNumber: number | null
  fileName: string
  filePath: string
  fileSize: number
  mimeType: string
  snapshotHash: string
  changeLog?: string
  createdBy: string
  createdAt: string
  isLatest: boolean
}

export const chunkApi = {
  uploadChunk: (
    documentId: string,
    params: {
      chunkData: Blob
      fileName: string
      fileSize: number
      totalChunks: number
      chunkIndex: number
      chunkSize: number
      uploadId?: string
      fileHash?: string
      mimeType?: string
      changeLog?: string
    }
  ) => {
    const formData = new FormData()
    formData.append('chunkData', params.chunkData)
    formData.append('fileName', params.fileName)
    formData.append('fileSize', String(params.fileSize))
    formData.append('totalChunks', String(params.totalChunks))
    formData.append('chunkIndex', String(params.chunkIndex))
    formData.append('chunkSize', String(params.chunkSize))
    if (params.uploadId) formData.append('uploadId', params.uploadId)
    if (params.fileHash) formData.append('fileHash', params.fileHash)
    if (params.mimeType) formData.append('mimeType', params.mimeType)
    if (params.changeLog) formData.append('changeLog', params.changeLog)

    return post<ChunkUploadResponse>(
      `/documents/${documentId}/chunks`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    )
  },
  checkChunk: (documentId: string, uploadId: string, chunkIndex: number) =>
    get<ChunkUploadResponse>(`/documents/${documentId}/chunks/check?uploadId=${uploadId}&chunkIndex=${chunkIndex}`),
  mergeChunks: (documentId: string, uploadId: string) =>
    post<ChunkUploadResponse>(`/documents/${documentId}/chunks/merge?uploadId=${uploadId}`),
  cancelUpload: (documentId: string, uploadId: string) =>
    post<ChunkUploadResponse>(`/documents/${documentId}/chunks/cancel?uploadId=${uploadId}`),
}
