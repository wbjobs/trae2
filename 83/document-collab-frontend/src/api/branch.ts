import { get, post, put, del } from './request'

export interface DocumentBranchDTO {
  id: string
  documentId: string
  tenantId: string
  name: string
  description?: string
  baseVersionId?: string
  baseVersionNumber?: number
  currentVersionId?: string
  currentVersionNumber?: number
  createdBy: string
  createdAt: string
  updatedAt: string
  status: string
  isDefault: boolean
  versionCount?: number
}

export interface BranchCreateDTO {
  name: string
  description?: string
  baseVersionId?: string
  baseVersionNumber?: number
}

export interface BranchMergeDTO {
  sourceBranchId: string
  targetBranchId: string
  mergeStrategy?: string
  changeLog?: string
}

export const branchApi = {
  create: (documentId: string, data: BranchCreateDTO) =>
    post<DocumentBranchDTO>(`/documents/${documentId}/branches`, data),
  getList: (documentId: string) =>
    get<DocumentBranchDTO[]>(`/documents/${documentId}/branches`),
  getDefault: (documentId: string) =>
    get<DocumentBranchDTO>(`/documents/${documentId}/branches/default`),
  switchBranch: (documentId: string, branchId: string) =>
    post<DocumentBranchDTO>(`/documents/${documentId}/branches/${branchId}/switch`),
  merge: (documentId: string, data: BranchMergeDTO) =>
    post<DocumentBranchDTO>(`/documents/${documentId}/branches/merge`, data),
  update: (documentId: string, branchId: string, name: string, description?: string) =>
    put<DocumentBranchDTO>(`/documents/${documentId}/branches/${branchId}?name=${encodeURIComponent(name)}${description ? '&description=' + encodeURIComponent(description) : ''}`),
  delete: (documentId: string, branchId: string) =>
    del(`/documents/${documentId}/branches/${branchId}`),
}
