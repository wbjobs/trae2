import { get, post, put, del } from './request'

export interface DocumentCreateDTO {
  name: string
  description?: string
}

export interface DocumentDTO {
  id: string
  tenantId: string
  name: string
  description?: string
  currentVersionId?: string
  currentVersionNumber?: number
  version: number
  createdBy: string
  createdAt: string
  updatedAt: string
}

export const documentApi = {
  create: (data: DocumentCreateDTO) => post<DocumentDTO>('/documents', data),
  getList: () => get<DocumentDTO[]>('/documents'),
  getById: (id: string) => get<DocumentDTO>(`/documents/${id}`),
  update: (id: string, name: string, description?: string) =>
    put<DocumentDTO>(`/documents/${id}?name=${encodeURIComponent(name)}${description ? '&description=' + encodeURIComponent(description) : ''}`),
  delete: (id: string) => del(`/documents/${id}`),
}
