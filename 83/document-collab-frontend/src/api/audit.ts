import { get } from './request'

export interface AuditLogDTO {
  id: string
  tenantId: string
  userId: string
  username: string
  module: string
  operation: string
  method: string
  requestUri: string
  requestMethod: string
  ipAddress: string
  userAgent: string
  params?: string
  result?: string
  status: 'SUCCESS' | 'FAILURE'
  durationMs: number
  errorMessage?: string
  createdAt: string
}

export interface AuditLogQueryParams {
  module?: string
  userId?: string
  startTime?: string
  endTime?: string
  page?: number
  size?: number
}

export const auditApi = {
  getList: (params: AuditLogQueryParams) =>
    get<AuditLogDTO[]>('/audit-logs', { params }),
  getById: (id: string) =>
    get<AuditLogDTO>(`/audit-logs/${id}`),
  getModules: () =>
    get<string[]>('/audit-logs/modules'),
}
