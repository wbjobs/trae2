import { get, post, del } from './request'

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

export const versionApi = {
  create: (documentId: string, file: File, changeLog?: string) => {
    const formData = new FormData()
    formData.append('file', file)
    if (changeLog) formData.append('changeLog', changeLog)
    return post<DocumentVersionDTO>(`/documents/${documentId}/versions`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  saveContent: (documentId: string, content: string, changeLog?: string, expectedVersion?: number) =>
    post<DocumentVersionDTO>(`/documents/${documentId}/content`, { content, changeLog, expectedVersion }),
  getVersions: (documentId: string) => get<DocumentVersionDTO[]>(`/documents/${documentId}/versions`),
  getLatest: (documentId: string) => get<DocumentVersionDTO>(`/documents/${documentId}/versions/latest`),
  getByNumber: (documentId: string, versionNumber: number) =>
    get<DocumentVersionDTO>(`/documents/${documentId}/versions/${versionNumber}`),
  getContent: (documentId: string, versionNumber: number) =>
    get<string>(`/documents/${documentId}/versions/${versionNumber}/content`),
  restore: (documentId: string, versionNumber: number) =>
    post<DocumentVersionDTO>(`/documents/${documentId}/versions/${versionNumber}/restore`),
  deleteVersion: (versionId: string) => del(`/documents/versions/${versionId}`),
  getDownloadUrl: (documentId: string, versionNumber: number) =>
    `/api/documents/${documentId}/versions/${versionNumber}/download`,
}
