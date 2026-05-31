import request from '@/utils/request'

export function getInstrumentList(params?: any) {
  return request({
    url: '/instruments/',
    method: 'get',
    params,
  })
}

export function getInstrumentDetail(id: string) {
  return request({
    url: `/instruments/${id}/`,
    method: 'get',
  })
}

export function createInstrument(data: any) {
  return request({
    url: '/instruments/',
    method: 'post',
    data,
  })
}

export function updateInstrument(id: string, data: any) {
  return request({
    url: `/instruments/${id}/`,
    method: 'put',
    data,
  })
}

export function deleteInstrument(id: string) {
  return request({
    url: `/instruments/${id}/`,
    method: 'delete',
  })
}

export function getInstrumentSlots(id: string, params?: any) {
  return request({
    url: `/instruments/${id}/slots/`,
    method: 'get',
    params,
  })
}

export function getSmartSlots(id: string, date: string, durationHours: number) {
  return request({
    url: `/instruments/${id}/smart_slots/`,
    method: 'get',
    params: {
      date,
      duration_hours: durationHours,
    },
  })
}

export function getPeakHours(id: string, days?: number) {
  return request({
    url: `/instruments/${id}/peak_hours/`,
    method: 'get',
    params: {
      days: days || 30,
    },
  })
}
