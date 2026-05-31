import request from '@/utils/request'

export function getRecordList(params?: any) {
  return request({
    url: '/records/',
    method: 'get',
    params,
  })
}

export function getRecordDetail(id: string) {
  return request({
    url: `/records/${id}/`,
    method: 'get',
  })
}

export function createRecord(data: any) {
  return request({
    url: '/records/',
    method: 'post',
    data,
  })
}

export function updateRecord(id: string, data: any) {
  return request({
    url: `/records/${id}/`,
    method: 'put',
    data,
  })
}

export function getAuditLogList(params?: any) {
  return request({
    url: '/audit-logs/',
    method: 'get',
    params,
  })
}

export function exportRecords(params?: any) {
  return request({
    url: '/records/export/',
    method: 'get',
    params,
    responseType: 'blob',
  })
}

export function evaluateRecord(id: string, data: any) {
  return request({
    url: `/records/${id}/evaluate/`,
    method: 'post',
    data,
  })
}

export function getRecordEvaluations(id: string) {
  return request({
    url: `/records/${id}/evaluations/`,
    method: 'get',
  })
}

export function flagViolation(id: string, data: any) {
  return request({
    url: `/records/${id}/flag_violation/`,
    method: 'post',
    data,
  })
}

export function getRecordViolations(id: string) {
  return request({
    url: `/records/${id}/violations/`,
    method: 'get',
  })
}
